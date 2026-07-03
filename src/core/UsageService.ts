import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AuthTokens, UsageApiResponse, UsageSnapshot, UsageWindow } from './types.js'
import { SessionService } from './SessionService.js'

const DEFAULT_CHATGPT_BASE = 'https://chatgpt.com/backend-api/'
const CHATGPT_USAGE_PATH = '/wham/usage'
const GENERIC_USAGE_PATH = '/api/codex/usage'
const REQUEST_TIMEOUT_MS = 15_000

export class UsageService {
  static buildEmptyUsageSnapshot(): UsageSnapshot {
    return {
      source: 'wham_usage',
      planType: null,
      status: 'never',
      error: null,
      updatedAt: null,
      last5Hours: { usedPercent: null, remainingPercent: null, resetAt: null, windowSeconds: null },
      weekly: { usedPercent: null, remainingPercent: null, resetAt: null, windowSeconds: null },
      rateLimitResets: null,
    }
  }

  static async resolveUsageUrl(profileDir: string): Promise<string> {
    const configPath = path.join(profileDir, 'config.toml')
    let base = DEFAULT_CHATGPT_BASE
    try {
      const config = await fs.readFile(configPath, 'utf8')
      const match = config.match(/^\s*chatgpt_base_url\s*=\s*["']?([^"'\s]+)["']?/m)
      if (match && match[1]) base = match[1].trim()
    } catch {}

    let trimmed = base.trim()
    while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1)
    if ((trimmed.startsWith('https://chatgpt.com') || trimmed.startsWith('https://chat.openai.com')) && !trimmed.includes('/backend-api')) {
      trimmed += '/backend-api'
    }
    const pathName = trimmed.includes('/backend-api') ? CHATGPT_USAGE_PATH : GENERIC_USAGE_PATH
    return `${trimmed}${pathName}`
  }

  static async fetchUsageFromApi(tokens: AuthTokens, usageUrl: string): Promise<UsageApiResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'keyflow/1.0',
      }
      if (tokens.accountId) headers['ChatGPT-Account-Id'] = tokens.accountId

      const response = await fetch(usageUrl, { headers, signal: controller.signal })
      if (!response.ok) {
        const body = await response.text()
        const isDeactivated = body.toLowerCase().includes('deactivated') || body.toLowerCase().includes('disabled')
        if (isDeactivated) {
          throw new Error(`Account deactivated: ${body.slice(0, 200)}`)
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('ChatGPT token expired or invalid. Re-login required.')
        }
        throw new Error(`Usage API error (${response.status}): ${body.slice(0, 200)}`)
      }

      return (await response.json()) as UsageApiResponse
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('Usage API request timed out.')
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }

  static async resolveUsageSnapshot(profileDir: string): Promise<{ usage: UsageSnapshot; warning: string | null }> {
    try {
      const authPath = path.join(profileDir, 'auth.json')
      const raw = await fs.readFile(authPath, 'utf8')
      const json = JSON.parse(raw)
      let tokens = SessionService.extractAuthTokens(authPath, json)

      const ageMs = Date.now() - (tokens.lastRefresh?.getTime() ?? 0)
      if (tokens.refreshToken && (ageMs > 45 * 60 * 1000 || !tokens.lastRefresh)) {
        try {
          tokens = await SessionService.refreshTokens(tokens)
        } catch (e: any) {
          // Silent catch to fallback to old token if network is temporarily down
        }
      }

      const url = await this.resolveUsageUrl(profileDir)
      let data: UsageApiResponse
      try {
        data = await this.fetchUsageFromApi(tokens, url)
      } catch (error: any) {
        // If API returns 401/403 and we have a refresh token, try to refresh and retry once
        if (tokens.refreshToken && (error.message.includes('expired') || error.message.includes('401') || error.message.includes('403') || error.message.includes('Unauthorized'))) {
          try {
            tokens = await SessionService.refreshTokens(tokens)
            data = await this.fetchUsageFromApi(tokens, url)
          } catch {
            throw error
          }
        } else {
          throw error
        }
      }

      let resetsCount: number | null = null
      if (url.includes('/backend-api')) {
        try {
          const resetsUrl = url.replace('/wham/usage', '/wham/rate-limit-reset-credits')
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000)
          const headers: Record<string, string> = {
            Authorization: `Bearer ${tokens.accessToken}`,
            Accept: 'application/json',
            'User-Agent': 'keyflow/1.0',
          }
          if (tokens.accountId) headers['ChatGPT-Account-Id'] = tokens.accountId

          const response = await fetch(resetsUrl, { headers, signal: controller.signal })
          clearTimeout(timeout)
          if (response.ok) {
            const resData = (await response.json()) as { available_count?: number }
            if (typeof resData.available_count === 'number') {
              resetsCount = resData.available_count
            }
          }
        } catch (e) {
          console.error('Failed to fetch rate limit resets:', e)
        }
      }

      const clamp = (val: any) => (typeof val === 'number' && !Number.isNaN(val) ? Math.max(0, Math.min(100, val)) : null)
      const uPercent = clamp(data.rate_limit?.primary_window?.used_percent)
      const primary: UsageWindow = {
        usedPercent: uPercent,
        remainingPercent: uPercent === null ? null : 100 - uPercent,
        resetAt: data.rate_limit?.primary_window?.reset_at ?? null,
        windowSeconds: data.rate_limit?.primary_window?.limit_window_seconds ?? null,
      }

      const wPercent = clamp(data.rate_limit?.secondary_window?.used_percent)
      let weekly: UsageWindow = {
        usedPercent: wPercent,
        remainingPercent: wPercent === null ? null : 100 - wPercent,
        resetAt: data.rate_limit?.secondary_window?.reset_at ?? null,
        windowSeconds: data.rate_limit?.secondary_window?.limit_window_seconds ?? null,
      }

      if (weekly.usedPercent === null && (primary.windowSeconds ?? 0) >= 7 * 24 * 60 * 60) {
        weekly = { ...primary }
      }

      return {
        usage: {
          source: 'wham_usage',
          planType: data.plan_type ?? null,
          status: 'ok',
          error: null,
          updatedAt: Date.now(),
          last5Hours: primary,
          weekly,
          rateLimitResets: resetsCount,
        },
        warning: null,
      }
    } catch (error: any) {
      const message = error?.message ?? String(error)
      if (message.includes('deactivated') || message.includes('disabled')) {
        return {
          usage: { ...this.buildEmptyUsageSnapshot(), status: 'error', error: message, updatedAt: Date.now() },
          warning: message,
        }
      }
      if (message.includes('Re-login required')) {
        return {
          usage: { ...this.buildEmptyUsageSnapshot(), status: 'relogin_required', error: message, updatedAt: Date.now() },
          warning: message,
        }
      }

      // Fallback to local session logs
      let targetEmail: string | null = null
      try {
        const authPath = path.join(profileDir, 'auth.json')
        const raw = await fs.readFile(authPath, 'utf8')
        const json = JSON.parse(raw)
        const tokens = SessionService.extractAuthTokens(authPath, json)
        targetEmail = SessionService.extractEmailFromIdToken(tokens.idToken)
      } catch {}

      const fallback = await this.fetchLatestUsageFromSessions(targetEmail)
      if (fallback) {
        return {
          usage: fallback,
          warning: `API unavailable, using session log snapshot (${new Date(fallback.updatedAt ?? Date.now()).toLocaleString()})`,
        }
      }

      return {
        usage: { ...this.buildEmptyUsageSnapshot(), status: 'stale', error: message, updatedAt: Date.now() },
        warning: message,
      }
    }
  }

  static async fetchLatestUsageFromSessions(targetEmail: string | null): Promise<UsageSnapshot | null> {
    const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions')
    const listFiles = async (dir: string): Promise<string[]> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        return entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort((a, b) => b.localeCompare(a, 'en'))
      } catch {
        return []
      }
    }

    const years = await listFiles(sessionsRoot)
    for (const year of years) {
      const months = await listFiles(path.join(sessionsRoot, year))
      for (const month of months) {
        const days = await listFiles(path.join(sessionsRoot, year, month))
        for (const day of days) {
          try {
            const files = await fs.readdir(path.join(sessionsRoot, year, month, day))
            const sortedFiles = files
              .filter((f) => f.endsWith('.jsonl'))
              .sort((a, b) => b.localeCompare(a, 'en'))

            for (const file of sortedFiles) {
              const filePath = path.join(sessionsRoot, year, month, day, file)
              const parsed = await this.scanLogFile(filePath, targetEmail)
              if (parsed) return parsed
            }
          } catch {}
        }
      }
    }
    return null
  }

  static async scanLogFile(filePath: string, targetEmail: string | null): Promise<UsageSnapshot | null> {
    try {
      const content = await fs.readFile(filePath, 'utf8')
      if (targetEmail && !content.includes(targetEmail)) return null

      const lines = content.split('\n')

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]?.trim()
        if (!line) continue

        if (line.includes('"token_count"') && line.includes('"rate_limits"')) {
          try {
            const json = JSON.parse(line)
            if (json.type === 'event_msg' && json.payload?.type === 'token_count' && json.payload.rate_limits) {
              const rateLimits = json.payload.rate_limits
              const primary = rateLimits.primary
              const secondary = rateLimits.secondary
              const timestamp = json.timestamp ? Date.parse(json.timestamp) : Date.now()

              const clamp = (val: any) => (typeof val === 'number' && !Number.isNaN(val) ? Math.max(0, Math.min(100, val)) : null)
              const pPercent = clamp(primary?.used_percent)
              const sPercent = clamp(secondary?.used_percent)

              return {
                source: 'codex_session_logs',
                planType: rateLimits.plan_type ?? null,
                status: 'ok',
                error: null,
                updatedAt: timestamp,
                last5Hours: {
                  usedPercent: pPercent,
                  remainingPercent: pPercent === null ? null : 100 - pPercent,
                  resetAt: primary?.resets_at ?? null,
                  windowSeconds: primary?.window_minutes ? primary.window_minutes * 60 : null,
                },
                weekly: {
                  usedPercent: sPercent,
                  remainingPercent: sPercent === null ? null : 100 - sPercent,
                  resetAt: secondary?.resets_at ?? null,
                  windowSeconds: secondary?.window_minutes ? secondary.window_minutes * 60 : null,
                },
              }
            }
          } catch {}
        }
      }
    } catch {}
    return null
  }
}
