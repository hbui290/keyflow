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
      name: 'KeyFlow Storage',
      ok: true,
      details: `${paths.switchHome}`,
    })
  } catch (error: any) {
    checks.push({
      name: 'KeyFlow Storage',
      ok: false,
      details: (error as Error).message,
    })
  }

  try {
    const state = await ProfileService.readState()
    checks.push({
      name: 'Accounts Database',
      ok: true,
      details: `${state.accounts.length} account(s) tracked`,
    })

    for (const account of state.accounts) {
      try {
        await fs.access(account.profileDir)
        const { authPath, json } = await SessionService.readAuthFile(account.profileDir)
        const tokens = SessionService.extractAuthTokens(authPath, json)
        SessionService.validateChatGptAuth(tokens)
        checks.push({
          name: `Account: ${account.label}`,
          ok: true,
          details: `${tokens.authMode ?? 'chatgpt'} session active`,
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
      name: 'Accounts Database',
      ok: false,
      details: (error as Error).message,
    })
  }

  return {
    generatedAt: Date.now(),
    checks,
  }
}
