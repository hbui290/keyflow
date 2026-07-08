import { describe, expect, it } from 'bun:test'
import { ProfileService } from './ProfileService.js'
import { SessionService } from './SessionService.js'
import { UsageService } from './UsageService.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

describe('ProfileService & SessionService Unit Tests', () => {
  describe('ProfileService.sanitizeState', () => {
    it('should sanitize empty state correctly', () => {
      const state = ProfileService.sanitizeState(null)
      expect(state.activeAccountId).toBeNull()
      expect(state.accounts).toEqual([])
    })

    it('should filter out invalid accounts and sanitize data', () => {
      const raw = {
        activeAccountId: 'acc-1',
        accounts: [
          {
            id: 'acc-1',
            label: 'Test Account',
            email: 'test@example.com',
            profileDir: '/path/to/profile',
            usage: {
              status: 'ok',
              source: 'wham_usage',
              last5Hours: { usedPercent: 50 },
            },
          },
          null, // Invalid
          { id: 'acc-2' }, // Invalid (no profileDir)
        ],
      }

      const state = ProfileService.sanitizeState(raw)
      expect(state.activeAccountId).toBe('acc-1')
      expect(state.accounts.length).toBe(1)
      expect(state.accounts[0].label).toBe('Test Account')
      expect(state.accounts[0].usage.last5Hours.usedPercent).toBe(50)
      expect(state.accounts[0].usage.last5Hours.remainingPercent).toBe(50)
    })
  })

  describe('ProfileService.fingerprintAuth', () => {
    it('should compute stable signature based on idToken / email', () => {
      const tokens1 = {
        accessToken: 'access-1',
        refreshToken: null,
        idToken: 'header.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ==.signature', // payload: {email: test@example.com}
        accountId: 'acc-id',
        authMode: 'chatgpt',
        lastRefresh: null,
        authPath: '',
        raw: {},
      }

      const tokens2 = {
        accessToken: 'access-2',
        refreshToken: null,
        idToken: 'header.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ==.signature',
        accountId: 'acc-id',
        authMode: 'chatgpt',
        lastRefresh: null,
        authPath: '',
        raw: {},
      }

      const sig1 = ProfileService.fingerprintAuth(tokens1)
      const sig2 = ProfileService.fingerprintAuth(tokens2)
      expect(sig1).toBe(sig2) // Should match because email & accountId & authMode match
    })
  })

  describe('SessionService.extractEmailFromIdToken', () => {
    it('should extract email from valid JWT idToken', () => {
      // payload: {"email": "boss@example.com"} -> base64url: eyJlbWFpbCI6ImJvc3NAZXhhbXBsZS5jb20ifQ
      const token = 'header.eyJlbWFpbCI6ImJvc3NAZXhhbXBsZS5jb20ifQ.signature'
      const email = SessionService.extractEmailFromIdToken(token)
      expect(email).toBe('boss@example.com')
    })

    it('should return null for invalid JWT', () => {
      expect(SessionService.extractEmailFromIdToken(null)).toBeNull()
      expect(SessionService.extractEmailFromIdToken('invalid-token')).toBeNull()
    })
  })

  describe('SessionService.warmUpAccount', () => {
    it('should return success response when priming account', async () => {
      const originalPrime = SessionService.warmUpAccount
      SessionService.warmUpAccount = async (account) => ({
        success: true,
        message: `Successfully primed session for account ${account.email ?? account.id}.`,
      })

      const mockAccount: any = {
        id: 'acc-mock',
        label: 'Mock Account',
        email: 'mock@example.com',
        profileDir: '/tmp/mock-profile',
      }

      try {
        const result = await SessionService.warmUpAccount(mockAccount)
        expect(result.success).toBe(true)
        expect(result.message).toContain('Successfully primed session for account mock@example.com')
      } finally {
        SessionService.warmUpAccount = originalPrime
      }
    })
  })

  describe('ProfileService.reconcileActiveCodex matching logic', () => {
    it('should match existing account by email even if authSignature is different', async () => {
      const originalReadState = ProfileService.readState
      const originalWriteState = ProfileService.writeState
      const originalGetPaths = ProfileService.getPaths
      const originalSync = ProfileService.syncCodexProfile
      const originalReadAuth = SessionService.readAuthFile
      const originalResolve = UsageService.resolveUsageSnapshot

      let writtenState: any = null

      ProfileService.readState = async () => ({
        activeAccountId: 'acc-old',
        accounts: [
          {
            id: 'acc-old',
            label: 'Old Account',
            email: 'boss@example.com',
            profileDir: '/profiles/acc-old',
            authSignature: 'old-sig',
            usage: { status: 'ok', last5Hours: { usedPercent: 50 } },
          } as any
        ]
      })

      ProfileService.writeState = async (state) => {
        writtenState = state
      }

      const testDir = path.join(os.tmpdir(), `keyflow-test-${Math.random().toString(36).substring(7)}`)
      const codexHome = path.join(testDir, 'codex-home')
      const codexAuthPath = path.join(codexHome, 'auth.json')

      ProfileService.getPaths = () => ({
        keyflowHome: testDir,
        backupsDir: path.join(testDir, 'backups'),
        codexHome,
        codexAuthPath,
        profilesDir: path.join(testDir, 'profiles'),
        statePath: path.join(testDir, 'state.json'),
      })

      ProfileService.syncCodexProfile = async () => {}

      SessionService.readAuthFile = async () => ({
        authPath: codexAuthPath,
        json: {
          tokens: {
            access_token: 'new-access-token',
            id_token: 'header.eyJlbWFpbCI6ImJvc3NAZXhhbXBsZS5jb20ifQ.signature', // boss@example.com
          }
        }
      })

      UsageService.resolveUsageSnapshot = async () => ({
        usage: { status: 'ok', source: 'wham_usage', last5Hours: { usedPercent: 10 } } as any,
        warning: null,
      })

      try {
        await fs.mkdir(codexHome, { recursive: true })
        await fs.writeFile(codexAuthPath, JSON.stringify({
          tokens: {
            access_token: 'new-access-token',
            id_token: 'header.eyJlbWFpbCI6ImJvc3NAZXhhbXBsZS5jb20ifQ.signature',
          }
        }))

        const result = await ProfileService.reconcileActiveCodex()
        expect(result.linked).toBe(true)
        expect(result.created).toBe(false)
        expect(result.account?.id).toBe('acc-old')
        expect(result.account?.authSignature).not.toBe('old-sig') // Should update authSignature
        expect(writtenState).not.toBeNull()
        expect(writtenState.accounts[0].authSignature).not.toBe('old-sig')
      } finally {
        ProfileService.readState = originalReadState
        ProfileService.writeState = originalWriteState
        ProfileService.getPaths = originalGetPaths
        ProfileService.syncCodexProfile = originalSync
        SessionService.readAuthFile = originalReadAuth
        UsageService.resolveUsageSnapshot = originalResolve
        try {
          await fs.rm(testDir, { recursive: true, force: true })
        } catch {}
      }
    })
  })

  describe('UsageService.resolveUsageUrl base URL regex', () => {
    it('should ignore commented out chatgpt_base_url', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-test-regex-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      try {
        const configContent = `# chatgpt_base_url = "https://evil.com"\nchatgpt_base_url = "https://chatgpt.com"\n`
        await fs.writeFile(path.join(testDir, 'config.toml'), configContent)
        const url = await UsageService.resolveUsageUrl(testDir)
        expect(url).toBe('https://chatgpt.com/backend-api/wham/usage')
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })
  })
})

// ---------------------------------------------------------------------------
// SessionService — extractAuthTokens, validateChatGptAuth, resolveCodexExecutable, pruneBackups
// ---------------------------------------------------------------------------
describe('SessionService Unit Tests', () => {
  describe('SessionService.extractAuthTokens', () => {
    it('should extract ChatGPT-style tokens from auth.json', () => {
      const json = {
        auth_mode: 'chatgpt',
        last_refresh: '2025-01-01T00:00:00.000Z',
        tokens: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          id_token: 'mock-id-token',
          account_id: 'mock-account-id',
        },
      }
      const tokens = SessionService.extractAuthTokens('/mock/auth.json', json)
      expect(tokens.accessToken).toBe('mock-access-token')
      expect(tokens.refreshToken).toBe('mock-refresh-token')
      expect(tokens.idToken).toBe('mock-id-token')
      expect(tokens.accountId).toBe('mock-account-id')
      expect(tokens.authMode).toBe('chatgpt')
      expect(tokens.authPath).toBe('/mock/auth.json')
      expect(tokens.lastRefresh).toBeInstanceOf(Date)
      expect(tokens.raw).toBe(json)
    })

    it('should extract API key style tokens', () => {
      const json = {
        OPENAI_API_KEY: 'sk-test-key-123',
        auth_mode: 'api_key',
      }
      const tokens = SessionService.extractAuthTokens('/mock/auth.json', json)
      expect(tokens.accessToken).toBe('sk-test-key-123')
      expect(tokens.refreshToken).toBeNull()
      expect(tokens.idToken).toBeNull()
      expect(tokens.accountId).toBeNull()
      expect(tokens.authMode).toBe('api_key')
    })

    it('should throw when no access token or API key is present', () => {
      const json = { tokens: {} }
      expect(() => SessionService.extractAuthTokens('/mock/auth.json', json)).toThrow('No access token found')
    })

    it('should handle missing optional fields gracefully', () => {
      const json = {
        tokens: {
          access_token: 'some-token',
        },
      }
      const tokens = SessionService.extractAuthTokens('/mock/auth.json', json)
      expect(tokens.accessToken).toBe('some-token')
      expect(tokens.refreshToken).toBeNull()
      expect(tokens.idToken).toBeNull()
      expect(tokens.accountId).toBeNull()
      expect(tokens.authMode).toBeNull()
      expect(tokens.lastRefresh).toBeNull()
    })

    it('should prefer OPENAI_API_KEY over tokens block when both present', () => {
      const json = {
        OPENAI_API_KEY: 'sk-key',
        tokens: { access_token: 'other-token' },
      }
      const tokens = SessionService.extractAuthTokens('/mock/auth.json', json)
      expect(tokens.accessToken).toBe('sk-key')
    })
  })

  describe('SessionService.validateChatGptAuth', () => {
    it('should pass for valid chatgpt auth tokens', () => {
      const tokens: AuthTokens = {
        accessToken: 'valid-token',
        refreshToken: null,
        idToken: null,
        accountId: null,
        authMode: 'chatgpt',
        lastRefresh: null,
        authPath: '/mock/auth.json',
        raw: {},
      }
      expect(() => SessionService.validateChatGptAuth(tokens)).not.toThrow()
    })

    it('should pass for api_key auth mode', () => {
      const tokens: AuthTokens = {
        accessToken: 'sk-key',
        refreshToken: null,
        idToken: null,
        accountId: null,
        authMode: 'api_key',
        lastRefresh: null,
        authPath: '/mock/auth.json',
        raw: {},
      }
      expect(() => SessionService.validateChatGptAuth(tokens)).not.toThrow()
    })

    it('should pass when authMode is null', () => {
      const tokens: AuthTokens = {
        accessToken: 'valid-token',
        refreshToken: null,
        idToken: null,
        accountId: null,
        authMode: null,
        lastRefresh: null,
        authPath: '/mock/auth.json',
        raw: {},
      }
      expect(() => SessionService.validateChatGptAuth(tokens)).not.toThrow()
    })

    it('should throw for empty access token', () => {
      const tokens: AuthTokens = {
        accessToken: '',
        refreshToken: null,
        idToken: null,
        accountId: null,
        authMode: 'chatgpt',
        lastRefresh: null,
        authPath: '/mock/auth.json',
        raw: {},
      }
      expect(() => SessionService.validateChatGptAuth(tokens)).toThrow('no access token')
    })

    it('should throw for unexpected auth mode', () => {
      const tokens: AuthTokens = {
        accessToken: 'valid-token',
        refreshToken: null,
        idToken: null,
        accountId: null,
        authMode: 'google',
        lastRefresh: null,
        authPath: '/mock/auth.json',
        raw: {},
      }
      expect(() => SessionService.validateChatGptAuth(tokens)).toThrow('Unexpected auth_mode')
    })
  })

  describe('SessionService.resolveCodexExecutable', () => {
    it('should return explicit path from KEYFLOW_CODEX_PATH when executable exists', () => {
      const originalIsExecutable = SessionService.isExecutable
      SessionService.isExecutable = (p: string) => p === '/custom/codex'
      try {
        const result = SessionService.resolveCodexExecutable({ KEYFLOW_CODEX_PATH: '/custom/codex', PATH: '' })
        expect(result).toBe('/custom/codex')
      } finally {
        SessionService.isExecutable = originalIsExecutable
      }
    })

    it('should fall back to PATH search when env var is not set', () => {
      const originalIsExecutable = SessionService.isExecutable
      SessionService.isExecutable = (p: string) => p === '/usr/local/bin/codex'
      try {
        const result = SessionService.resolveCodexExecutable({ PATH: '/usr/bin:/usr/local/bin' })
        expect(result).toBe('/usr/local/bin/codex')
      } finally {
        SessionService.isExecutable = originalIsExecutable
      }
    })

    it('should return fallback "codex" when nothing is found', () => {
      const originalIsExecutable = SessionService.isExecutable
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })
      SessionService.isExecutable = () => false
      try {
        const result = SessionService.resolveCodexExecutable({ PATH: '/usr/bin' })
        expect(result).toBe('codex')
      } finally {
        SessionService.isExecutable = originalIsExecutable
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it('should check KFL_CODEX_PATH as an alternative env var', () => {
      const originalIsExecutable = SessionService.isExecutable
      SessionService.isExecutable = (p: string) => p === '/alt/codex'
      try {
        const result = SessionService.resolveCodexExecutable({ KFL_CODEX_PATH: '/alt/codex', PATH: '' })
        expect(result).toBe('/alt/codex')
      } finally {
        SessionService.isExecutable = originalIsExecutable
      }
    })
  })

  describe('SessionService.extractEmailFromIdToken (extended)', () => {
    it('should extract preferred_username when email is absent', () => {
      // {"preferred_username": "admin@example.com"} -> base64url
      const payload = Buffer.from(JSON.stringify({ preferred_username: 'admin@example.com' })).toString('base64url')
      const token = `header.${payload}.signature`
      expect(SessionService.extractEmailFromIdToken(token)).toBe('admin@example.com')
    })

    it('should return null when payload has no email-like field', () => {
      const payload = Buffer.from(JSON.stringify({ sub: '12345' })).toString('base64url')
      const token = `header.${payload}.signature`
      expect(SessionService.extractEmailFromIdToken(token)).toBeNull()
    })

    it('should return null for a value without @ symbol', () => {
      const payload = Buffer.from(JSON.stringify({ email: 'not-an-email' })).toString('base64url')
      const token = `header.${payload}.signature`
      expect(SessionService.extractEmailFromIdToken(token)).toBeNull()
    })

    it('should handle base64url padding variations', () => {
      const payload = Buffer.from(JSON.stringify({ email: 'padded@example.com' })).toString('base64url')
      const token = `header.${payload}.signature`
      expect(SessionService.extractEmailFromIdToken(token)).toBe('padded@example.com')
    })
  })

  describe('SessionService.pruneBackups', () => {
    it('should keep only the 10 most recent backups', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-prune-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      try {
        for (let i = 0; i < 15; i++) {
          const name = `2025-01-${String(i + 1).padStart(2, '0')}T00-00-00-000Z-auth.json`
          await fs.writeFile(path.join(testDir, name), '{}')
          // stagger mtimes so sort is deterministic
          const ts = new Date(2025, 0, i + 1)
          await fs.utimes(path.join(testDir, name), ts, ts)
        }

        await SessionService.pruneBackups(testDir)
        const remaining = (await fs.readdir(testDir)).filter(f => f.endsWith('-auth.json'))
        expect(remaining.length).toBe(10)
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should not delete anything when there are 10 or fewer backups', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-prune-few-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      try {
        for (let i = 0; i < 5; i++) {
          await fs.writeFile(path.join(testDir, `backup-${i}-auth.json`), '{}')
        }
        await SessionService.pruneBackups(testDir)
        const remaining = (await fs.readdir(testDir)).filter(f => f.endsWith('-auth.json'))
        expect(remaining.length).toBe(5)
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should not throw for a non-existent directory', async () => {
      await expect(SessionService.pruneBackups('/nonexistent/path')).resolves.toBeUndefined()
    })
  })
})

// ---------------------------------------------------------------------------
// UsageService — buildEmptyUsageSnapshot, resolveUsageUrl edge cases, scanLogFile
// ---------------------------------------------------------------------------
describe('UsageService Unit Tests', () => {
  describe('UsageService.buildEmptyUsageSnapshot', () => {
    it('should return a snapshot with status "never" and null fields', () => {
      const snapshot = UsageService.buildEmptyUsageSnapshot()
      expect(snapshot.status).toBe('never')
      expect(snapshot.source).toBe('wham_usage')
      expect(snapshot.planType).toBeNull()
      expect(snapshot.error).toBeNull()
      expect(snapshot.updatedAt).toBeNull()
      expect(snapshot.last5Hours.usedPercent).toBeNull()
      expect(snapshot.last5Hours.remainingPercent).toBeNull()
      expect(snapshot.last5Hours.resetAt).toBeNull()
      expect(snapshot.last5Hours.windowSeconds).toBeNull()
      expect(snapshot.weekly.usedPercent).toBeNull()
      expect(snapshot.weekly.remainingPercent).toBeNull()
      expect(snapshot.rateLimitResets).toBeNull()
    })
  })

  describe('UsageService.resolveUsageUrl', () => {
    it('should return default chatgpt URL when no config exists', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-url-noconf-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      try {
        const url = await UsageService.resolveUsageUrl(testDir)
        expect(url).toBe('https://chatgpt.com/backend-api/wham/usage')
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should append /backend-api for chat.openai.com base', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-url-openai-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      try {
        await fs.writeFile(path.join(testDir, 'config.toml'), 'chatgpt_base_url = "https://chat.openai.com"\n')
        const url = await UsageService.resolveUsageUrl(testDir)
        expect(url).toBe('https://chat.openai.com/backend-api/wham/usage')
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should use generic usage path for non-chatgpt base URL', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-url-custom-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      try {
        await fs.writeFile(path.join(testDir, 'config.toml'), 'chatgpt_base_url = "https://custom-api.example.com"\n')
        const url = await UsageService.resolveUsageUrl(testDir)
        expect(url).toBe('https://custom-api.example.com/api/codex/usage')
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should strip trailing slashes from the base URL', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-url-slash-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      try {
        await fs.writeFile(path.join(testDir, 'config.toml'), 'chatgpt_base_url = "https://chatgpt.com///"\n')
        const url = await UsageService.resolveUsageUrl(testDir)
        expect(url).toBe('https://chatgpt.com/backend-api/wham/usage')
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should use wham path when base already contains /backend-api', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-url-backendapi-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      try {
        await fs.writeFile(path.join(testDir, 'config.toml'), 'chatgpt_base_url = "https://chatgpt.com/backend-api"\n')
        const url = await UsageService.resolveUsageUrl(testDir)
        expect(url).toBe('https://chatgpt.com/backend-api/wham/usage')
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })
  })

  describe('UsageService.scanLogFile', () => {
    it('should parse usage from a valid session log file', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-scan-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      const logPath = path.join(testDir, 'session.jsonl')
      try {
        const logEntry = JSON.stringify({
          type: 'event_msg',
          timestamp: '2025-06-01T12:00:00.000Z',
          payload: {
            type: 'token_count',
            rate_limits: {
              plan_type: 'plus',
              primary: { used_percent: 25, resets_at: 1717243200, window_minutes: 300 },
              secondary: { used_percent: 10, resets_at: 1717848000, window_minutes: 10080 },
            },
          },
        })
        await fs.writeFile(logPath, `${logEntry}\n`)

        const result = await UsageService.scanLogFile(logPath, null)
        expect(result).not.toBeNull()
        expect(result!.source).toBe('codex_session_logs')
        expect(result!.status).toBe('ok')
        expect(result!.planType).toBe('plus')
        expect(result!.last5Hours.usedPercent).toBe(25)
        expect(result!.last5Hours.remainingPercent).toBe(75)
        expect(result!.last5Hours.windowSeconds).toBe(18000) // 300 * 60
        expect(result!.weekly.usedPercent).toBe(10)
        expect(result!.weekly.remainingPercent).toBe(90)
        expect(result!.weekly.windowSeconds).toBe(604800) // 10080 * 60
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should return null when file does not contain matching email', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-scan-noemail-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      const logPath = path.join(testDir, 'session.jsonl')
      try {
        const logEntry = JSON.stringify({
          type: 'event_msg',
          payload: { type: 'token_count', rate_limits: { primary: { used_percent: 50 } } },
        })
        await fs.writeFile(logPath, logEntry)

        const result = await UsageService.scanLogFile(logPath, 'nomatch@example.com')
        expect(result).toBeNull()
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should return null for a file with no usage entries', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-scan-empty-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      const logPath = path.join(testDir, 'session.jsonl')
      try {
        await fs.writeFile(logPath, '{"type":"other"}\n{"type":"other2"}\n')
        const result = await UsageService.scanLogFile(logPath, null)
        expect(result).toBeNull()
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should return null for a non-existent file', async () => {
      const result = await UsageService.scanLogFile('/nonexistent/file.jsonl', null)
      expect(result).toBeNull()
    })

    it('should pick the last matching entry when multiple exist', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-scan-multi-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      const logPath = path.join(testDir, 'session.jsonl')
      try {
        const entry1 = JSON.stringify({
          type: 'event_msg',
          timestamp: '2025-06-01T10:00:00.000Z',
          payload: {
            type: 'token_count',
            rate_limits: { primary: { used_percent: 10 }, secondary: { used_percent: 5 } },
          },
        })
        const entry2 = JSON.stringify({
          type: 'event_msg',
          timestamp: '2025-06-01T12:00:00.000Z',
          payload: {
            type: 'token_count',
            rate_limits: { primary: { used_percent: 80 }, secondary: { used_percent: 40 } },
          },
        })
        await fs.writeFile(logPath, `${entry1}\n${entry2}\n`)

        const result = await UsageService.scanLogFile(logPath, null)
        expect(result).not.toBeNull()
        expect(result!.last5Hours.usedPercent).toBe(80)
        expect(result!.weekly.usedPercent).toBe(40)
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })

    it('should clamp used_percent values to 0-100 range', async () => {
      const testDir = path.join(os.tmpdir(), `keyflow-scan-clamp-${Math.random().toString(36).substring(7)}`)
      await fs.mkdir(testDir, { recursive: true })
      const logPath = path.join(testDir, 'session.jsonl')
      try {
        const entry = JSON.stringify({
          type: 'event_msg',
          payload: {
            type: 'token_count',
            rate_limits: { primary: { used_percent: 150 }, secondary: { used_percent: -10 } },
          },
        })
        await fs.writeFile(logPath, `${entry}\n`)
        const result = await UsageService.scanLogFile(logPath, null)
        expect(result).not.toBeNull()
        expect(result!.last5Hours.usedPercent).toBe(100)
        expect(result!.weekly.usedPercent).toBe(0)
      } finally {
        await fs.rm(testDir, { recursive: true, force: true })
      }
    })
  })
})

// ---------------------------------------------------------------------------
// ProfileService — buildEmptyState, getActiveAccount, formatStateSummary,
//                  resolveAccountByIdentifier, sanitizeState edge cases
// ---------------------------------------------------------------------------
describe('ProfileService Unit Tests', () => {
  describe('ProfileService.buildEmptyState', () => {
    it('should return state with null activeAccountId and empty accounts', () => {
      const state = ProfileService.buildEmptyState()
      expect(state.activeAccountId).toBeNull()
      expect(state.accounts).toEqual([])
    })
  })

  describe('ProfileService.getActiveAccount', () => {
    it('should return null for empty state', () => {
      const state: AppState = { activeAccountId: null, accounts: [] }
      expect(ProfileService.getActiveAccount(state)).toBeNull()
    })

    it('should return the account matching activeAccountId', () => {
      const accounts = [
        makeAccount({ id: 'acc-1', label: 'First' }),
        makeAccount({ id: 'acc-2', label: 'Second' }),
      ]
      const state: AppState = { activeAccountId: 'acc-2', accounts }
      const active = ProfileService.getActiveAccount(state)
      expect(active?.id).toBe('acc-2')
      expect(active?.label).toBe('Second')
    })

    it('should fall back to first account when activeAccountId does not match', () => {
      const accounts = [
        makeAccount({ id: 'acc-1', label: 'First' }),
        makeAccount({ id: 'acc-2', label: 'Second' }),
      ]
      const state: AppState = { activeAccountId: 'nonexistent', accounts }
      const active = ProfileService.getActiveAccount(state)
      expect(active?.id).toBe('acc-1')
    })
  })

  describe('ProfileService.resolveAccountByIdentifier', () => {
    const accounts = [
      makeAccount({ id: 'acc-1', label: 'Personal' }),
      makeAccount({ id: 'acc-2', label: 'Work' }),
    ]
    const state: AppState = { activeAccountId: 'acc-1', accounts }

    it('should resolve by id', () => {
      const result = ProfileService.resolveAccountByIdentifier(state, 'acc-2')
      expect(result.id).toBe('acc-2')
    })

    it('should resolve by label (case-insensitive)', () => {
      const result = ProfileService.resolveAccountByIdentifier(state, 'personal')
      expect(result.id).toBe('acc-1')
    })

    it('should throw for unknown identifier', () => {
      expect(() => ProfileService.resolveAccountByIdentifier(state, 'unknown')).toThrow('not found')
    })

    it('should throw when multiple accounts share the same label', () => {
      const dupeState: AppState = {
        activeAccountId: 'acc-1',
        accounts: [
          makeAccount({ id: 'acc-1', label: 'Shared' }),
          makeAccount({ id: 'acc-2', label: 'Shared' }),
        ],
      }
      expect(() => ProfileService.resolveAccountByIdentifier(dupeState, 'shared')).toThrow('multiple labels')
    })
  })

  describe('ProfileService.formatStateSummary', () => {
    it('should return summary with correct active account', () => {
      const accounts = [
        makeAccount({ id: 'acc-1', label: 'First', email: 'first@example.com' }),
        makeAccount({ id: 'acc-2', label: 'Second', email: 'second@example.com' }),
      ]
      const state: AppState = { activeAccountId: 'acc-2', accounts }
      const summary = ProfileService.formatStateSummary(state)

      expect(summary.activeAccountId).toBe('acc-2')
      expect(summary.activeLabel).toBe('Second')
      expect(summary.activeEmail).toBe('second@example.com')
      expect(summary.totalAccounts).toBe(2)
      expect(summary.accounts.length).toBe(2)
      expect(summary.accounts[0].isActive).toBe(false)
      expect(summary.accounts[1].isActive).toBe(true)
    })

    it('should return nulls when no accounts exist', () => {
      const state: AppState = { activeAccountId: null, accounts: [] }
      const summary = ProfileService.formatStateSummary(state)
      expect(summary.activeAccountId).toBeNull()
      expect(summary.activeLabel).toBeNull()
      expect(summary.activeEmail).toBeNull()
      expect(summary.totalAccounts).toBe(0)
    })
  })

  describe('ProfileService.sanitizeState edge cases', () => {
    it('should handle non-object input', () => {
      expect(ProfileService.sanitizeState(undefined).accounts).toEqual([])
      expect(ProfileService.sanitizeState('string').accounts).toEqual([])
      expect(ProfileService.sanitizeState(42).accounts).toEqual([])
    })

    it('should assign a generated id when id is missing', () => {
      const raw = {
        accounts: [{ label: 'Test', profileDir: '/p', email: 'a@example.com' }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.accounts.length).toBe(1)
      expect(state.accounts[0].id).toMatch(/^account-/)
    })

    it('should default label to "Unnamed" when missing', () => {
      const raw = {
        accounts: [{ id: 'acc-1', profileDir: '/p' }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.accounts[0].label).toBe('Unnamed')
    })

    it('should clamp usage percentages to 0-100', () => {
      const raw = {
        accounts: [{
          id: 'acc-1',
          label: 'Test',
          profileDir: '/p',
          usage: {
            status: 'ok',
            last5Hours: { usedPercent: 200 },
            weekly: { usedPercent: -50 },
          },
        }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.accounts[0].usage.last5Hours.usedPercent).toBe(100)
      expect(state.accounts[0].usage.weekly.usedPercent).toBe(0)
    })

    it('should compute remainingPercent from usedPercent when not explicitly set', () => {
      const raw = {
        accounts: [{
          id: 'acc-1',
          label: 'Test',
          profileDir: '/p',
          usage: {
            status: 'ok',
            last5Hours: { usedPercent: 30 },
            weekly: { usedPercent: 60 },
          },
        }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.accounts[0].usage.last5Hours.remainingPercent).toBe(70)
      expect(state.accounts[0].usage.weekly.remainingPercent).toBe(40)
    })

    it('should fall back activeAccountId to first account when id does not match', () => {
      const raw = {
        activeAccountId: 'nonexistent',
        accounts: [{ id: 'acc-1', label: 'Test', profileDir: '/p' }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.activeAccountId).toBe('acc-1')
    })

    it('should auto-set activeAccountId to first account when null', () => {
      const raw = {
        activeAccountId: null,
        accounts: [{ id: 'acc-1', label: 'Test', profileDir: '/p' }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.activeAccountId).toBe('acc-1')
    })

    it('should default usage status to "never" for invalid status values', () => {
      const raw = {
        accounts: [{
          id: 'acc-1',
          label: 'Test',
          profileDir: '/p',
          usage: { status: 'invalid_status' },
        }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.accounts[0].usage.status).toBe('never')
    })

    it('should set source to codex_session_logs when specified', () => {
      const raw = {
        accounts: [{
          id: 'acc-1',
          label: 'Test',
          profileDir: '/p',
          usage: { status: 'ok', source: 'codex_session_logs' },
        }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.accounts[0].usage.source).toBe('codex_session_logs')
    })

    it('should default source to wham_usage for unknown source values', () => {
      const raw = {
        accounts: [{
          id: 'acc-1',
          label: 'Test',
          profileDir: '/p',
          usage: { status: 'ok', source: 'unknown_source' },
        }],
      }
      const state = ProfileService.sanitizeState(raw)
      expect(state.accounts[0].usage.source).toBe('wham_usage')
    })
  })

  describe('ProfileService.computeAuthSignature edge cases', () => {
    it('should produce different signatures for different auth modes', () => {
      const base = {
        accessToken: 'token',
        refreshToken: null,
        idToken: 'header.eyJlbWFpbCI6InRAZXhhbXBsZS5jb20ifQ.sig',
        accountId: 'acc',
        lastRefresh: null,
        authPath: '',
        raw: {},
      }
      const sig1 = ProfileService.computeAuthSignature({ ...base, authMode: 'chatgpt' })
      const sig2 = ProfileService.computeAuthSignature({ ...base, authMode: 'api_key' })
      expect(sig1).not.toBe(sig2)
    })

    it('should fall back to accessToken seed when no stable identity exists', () => {
      const tokens1: AuthTokens = {
        accessToken: 'token-A',
        refreshToken: null,
        idToken: null,
        accountId: null,
        authMode: null,
        lastRefresh: null,
        authPath: '',
        raw: {},
      }
      const tokens2: AuthTokens = {
        accessToken: 'token-B',
        refreshToken: null,
        idToken: null,
        accountId: null,
        authMode: null,
        lastRefresh: null,
        authPath: '',
        raw: {},
      }
      const sig1 = ProfileService.computeAuthSignature(tokens1)
      const sig2 = ProfileService.computeAuthSignature(tokens2)
      expect(sig1).not.toBe(sig2)
    })
  })
})

// ---------------------------------------------------------------------------
// kfl-bridge — toBridgeAccountSummary, buildBridgeStatusPayload
// ---------------------------------------------------------------------------
import { buildBridgeStatusPayload } from '../kfl-bridge.js'
import type { Account, AppState, AuthTokens } from './types.js'

describe('kfl-bridge Unit Tests', () => {
  describe('buildBridgeStatusPayload', () => {
    it('should build payload for empty state', () => {
      const state: AppState = { activeAccountId: null, accounts: [] }

      const originalIsLinked = ProfileService.isCodexLinkedSync
      ProfileService.isCodexLinkedSync = () => false
      try {
        const payload = buildBridgeStatusPayload(state)
        expect(payload.activeAccountId).toBeNull()
        expect(payload.totalAccounts).toBe(0)
        expect(payload.activeAccount).toBeNull()
        expect(payload.accounts).toEqual([])
        expect(payload.codexLinked).toBe(false)
      } finally {
        ProfileService.isCodexLinkedSync = originalIsLinked
      }
    })

    it('should include account summary with isActive and canSwitch flags', () => {
      const accounts = [
        makeAccount({ id: 'acc-1', label: 'Active', email: 'active@example.com', usage: { status: 'ok' } }),
        makeAccount({ id: 'acc-2', label: 'Expired', email: 'expired@example.com', usage: { status: 'relogin_required' } }),
      ]
      const state: AppState = { activeAccountId: 'acc-1', accounts }

      const originalIsLinked = ProfileService.isCodexLinkedSync
      ProfileService.isCodexLinkedSync = () => true
      try {
        const payload = buildBridgeStatusPayload(state)
        expect(payload.activeAccountId).toBe('acc-1')
        expect(payload.totalAccounts).toBe(2)
        expect(payload.codexLinked).toBe(true)
        expect(payload.activeAccount).not.toBeNull()
        expect(payload.activeAccount?.isActive).toBe(true)
        expect(payload.activeAccount?.canSwitch).toBe(true)

        const expired = payload.accounts.find(a => a.id === 'acc-2')
        expect(expired?.isActive).toBe(false)
        expect(expired?.canSwitch).toBe(false)
        expect(expired?.needsAttention).toBe(true)
      } finally {
        ProfileService.isCodexLinkedSync = originalIsLinked
      }
    })

    it('should mark deactivated accounts as isBlocked', () => {
      const accounts = [
        makeAccount({
          id: 'acc-1',
          label: 'Blocked',
          usage: { status: 'error', error: 'Account deactivated by admin' },
        }),
      ]
      const state: AppState = { activeAccountId: 'acc-1', accounts }

      const originalIsLinked = ProfileService.isCodexLinkedSync
      ProfileService.isCodexLinkedSync = () => false
      try {
        const payload = buildBridgeStatusPayload(state)
        expect(payload.accounts[0].isBlocked).toBe(true)
        expect(payload.accounts[0].canSwitch).toBe(false)
      } finally {
        ProfileService.isCodexLinkedSync = originalIsLinked
      }
    })

    it('should set displayName to email when available', () => {
      const accounts = [
        makeAccount({ id: 'acc-1', label: 'My Label', email: 'me@example.com' }),
      ]
      const state: AppState = { activeAccountId: 'acc-1', accounts }

      const originalIsLinked = ProfileService.isCodexLinkedSync
      ProfileService.isCodexLinkedSync = () => false
      try {
        const payload = buildBridgeStatusPayload(state)
        expect(payload.accounts[0].displayName).toBe('me@example.com')
      } finally {
        ProfileService.isCodexLinkedSync = originalIsLinked
      }
    })

    it('should fall back displayName to label when email is null', () => {
      const accounts = [
        makeAccount({ id: 'acc-1', label: 'Fallback', email: null }),
      ]
      const state: AppState = { activeAccountId: 'acc-1', accounts }

      const originalIsLinked = ProfileService.isCodexLinkedSync
      ProfileService.isCodexLinkedSync = () => false
      try {
        const payload = buildBridgeStatusPayload(state)
        expect(payload.accounts[0].displayName).toBe('Fallback')
      } finally {
        ProfileService.isCodexLinkedSync = originalIsLinked
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Helper to build mock Account objects
// ---------------------------------------------------------------------------
function makeAccount(overrides: Omit<Partial<Account>, 'usage'> & { usage?: Partial<Account['usage']> }): Account {
  const { usage: usageOverrides, ...rest } = overrides
  return {
    id: 'acc-default',
    label: 'Default',
    email: null,
    profileDir: '/mock/profiles/default',
    authSignature: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usage: {
      source: 'wham_usage',
      planType: null,
      status: 'ok',
      error: null,
      updatedAt: null,
      last5Hours: { usedPercent: null, remainingPercent: null, resetAt: null, windowSeconds: null },
      weekly: { usedPercent: null, remainingPercent: null, resetAt: null, windowSeconds: null },
      rateLimitResets: null,
      ...usageOverrides,
    },
    ...rest,
  }
}
