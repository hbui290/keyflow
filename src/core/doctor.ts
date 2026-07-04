import fs from 'node:fs/promises'
import { ProfileService } from './ProfileService.js'
import { SessionService } from './SessionService.js'
import type { DoctorCheck, DoctorReport } from './types.js'

export async function runDoctor(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  const paths = ProfileService.getPaths()

  const codexVersion = await SessionService.runProcessAsync(SessionService.resolveCodexExecutable(), ['--version'])

  checks.push({
    name: 'Codex Engine',
    ok: (codexVersion.status ?? 1) === 0,
    details:
      (codexVersion.status ?? 1) === 0
        ? (codexVersion.stdout ?? '').trim() || 'Codex CLI is available'
        : (codexVersion.stderr ?? '').trim() || 'Codex CLI command failed',
  })

  try {
    await ProfileService.ensureSwitchDirs()
    checks.push({
      name: 'KeyFlow Data Dir',
      ok: true,
      details: `${paths.keyflowHome}`,
    })
  } catch (error: any) {
    checks.push({
      name: 'KeyFlow Data Dir',
      ok: false,
      details: (error as Error).message,
    })
  }

  try {
    const state = await ProfileService.readState()
    checks.push({
      name: 'Accounts Store',
      ok: true,
      details: `${state.accounts.length} profile(s) configured`,
    })

    for (const account of state.accounts) {
      try {
        await fs.access(account.profileDir)
        const { authPath, json } = await SessionService.readAuthFile(account.profileDir)
        const tokens = SessionService.extractAuthTokens(authPath, json)
        SessionService.validateChatGptAuth(tokens)

        if (account.usage.status === 'relogin_required') {
          throw new Error('session expired, re-login required')
        } else if (account.usage.status === 'error') {
          throw new Error(account.usage.error ?? 'session error')
        }

        checks.push({
          name: `Account: ${account.label}`,
          ok: true,
          details: `${tokens.authMode ?? 'chatgpt'} connection is active`,
        })
      } catch (error: any) {
        checks.push({
          name: `Account: ${account.label}`,
          ok: false,
          details: (error as Error).message,
        })
      }
    }
  } catch (error: any) {
    checks.push({
      name: 'Accounts Store',
      ok: false,
      details: (error as Error).message,
    })
  }

  return {
    generatedAt: Date.now(),
    checks,
  }
}
