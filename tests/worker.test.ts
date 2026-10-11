import { describe, expect, it } from 'vitest'
import app from '../worker/index'

describe('FitFlow Worker API', () => {
  it('reports service health', async () => {
    const response = await app.request('/api/health')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, service: 'fitflow-cloud', version: '0.1.0' })
  })

  it('reports that Google sign-in is unavailable without a runtime client id', async () => {
    const response = await app.request('/api/auth/config')
    expect(await response.json()).toEqual({ enabled: false, clientId: null })
  })

  it.each(['/api/today', '/api/progress', '/api/nutrition?date=2026-10-11'])('rejects unauthenticated account data requests: %s', async (path) => {
    const response = await app.request(path)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required', code: 'unauthenticated' })
  })

  it('rejects malformed workout submissions before any device header is considered', async () => {
    const response = await app.request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-fitflow-device': 'legacy_device_123456' }, body: JSON.stringify({ sessionId: 'w1d1' }) })
    expect(response.status).toBe(401)
  })
})
