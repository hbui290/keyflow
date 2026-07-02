export type UsageHealth =
  | 'never'
  | 'ok'
  | 'stale'
  | 'error'
  | 'relogin_required'

export type UsageWindow = {
  usedPercent: number | null
  remainingPercent: number | null
  resetAt: number | null
  windowSeconds: number | null
}

export type UsageSnapshot = {
  source: 'wham_usage' | 'codex_session_logs'
  planType: string | null
  status: UsageHealth
  error: string | null
  updatedAt: number | null
  last5Hours: UsageWindow
  weekly: UsageWindow
  rateLimitResets?: number | null
}

export type Account = {
  id: string
  label: string
  email: string | null
  profileDir: string
  authSignature: string | null
  createdAt: number
  updatedAt: number
  usage: UsageSnapshot
}

export type AppState = {
  activeAccountId: string | null
  accounts: Account[]
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string | null
  idToken: string | null
  accountId: string | null
  authMode: string | null
  lastRefresh: Date | null
  authPath: string
  raw: Record<string, unknown>
}

export type UsageApiWindow = {
  used_percent?: number
  reset_at?: number
  limit_window_seconds?: number
}

export type UsageApiResponse = {
  plan_type?: string | null
  rate_limit?: {
    primary_window?: UsageApiWindow | null
    secondary_window?: UsageApiWindow | null
  } | null
  credits?: {
    has_credits?: boolean
    unlimited?: boolean
    balance?: number | string | null
  } | null
}

export type SwitchResult = {
  backupPath: string | null
  codexStatusExitCode: number
  codexStatusStdout: string
  codexStatusStderr: string
}

export type DoctorCheck = {
  name: string
  ok: boolean
  details: string
}

export type DoctorReport = {
  generatedAt: number
  checks: DoctorCheck[]
}

export type SortMode = 'name' | 'usage_5h' | 'usage_weekly'
