import { describe, expect, it } from 'vitest'
import app from '../worker/index'

describe('FitFlow Worker API', () => {
  it('reports service health', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'fitflow-cloud',
      version: '0.1.0',
    })
  })

  it('rejects a missing device id before reading D1', async () => {
    const response = await app.request('/api/today')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: '裝置識別碼格式不正確' })
  })

  it('rejects malformed workout submissions', async () => {
    const response = await app.request('/api/runs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fitflow-device': 'fitflow_test_device_123456',
      },
      body: JSON.stringify({ sessionId: 'w1d1' }),
    })

    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toBe('訓練紀錄格式不正確')
  })
})
