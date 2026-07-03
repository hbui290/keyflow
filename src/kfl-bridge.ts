import { ProfileService } from './core/ProfileService.js'
import { runDoctor } from './core/doctor.js'
import type { Account, AppState, DoctorCheck, DoctorReport, SwitchResult } from './core/types.js'

export type BridgeErrorPayload = {
  message: string
  code: string
}

export type BridgeSuccessResponse<T> = {
  ok: true
  data: T
}

export type BridgeErrorResponse = {
  ok: false
  error: BridgeErrorPayload
}

export type BridgeResponse<T> = BridgeSuccessResponse<T> | BridgeErrorResponse

export type BridgeAccountSummary = ReturnType<typeof toBridgeAccountSummary>

export type BridgeStatusPayload = {
  generatedAt: number
  activeAccountId: string | null
  totalAccounts: number
  activeAccount: BridgeAccountSummary | null
  accounts: BridgeAccountSummary[]
  codexLinked: boolean
}

export type BridgeActionPayload = {
  generatedAt: number
  message: string
  warning: string | null
  affectedAccountId: string | null
  updatedAccountIds: string[]
  state: BridgeStatusPayload
}

export type BridgeLinkCurrentPayload = BridgeActionPayload & {
  linked: boolean
  created: boolean
}

export type BridgeDoctorPayload = DoctorReport & {
  hasFailures: boolean
}

function toBridgeAccountSummary(account: Account, activeAccountId: string | null) {
  const displayName = account.email ?? account.label
  const isBlocked = account.usage.status === 'error' && (account.usage.error?.toLowerCase().includes('deactivated') || account.usage.error?.toLowerCase().includes('disabled') || false)
  const canSwitch = !isBlocked && account.usage.status !== 'relogin_required'

  return {
    id: account.id,
    label: account.label,
    email: account.email,
    displayName,
    profileDir: account.profileDir,
    authSignature: account.authSignature,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    usage: account.usage,
    isActive: account.id === activeAccountId,
    canSwitch,
    isBlocked,
    needsAttention: account.usage.status !== 'ok',
  }
}

export function buildBridgeStatusPayload(state: AppState): BridgeStatusPayload {
  const summary = ProfileService.formatStateSummary(state)
  const active = summary.accounts.find((account) => account.isActive) ?? null

  const activeRaw = active ? state.accounts.find(a => a.id === active.id) ?? null : null
  const codexLinked = ProfileService.isCodexLinkedSync(activeRaw)

  return {
    generatedAt: Date.now(),
    activeAccountId: summary.activeAccountId,
    totalAccounts: summary.totalAccounts,
    activeAccount: active ? toBridgeAccountSummary(active as any, summary.activeAccountId) : null,
    accounts: summary.accounts.map((account) => toBridgeAccountSummary(account as any, summary.activeAccountId)),
    codexLinked,
  }
}

function buildActionPayload(
  state: AppState,
  options: {
    message: string
    warning?: string | null
    affectedAccountId?: string | null
    updatedAccountIds?: string[]
  }
): BridgeActionPayload {
  return {
    generatedAt: Date.now(),
    message: options.message,
    warning: options.warning ?? null,
    affectedAccountId: options.affectedAccountId ?? null,
    updatedAccountIds: options.updatedAccountIds ?? [],
    state: buildBridgeStatusPayload(state),
  } as any
}

export async function bridgeStatus(): Promise<BridgeStatusPayload> {
  return buildBridgeStatusPayload(await ProfileService.readState())
}

export async function bridgeLinkCurrent(): Promise<BridgeLinkCurrentPayload> {
  const result = await ProfileService.ensureCurrentCodexLinked()
  const state = await ProfileService.readState()
  const displayName = result.account?.email ?? result.account?.label ?? 'Current Codex'

  return {
    ...buildActionPayload(state, {
      message: result.linked
        ? result.created
          ? `Linked current account as ${displayName}.`
          : `Current account already linked as ${displayName}.`
        : result.warning ?? 'Current Codex account is not logged in yet.',
      warning: result.warning,
      affectedAccountId: result.account?.id ?? null,
      updatedAccountIds: result.account ? [result.account.id] : [],
    }),
    linked: result.linked,
    created: result.created,
  }
}

export async function bridgeRefresh(options?: {
  active?: boolean
  all?: boolean
  accountId?: string
}): Promise<BridgeActionPayload> {
  const linkResult = await ProfileService.ensureCurrentCodexLinked(undefined, { refreshUsage: false })
  const syncWarning = linkResult.warning
  let targetAccountId = options?.active ? undefined : options?.accountId

  if (!options?.all && !targetAccountId) {
    targetAccountId = linkResult.account?.id ?? undefined
  }

  const result = await ProfileService.refreshUsage({
    all: options?.all ?? false,
    accountId: targetAccountId,
  })

  const message = options?.all
    ? result.updated.length === 0
      ? 'No accounts were refreshed.'
      : `Refreshed ${result.updated.length} account${result.updated.length === 1 ? '' : 's'}.`
    : result.updated[0]
      ? `Refreshed ${result.updated[0].email ?? result.updated[0].label}.`
      : 'No accounts were refreshed.'

  return buildActionPayload(result.state, {
    message,
    warning: syncWarning,
    affectedAccountId: result.updated[0]?.id ?? null,
    updatedAccountIds: result.updated.map((account: Account) => account.id),
  })
}

export async function bridgeUse(accountId: string): Promise<BridgeActionPayload & { switchResult: SwitchResult }> {
  const result = await ProfileService.useAccount(accountId)
  const state = await ProfileService.readState()

  return {
    ...buildActionPayload(state, {
      message: `Switched active account to ${result.account.email ?? result.account.label}.`,
      warning: result.warning,
      affectedAccountId: result.account.id,
      updatedAccountIds: [result.account.id],
    }),
    switchResult: result.switchResult,
  }
}

export async function bridgeAddAccount(options: {
  label: string
  deviceAuth?: boolean
}): Promise<BridgeActionPayload> {
  const result = await ProfileService.addAccount(options.label, {
    loginMode: options.deviceAuth ? 'device' : 'browser',
    loginStdio: 'pipe',
  })
  const state = await ProfileService.readState()

  return buildActionPayload(state, {
    message: `Added account ${result.account.email ?? result.account.label}.`,
    warning: result.warning,
    affectedAccountId: result.account.id,
    updatedAccountIds: [result.account.id],
  })
}

export async function bridgeReloginAccount(options: {
  accountId: string
  deviceAuth?: boolean
}): Promise<BridgeActionPayload> {
  const result = await ProfileService.reloginAccount(options.accountId, {
    loginMode: options.deviceAuth ? 'device' : 'browser',
    loginStdio: 'pipe',
  })
  const state = await ProfileService.readState()

  return buildActionPayload(state, {
    message: `Re-logged in ${result.account.email ?? result.account.label}.`,
    warning: result.warning,
    affectedAccountId: result.account.id,
    updatedAccountIds: [result.account.id],
  })
}

export async function bridgeRemoveAccount(options: {
  accountId: string
  purge?: boolean
}): Promise<BridgeActionPayload> {
  const result = await ProfileService.removeAccount(options.accountId, options.purge ?? false)
  const state = await ProfileService.readState()

  return buildActionPayload(state, {
    message: `Removed account ${result.removed.email ?? result.removed.label}.`,
    affectedAccountId: result.removed.id,
    updatedAccountIds: [],
  })
}

export async function bridgePrime(accountId?: string): Promise<BridgeActionPayload> {
  const { SessionService } = await import('./core/SessionService.js')
  const state = await ProfileService.readState()
  let targetAccount = state.accounts.find((a) => a.id === state.activeAccountId)
  if (accountId) {
    try {
      targetAccount = ProfileService.resolveAccountByIdentifier(state, accountId)
    } catch (err: any) {
      throw new Error(`Account "${accountId}" not found.`)
    }
  }
  if (!targetAccount) {
    throw new Error('No active account configured.')
  }

  const result = await SessionService.primeAccount(targetAccount)
  const { state: nextState } = await ProfileService.refreshUsage({ accountId: targetAccount.id })

  return buildActionPayload(nextState, {
    message: result.message,
    affectedAccountId: targetAccount.id,
    updatedAccountIds: [targetAccount.id],
  })
}

export async function bridgeDoctor(): Promise<BridgeDoctorPayload> {
  const report = await runDoctor()
  return {
    ...report,
    hasFailures: report.checks.some((check: DoctorCheck) => !check.ok),
  }
}

export function printBridgeResponse<T>(response: BridgeResponse<T>) {
  console.log(JSON.stringify(response, null, 2))
}

export async function runBridgeCommand<T>(action: () => Promise<T>) {
  try {
    const data = await action()
    printBridgeResponse<T>({
      ok: true,
      data,
    })
  } catch (error) {
    printBridgeResponse<never>({
      ok: false,
      error: {
        code: 'bridge_error',
        message: (error as Error).message,
      },
    })
    process.exitCode = 1
  }
}
