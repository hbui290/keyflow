import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Account, AppState, AuthTokens } from './types.js'
import { SessionService } from './SessionService.js'
import { UsageService } from './UsageService.js'

const SWITCH_HOME = path.join(os.homedir(), '.keyflow')
const STATE_PATH = path.join(SWITCH_HOME, 'state.json')
const PROFILES_DIR = path.join(SWITCH_HOME, 'profiles')
const BACKUPS_DIR = path.join(SWITCH_HOME, 'backups')
const CODEX_HOME = path.join(os.homedir(), '.codex')
const CODEX_AUTH_PATH = path.join(CODEX_HOME, 'auth.json')

export const PRIVATE_DIR_MODE = 0o700
export const PRIVATE_FILE_MODE = 0o600

export class ProfileService {
  static getPaths() {
    return {
      switchHome: SWITCH_HOME,
      statePath: STATE_PATH,
      profilesDir: PROFILES_DIR,
      backupsDir: BACKUPS_DIR,
      codexHome: CODEX_HOME,
      codexAuthPath: CODEX_AUTH_PATH,
    }
  }

  static async ensurePrivateDir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true, mode: PRIVATE_DIR_MODE })
    await fs.chmod(dirPath, PRIVATE_DIR_MODE)
  }

  static async chmodPrivateFile(filePath: string) {
    await fs.chmod(filePath, PRIVATE_FILE_MODE)
  }

  static async writePrivateFile(filePath: string, contents: string) {
    await this.ensurePrivateDir(path.dirname(filePath))
    const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    await fs.writeFile(tmpPath, contents, { mode: PRIVATE_FILE_MODE })
    await this.chmodPrivateFile(tmpPath)
    await fs.rename(tmpPath, filePath)
    await this.chmodPrivateFile(filePath)
  }

  static async copyPrivateFile(sourcePath: string, destinationPath: string) {
    await this.ensurePrivateDir(path.dirname(destinationPath))
    await fs.copyFile(sourcePath, destinationPath)
    await this.chmodPrivateFile(destinationPath)
  }

  static async ensureSwitchDirs() {
    await this.ensurePrivateDir(SWITCH_HOME)
    await this.ensurePrivateDir(PROFILES_DIR)
    await ensurePrivateDir(BACKUPS_DIR)
    async function ensurePrivateDir(dirPath: string) {
      await fs.mkdir(dirPath, { recursive: true, mode: PRIVATE_DIR_MODE })
      await fs.chmod(dirPath, PRIVATE_DIR_MODE)
    }
  }

  static buildEmptyState(): AppState {
    return {
      activeAccountId: null,
      accounts: [],
    }
  }

  static async readState(): Promise<AppState> {
    await this.ensureSwitchDirs()
    try {
      const contents = await fs.readFile(STATE_PATH, 'utf8')
      try {
        await this.chmodPrivateFile(STATE_PATH)
      } catch {}
      const json = JSON.parse(contents)
      return this.sanitizeState(json)
    } catch {
      return this.buildEmptyState()
    }
  }

  static async writeState(state: AppState) {
    await this.ensureSwitchDirs()
    const sanitized = this.sanitizeState(state)
    await this.writePrivateFile(STATE_PATH, `${JSON.stringify(sanitized, null, 2)}\n`)
  }

  static sanitizeState(raw: any): AppState {
    if (!raw || typeof raw !== 'object') return this.buildEmptyState()
    const candidate = raw as Partial<AppState>
    const rawAccounts = Array.isArray(candidate.accounts) ? candidate.accounts : []
    const accounts: Account[] = (rawAccounts as any[])
      .filter((entry) => Boolean(entry && typeof entry === 'object'))
      .map((entry) => {
        const account = entry
        const createdAt = typeof account.createdAt === 'number' ? account.createdAt : Date.now()
        const updatedAt = typeof account.updatedAt === 'number' ? account.updatedAt : createdAt
        const usage = account.usage as Record<string, any> | undefined

        const status =
          usage?.status === 'ok' ||
          usage?.status === 'stale' ||
          usage?.status === 'error' ||
          usage?.status === 'relogin_required' ||
          usage?.status === 'never'
            ? usage.status
            : 'never'
        const source: 'wham_usage' | 'codex_session_logs' = usage?.source === 'codex_session_logs' ? 'codex_session_logs' : 'wham_usage'

        const clamp = (val: any) => {
          if (typeof val !== 'number' || Number.isNaN(val)) return null
          return Math.max(0, Math.min(100, val))
        }

        const pUsed = clamp(usage?.last5Hours?.usedPercent)
        const pRem = clamp(usage?.last5Hours?.remainingPercent)
        const wUsed = clamp(usage?.weekly?.usedPercent)
        const wRem = clamp(usage?.weekly?.remainingPercent)

        return {
          id: typeof account.id === 'string' ? account.id : `account-${randomUUID().slice(0, 8)}`,
          label: typeof account.label === 'string' ? account.label : 'Unnamed',
          email: typeof account.email === 'string' ? account.email : null,
          profileDir: typeof account.profileDir === 'string' ? account.profileDir : '',
          authSignature: typeof account.authSignature === 'string' ? account.authSignature : null,
          createdAt,
          updatedAt,
          usage: {
            source,
            planType: typeof usage?.planType === 'string' ? usage.planType : null,
            status,
            error: typeof usage?.error === 'string' ? usage.error : null,
            updatedAt: typeof usage?.updatedAt === 'number' ? usage.updatedAt : null,
            last5Hours: {
              usedPercent: pUsed,
              remainingPercent: pRem !== null ? pRem : (pUsed !== null ? 100 - pUsed : null),
              resetAt: typeof usage?.last5Hours?.resetAt === 'number' ? usage.last5Hours.resetAt : null,
              windowSeconds: typeof usage?.last5Hours?.windowSeconds === 'number' ? usage.last5Hours.windowSeconds : null,
            },
            weekly: {
              usedPercent: wUsed,
              remainingPercent: wRem !== null ? wRem : (wUsed !== null ? 100 - wUsed : null),
              resetAt: typeof usage?.weekly?.resetAt === 'number' ? usage.weekly.resetAt : null,
              windowSeconds: typeof usage?.weekly?.windowSeconds === 'number' ? usage.weekly.windowSeconds : null,
            },
          },
        }
      })
      .filter((account: Account) => Boolean(account.profileDir))

    let activeAccountId = typeof candidate.activeAccountId === 'string' ? candidate.activeAccountId : null
    if (activeAccountId && !accounts.find((account: Account) => account.id === activeAccountId)) {
      activeAccountId = accounts[0]?.id ?? null
    }
    if (!activeAccountId && accounts.length > 0) {
      activeAccountId = accounts[0].id
    }

    return { activeAccountId, accounts }
  }

  static getActiveAccount(state: AppState) {
    if (!state.accounts.length) return null
    return state.accounts.find((account: Account) => account.id === state.activeAccountId) ?? state.accounts[0]
  }

  static formatStateSummary(state: AppState) {
    const active = this.getActiveAccount(state)
    return {
      activeAccountId: active?.id ?? null,
      activeLabel: active?.label ?? null,
      activeEmail: active?.email ?? null,
      totalAccounts: state.accounts.length,
      accounts: state.accounts.map((account: Account) => ({
        id: account.id,
        label: account.label,
        email: account.email,
        profileDir: account.profileDir,
        authSignature: account.authSignature,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        usage: account.usage,
        isActive: account.id === (active?.id ?? null),
      })),
    }
  }

  static resolveAccountByIdentifier(state: AppState, identifier: string): Account {
    const byId = state.accounts.find((account: Account) => account.id === identifier)
    if (byId) return byId

    const normalized = identifier.trim().toLowerCase()
    const byLabel = state.accounts.filter((account: Account) => account.label.trim().toLowerCase() === normalized)
    if (byLabel.length === 1 && byLabel[0]) return byLabel[0]
    if (byLabel.length > 1) {
      throw new Error(`Identifier "${identifier}" matched multiple labels. Use account ID instead.`)
    }
    throw new Error(`Account "${identifier}" not found.`)
  }

  static computeAuthSignature(tokens: AuthTokens) {
    const email = SessionService.extractEmailFromIdToken(tokens.idToken)
    const hasStableIdentity = Boolean(tokens.accountId || email)
    const seed = hasStableIdentity
      ? [tokens.authMode ?? '', tokens.accountId ?? '', email ?? ''].join('\n')
      : [tokens.authMode ?? '', tokens.accessToken].join('\n')
    return createHash('sha256').update(seed).digest('hex')
  }

  static async syncCurrentCodexFilesToProfile(profileDir: string) {
    const paths = this.getPaths()
    const profileAuthPath = path.join(profileDir, 'auth.json')
    const profileConfigPath = path.join(profileDir, 'config.toml')
    const sourceConfigPath = path.join(paths.codexHome, 'config.toml')

    await this.ensurePrivateDir(profileDir)
    await this.copyPrivateFile(paths.codexAuthPath, profileAuthPath)
    try {
      await this.copyPrivateFile(sourceConfigPath, profileConfigPath)
    } catch {}
  }

  static async ensureCurrentCodexLinked(preferredLabel = 'Current Codex', options?: { refreshUsage?: boolean }) {
    await this.ensureSwitchDirs()
    const refreshUsage = options?.refreshUsage ?? true

    let tokens: AuthTokens
    try {
      const paths = this.getPaths()
      await this.ensurePrivateDir(paths.codexHome)
      const raw = await fs.readFile(paths.codexAuthPath, 'utf8')
      await this.chmodPrivateFile(paths.codexAuthPath)
      const json = JSON.parse(raw)
      tokens = SessionService.extractAuthTokens(paths.codexAuthPath, json)
      SessionService.validateChatGptAuth(tokens)
    } catch {
      return {
        linked: false,
        created: false,
        account: null,
        warning: 'Current Codex account is not logged in yet.',
      }
    }

    const signature = this.computeAuthSignature(tokens)
    const email = SessionService.extractEmailFromIdToken(tokens.idToken)
    const state = await this.readState()
    const matched = state.accounts.find((account: Account) => account.authSignature === signature)

    if (matched) {
      await this.syncCurrentCodexFilesToProfile(matched.profileDir)
      const usageResult = refreshUsage
        ? await UsageService.resolveUsageSnapshot(matched.profileDir)
        : { usage: matched.usage, warning: null }

      const newUsage = usageResult.usage
      if (newUsage.status === 'relogin_required' || newUsage.status === 'error') {
        newUsage.last5Hours = matched.usage.last5Hours ?? newUsage.last5Hours
        newUsage.weekly = matched.usage.weekly ?? newUsage.weekly
        newUsage.planType = matched.usage.planType ?? newUsage.planType
      }

      const shouldPromoteLabel = matched.label === 'Current Codex' || matched.label === matched.email
      const nextMatched: Account = {
        ...matched,
        email: email ?? matched.email ?? null,
        label: email && shouldPromoteLabel ? email : matched.label,
        updatedAt: refreshUsage ? Date.now() : matched.updatedAt,
        usage: newUsage,
      }

      const nextAccounts = state.accounts.map((acc: Account) => (acc.id === nextMatched.id ? nextMatched : acc))
      await this.writeState({
        activeAccountId: nextMatched.id,
        accounts: nextAccounts,
      })

      return {
        linked: true,
        created: false,
        account: nextMatched,
        warning: usageResult.warning,
      }
    }

    const preferred = email ?? preferredLabel
    const label = this.ensureUniqueLabel(preferred, state.accounts)
    const id = `${preferred.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`
    const profileDir = path.join(this.getPaths().profilesDir, id)

    await this.syncCurrentCodexFilesToProfile(profileDir)
    const usageResult = refreshUsage
      ? await UsageService.resolveUsageSnapshot(profileDir)
      : { usage: UsageService.buildEmptyUsageSnapshot(), warning: null }

    const account: Account = {
      id,
      label,
      email,
      profileDir,
      authSignature: signature,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usage: usageResult.usage,
    }

    await this.writeState({
      activeAccountId: account.id,
      accounts: [...state.accounts, account],
    })

    return {
      linked: true,
      created: true,
      account,
      warning: usageResult.warning,
    }
  }

  private static ensureUniqueLabel(base: string, accounts: Account[]) {
    const existing = new Set(accounts.map((account: Account) => account.label.trim().toLowerCase()))
    if (!existing.has(base.trim().toLowerCase())) return base
    let index = 2
    while (existing.has(`${base} ${index}`.toLowerCase())) {
      index += 1
    }
    return `${base} ${index}`
  }

  static async addAccount(label: string, options?: { loginMode?: 'browser' | 'device'; loginStdio?: 'inherit' | 'pipe' }) {
    const trimmed = label.trim()
    if (!trimmed) throw new Error('Label is required.')

    await this.ensureSwitchDirs()
    const state = await this.readState()
    if (state.accounts.some((acc: Account) => acc.label.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`An account with label "${trimmed}" already exists.`)
    }

    const id = `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`
    const profileDir = path.join(this.getPaths().profilesDir, id)
    await this.ensurePrivateDir(profileDir)

    try {
      await SessionService.runCodexChatGptLogin(profileDir, { mode: options?.loginMode, stdio: options?.loginStdio })
      const { json } = await SessionService.readAuthFile(profileDir)
      const tokens = SessionService.extractAuthTokens(path.join(profileDir, 'auth.json'), json)
      SessionService.validateChatGptAuth(tokens)
      const usageResult = await UsageService.resolveUsageSnapshot(profileDir)

      const account: Account = {
        id,
        label: trimmed,
        email: SessionService.extractEmailFromIdToken(tokens.idToken),
        profileDir,
        authSignature: this.computeAuthSignature(tokens),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usage: usageResult.usage,
      }

      await this.writeState({
        activeAccountId: state.activeAccountId ?? id,
        accounts: [...state.accounts, account],
      })
      return { account, warning: usageResult.warning }
    } catch (error) {
      await fs.rm(profileDir, { recursive: true, force: true })
      throw error
    }
  }

  static async removeAccount(identifier: string, purge = false) {
    const state = await this.readState()
    if (state.accounts.length === 0) throw new Error('No accounts to remove.')
    const account = this.resolveAccountByIdentifier(state, identifier)
    const nextAccounts = state.accounts.filter((acc: Account) => acc.id !== account.id)
    const nextActiveId = state.activeAccountId === account.id ? nextAccounts[0]?.id ?? null : state.activeAccountId

    await this.writeState({
      activeAccountId: nextActiveId,
      accounts: nextAccounts,
    })
    if (purge) {
      await fs.rm(account.profileDir, { recursive: true, force: true })
    }
    return { removed: account, activeAccountId: nextActiveId }
  }

  static async reloginAccount(identifier: string, options?: { loginMode?: 'browser' | 'device'; loginStdio?: 'inherit' | 'pipe' }) {
    const state = await this.readState()
    const account = this.resolveAccountByIdentifier(state, identifier)
    if (account.usage.status === 'error' && account.usage.error?.includes('deactivated')) {
      throw new Error(`Account "${account.email ?? account.label}" is deactivated and cannot be re-logged in.`)
    }

    await SessionService.runCodexChatGptLogin(account.profileDir, { mode: options?.loginMode, stdio: options?.loginStdio })
    const { json } = await SessionService.readAuthFile(account.profileDir)
    const tokens = SessionService.extractAuthTokens(path.join(account.profileDir, 'auth.json'), json)
    SessionService.validateChatGptAuth(tokens)
    const usageResult = await UsageService.resolveUsageSnapshot(account.profileDir)

    const nextAccount: Account = {
      ...account,
      email: SessionService.extractEmailFromIdToken(tokens.idToken) ?? account.email,
      authSignature: this.computeAuthSignature(tokens),
      updatedAt: Date.now(),
      usage: usageResult.warning ? account.usage : usageResult.usage,
    }

    const nextAccounts = state.accounts.map((acc: Account) => (acc.id === account.id ? nextAccount : acc))
    await this.writeState({
      activeAccountId: state.activeAccountId,
      accounts: nextAccounts,
    })

    if (state.activeAccountId === account.id) {
      await SessionService.switchToAccount(nextAccount)
    }
    return { account: nextAccount, warning: usageResult.warning, switchedActive: state.activeAccountId === account.id }
  }

  static async useAccount(identifier: string) {
    const state = await this.readState()
    const account = this.resolveAccountByIdentifier(state, identifier)
    if (account.usage.status === 'error' && account.usage.error?.includes('deactivated')) {
      throw new Error(`Account "${account.email ?? account.label}" is deactivated and cannot be used.`)
    }
    if (account.usage.status === 'relogin_required') {
      throw new Error(`Account "${account.email ?? account.label}" requires login before use.`)
    }

    const switchResult = await SessionService.switchToAccount(account)
    const usageResult = await UsageService.resolveUsageSnapshot(account.profileDir)
    const newUsage = usageResult.usage
    if (newUsage.status === 'relogin_required' || newUsage.status === 'error') {
      newUsage.last5Hours = account.usage.last5Hours ?? newUsage.last5Hours
      newUsage.weekly = account.usage.weekly ?? newUsage.weekly
      newUsage.planType = account.usage.planType ?? newUsage.planType
    }

    const nextAccounts = state.accounts.map((acc: Account) =>
      acc.id === account.id
        ? { ...acc, updatedAt: Date.now(), usage: newUsage }
        : acc
    )

    await this.writeState({
      activeAccountId: account.id,
      accounts: nextAccounts,
    })

    return {
      account: nextAccounts.find((acc: Account) => acc.id === account.id) ?? account,
      switchResult,
      warning: usageResult.warning,
    }
  }

  static async refreshUsage(options?: { accountId?: string; all?: boolean }) {
    const state = await this.readState()
    if (state.accounts.length === 0) return { updated: [], state }

    const targets = options?.all
      ? state.accounts
      : [
          options?.accountId
            ? this.resolveAccountByIdentifier(state, options.accountId)
            : state.accounts.find((acc: Account) => acc.id === state.activeAccountId) ?? state.accounts[0],
        ]

    const targetIds = new Set(targets.map((acc: Account) => acc.id))
    const updated = await Promise.all(
      state.accounts
        .filter((acc: Account) => targetIds.has(acc.id))
        .map(async (acc: Account) => {
          const usageResult = await UsageService.resolveUsageSnapshot(acc.profileDir)
          const newUsage = usageResult.usage
          if (newUsage.status === 'relogin_required' || newUsage.status === 'error') {
            newUsage.last5Hours = acc.usage.last5Hours ?? newUsage.last5Hours
            newUsage.weekly = acc.usage.weekly ?? newUsage.weekly
            newUsage.planType = acc.usage.planType ?? newUsage.planType
          }
          return {
            ...acc,
            updatedAt: Date.now(),
            usage: newUsage,
          }
        })
    )

    const nextAccounts = state.accounts.map((acc: Account) => {
      const match = updated.find((u: Account) => u.id === acc.id)
      return match ?? acc
    })

    await this.writeState({
      activeAccountId: state.activeAccountId,
      accounts: nextAccounts,
    })
    return { updated, state: { ...state, accounts: nextAccounts } }
  }
}
