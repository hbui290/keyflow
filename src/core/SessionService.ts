import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { Account, AuthTokens, SwitchResult } from './types.js'
import { ProfileService } from './ProfileService.js'

const REFRESH_ENDPOINT = 'https://auth.openai.com/oauth/token'
const REFRESH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const CHATGPT_LOGIN_CONFIG = ['-c', 'forced_login_method="chatgpt"', '-c', 'cli_auth_credentials_store="file"'] as const
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const LOGIN_AUTH_POLL_MS = 500
const MAX_LOGIN_OUTPUT_CHARS = 20_000
const CODEX_APP_PATH = '/Applications/Codex.app'
const MACOS_CODEX_EXECUTABLE = '/Applications/Codex.app/Contents/Resources/codex'

export class SessionService {
  static isExecutable(filePath: string): boolean {
    try {
      const fsSync = require('node:fs')
      fsSync.accessSync(filePath, fsSync.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  static resolveCodexExecutable(env: NodeJS.ProcessEnv = process.env): string {
    const explicitPath = (env.KEYFLOW_CODEX_PATH || env.KFL_CODEX_PATH || env.CSW_CODEX_PATH || env.CODEX_SWITCH_CODEX_PATH)?.trim()
    if (explicitPath && this.isExecutable(explicitPath)) return explicitPath

    const pathValue = env.PATH ?? ''
    for (const directory of pathValue.split(path.delimiter)) {
      if (!directory) continue
      const candidate = path.join(directory, 'codex')
      if (this.isExecutable(candidate)) return candidate
    }

    if (process.platform === 'darwin' && this.isExecutable(MACOS_CODEX_EXECUTABLE)) {
      return MACOS_CODEX_EXECUTABLE
    }
    return 'codex'
  }

  static runProcessAsync(executable: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const process = spawn(executable, args, { stdio: 'pipe' })
      let stdout = ''
      let stderr = ''
      process.stdout?.on('data', (chunk) => {
        stdout += String(chunk)
      })
      process.stderr?.on('data', (chunk) => {
        stderr += String(chunk)
      })
      process.on('close', (code) => {
        resolve({ status: code, stdout, stderr })
      })
      process.on('error', () => {
        resolve({ status: 1, stdout, stderr })
      })
    })
  }

  static async restartCodexDesktopApp() {
    if (process.platform !== 'darwin') return
    try {
      await fs.access(CODEX_APP_PATH)
    } catch {
      return
    }

    const checkRunning = async (): Promise<boolean> => {
      const result = await this.runProcessAsync('pgrep', ['-f', '/Applications/Codex.app'])
      return (result.status ?? 1) === 0
    }

    if (await checkRunning()) {
      await this.runProcessAsync('osascript', ['-e', 'tell application "Codex" to quit'])
      await new Promise((r) => setTimeout(r, 900))

      if (await checkRunning()) {
        await this.runProcessAsync('pkill', ['-TERM', '-f', '/Applications/Codex.app'])
        await new Promise((r) => setTimeout(r, 600))
      }
    }
    spawn('open', ['-a', CODEX_APP_PATH], { stdio: 'ignore' }).unref()
  }

  static async switchToAccount(account: Account): Promise<SwitchResult> {
    const paths = ProfileService.getPaths()
    const sourceAuth = path.join(account.profileDir, 'auth.json')

    await ProfileService.ensurePrivateDir(paths.codexHome)
    await ProfileService.ensurePrivateDir(paths.backupsDir)
    await ProfileService.ensurePrivateDir(account.profileDir)
    await ProfileService.chmodPrivateFile(sourceAuth)

    await fs.access(sourceAuth)

    let backupPath: string | null = null
    try {
      await fs.access(paths.codexAuthPath)
      backupPath = path.join(paths.backupsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-auth.json`)
      await ProfileService.copyPrivateFile(paths.codexAuthPath, backupPath)
    } catch {
      backupPath = null
    }

    await ProfileService.copyPrivateFile(sourceAuth, paths.codexAuthPath)
    await this.restartCodexDesktopApp()

    const statusResult = await this.runProcessAsync(this.resolveCodexExecutable(), ['login', 'status'])
    return {
      backupPath,
      codexStatusExitCode: statusResult.status ?? 1,
      codexStatusStdout: statusResult.stdout,
      codexStatusStderr: statusResult.stderr,
    }
  }

  static async readAuthFile(profileDir: string) {
    const authPath = path.join(profileDir, 'auth.json')
    const raw = await fs.readFile(authPath, 'utf8')
    await ProfileService.ensurePrivateDir(profileDir)
    await ProfileService.chmodPrivateFile(authPath)
    const json = JSON.parse(raw) as Record<string, unknown>
    return { authPath, json }
  }

  static extractAuthTokens(authPath: string, json: Record<string, any>): AuthTokens {
    const apiKey = typeof json.OPENAI_API_KEY === 'string' ? json.OPENAI_API_KEY.trim() : ''
    if (apiKey) {
      return {
        accessToken: apiKey,
        refreshToken: null,
        idToken: null,
        accountId: null,
        authMode: typeof json.auth_mode === 'string' ? json.auth_mode : 'api_key',
        lastRefresh: typeof json.last_refresh === 'string' ? new Date(json.last_refresh) : null,
        authPath,
        raw: json,
      }
    }

    const tokens = (json.tokens ?? {}) as Record<string, any>
    const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : ''
    const refreshToken = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null
    const idToken = typeof tokens.id_token === 'string' ? tokens.id_token : null
    const accountId = typeof tokens.account_id === 'string' ? tokens.account_id : null

    if (!accessToken) throw new Error(`No access token found in ${authPath}`)

    return {
      accessToken,
      refreshToken,
      idToken,
      accountId,
      authMode: typeof json.auth_mode === 'string' ? json.auth_mode : null,
      lastRefresh: typeof json.last_refresh === 'string' ? new Date(json.last_refresh) : null,
      authPath,
      raw: json,
    }
  }

  static validateChatGptAuth(tokens: AuthTokens) {
    if (!tokens.accessToken) throw new Error('Auth file has no access token.')
    if (tokens.authMode && tokens.authMode !== 'chatgpt' && tokens.authMode !== 'api_key') {
      throw new Error(`Unexpected auth_mode "${tokens.authMode}". Expected chatgpt.`)
    }
  }

  static async refreshTokens(tokens: AuthTokens): Promise<AuthTokens> {
    if (!tokens.refreshToken) return tokens

    const response = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: REFRESH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        scope: 'openid profile email',
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`OAuth refresh failed (${response.status}): ${body}`)
    }

    const payload = (await response.json()) as Record<string, any>
    const next: AuthTokens = {
      ...tokens,
      accessToken: typeof payload.access_token === 'string' ? payload.access_token : tokens.accessToken,
      refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : tokens.refreshToken,
      idToken: typeof payload.id_token === 'string' ? payload.id_token : tokens.idToken,
      lastRefresh: new Date(),
    }

    await this.saveAuthTokens(next)
    return next
  }

  static async saveAuthTokens(tokens: AuthTokens) {
    const nextTokens: Record<string, any> = {
      ...((tokens.raw.tokens ?? {}) as Record<string, any>),
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    }
    if (tokens.idToken) nextTokens.id_token = tokens.idToken
    if (tokens.accountId) nextTokens.account_id = tokens.accountId

    const payload = {
      ...tokens.raw,
      auth_mode: tokens.raw.auth_mode ?? 'chatgpt',
      last_refresh: new Date().toISOString(),
      tokens: nextTokens,
    }
    await ProfileService.writePrivateFile(tokens.authPath, `${JSON.stringify(payload, null, 2)}\n`)
  }

  static runCodexChatGptLogin(profileDir: string, options?: { mode?: 'browser' | 'device'; stdio?: 'inherit' | 'pipe'; timeoutMs?: number }) {
    const mode = options?.mode ?? 'browser'
    const stdio = options?.stdio ?? 'inherit'
    const timeoutMs = options?.timeoutMs ?? LOGIN_TIMEOUT_MS

    return new Promise<void>((resolve, reject) => {
      const args = ['login', ...CHATGPT_LOGIN_CONFIG]
      if (mode === 'device') args.push('--device-auth')

      const result = spawn(this.resolveCodexExecutable(), args, {
        stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CODEX_HOME: profileDir },
      })

      let settled = false
      let closed = false
      let sentTermination = false
      let stdout = ''
      let stderr = ''
      let isPollingAuth = false
      let authPoll: NodeJS.Timeout | null = null
      let timeout: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (authPoll) clearInterval(authPoll)
        if (timeout) clearTimeout(timeout)
      }

      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        callback()
      }

      const stopProcess = () => {
        if (closed || sentTermination) return
        sentTermination = true
        result.kill('SIGTERM')
        setTimeout(() => { if (!closed) result.kill('SIGKILL') }, 2000)
      }

      const checkAuth = async () => {
        try {
          await fs.access(path.join(profileDir, 'auth.json'))
          return true
        } catch {
          return false
        }
      }

      result.stdout?.setEncoding('utf8')
      result.stderr?.setEncoding('utf8')
      result.stdout?.on('data', (chunk) => {
        stdout = (stdout + chunk).slice(-MAX_LOGIN_OUTPUT_CHARS)
      })
      result.stderr?.on('data', (chunk) => {
        stderr = (stderr + chunk).slice(-MAX_LOGIN_OUTPUT_CHARS)
      })

      result.on('error', (err) => {
        finish(() => reject(new Error(`Failed to execute login: ${err.message}`)))
      })

      result.on('close', (code) => {
        closed = true
        void (async () => {
          if (settled) return
          if ((code ?? 1) === 0 || (await checkAuth())) {
            finish(resolve)
          } else {
            finish(() => reject(new Error(`Login command failed with exit code ${code}. Stderr: ${stderr}`)))
          }
        })()
      })

      authPoll = setInterval(() => {
        if (settled || isPollingAuth) return
        isPollingAuth = true
        void (async () => {
          try {
            if (await checkAuth()) stopProcess()
          } finally {
            isPollingAuth = false
          }
        })()
      }, LOGIN_AUTH_POLL_MS)

      timeout = setTimeout(() => {
        void (async () => {
          if (settled) return
          if (await checkAuth()) {
            stopProcess()
          } else {
            stopProcess()
            finish(() => reject(new Error('Timed out waiting for authentication.')))
          }
        })()
      }, timeoutMs)
    })
  }

  static extractEmailFromIdToken(idToken: string | null): string | null {
    if (!idToken) return null
    const parts = idToken.split('.')
    if (parts.length < 2) return null
    try {
      let normalized = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
      while (normalized.length % 4 !== 0) normalized += '='
      const payloadRaw = Buffer.from(normalized, 'base64').toString('utf8')
      const payload = JSON.parse(payloadRaw) as Record<string, any>
      const email = payload.email ?? payload.preferred_username ?? null
      return email && email.includes('@') ? email : null
    } catch {
      return null
    }
  }

  static async primeAccount(account: Account): Promise<{ success: boolean; message: string }> {
    const { json, authPath } = await this.readAuthFile(account.profileDir)
    let tokens = this.extractAuthTokens(authPath, json)

    try {
      tokens = await this.refreshTokens(tokens)
    } catch (err: any) {
      throw new Error(`Token refresh failed: ${err.message}`)
    }

    let baseUrl = 'https://chatgpt.com/backend-api'
    try {
      const configPath = path.join(account.profileDir, 'config.toml')
      const config = await fs.readFile(configPath, 'utf8')
      const match = config.match(/chatgpt_base_url\s*=\s*["']?([^"'\s]+)["']?/)
      if (match && match[1]) {
        let base = match[1].trim()
        while (base.endsWith('/')) base = base.slice(0, -1)
        if ((base.startsWith('https://chatgpt.com') || base.startsWith('https://chat.openai.com')) && !base.includes('/backend-api')) {
          base += '/backend-api'
        }
        baseUrl = base
      }
    } catch {}

    const conversationUrl = `${baseUrl}/conversation`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://chatgpt.com/',
      'Origin': 'https://chatgpt.com',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    }
    if (tokens.accountId) {
      headers['ChatGPT-Account-Id'] = tokens.accountId
    }

    const payload = {
      action: 'next',
      messages: [
        {
          id: crypto.randomUUID(),
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['hi'] },
          metadata: {},
        },
      ],
      parent_message_id: crypto.randomUUID(),
      model: 'auto',
      timezone_offset_min: -420,
      suggestions: [],
      history_and_training_disabled: true,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)

    try {
      const response = await fetch(conversationUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${text.slice(0, 150)}`)
      }

      return {
        success: true,
        message: `Successfully primed session for account ${account.email ?? account.id}.`,
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Priming request timed out.')
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }
}
