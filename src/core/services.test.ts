import { describe, expect, it } from 'bun:test'
import { ProfileService } from './ProfileService.js'
import { SessionService } from './SessionService.js'

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

  describe('ProfileService.computeAuthSignature', () => {
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

      const sig1 = ProfileService.computeAuthSignature(tokens1)
      const sig2 = ProfileService.computeAuthSignature(tokens2)
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
})
