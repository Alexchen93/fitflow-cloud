import { describe, expect, it } from 'vitest'
import { verifyGoogleIdToken } from '../worker/auth'

describe('Google credential verifier', () => {
  it('rejects malformed, unsigned, or non-RS256 credentials without trusting their claims', async () => {
    await expect(verifyGoogleIdToken('not-a-jwt', 'client-id')).rejects.toThrow()
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = `${part({ alg: 'none', kid: 'untrusted' })}.${part({ sub: 'attacker', email: 'attacker@example.test', email_verified: true, iss: 'https://accounts.google.com', aud: 'client-id', exp: 4102444800 })}.signature`
    await expect(verifyGoogleIdToken(unsigned, 'client-id')).rejects.toThrow('Unsupported')
  })
})
