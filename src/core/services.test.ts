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
