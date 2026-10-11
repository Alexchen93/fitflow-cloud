import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import app from '../worker/index'

function d1Adapter(sqlite: DatabaseSync) {
  function prepare(sql: string, args: (string | number | null)[] = []) {
    return { bind: (...values: (string | number | null)[]) => prepare(sql, values), first: async () => sqlite.prepare(sql).get(...args) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...args), success: true }), run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...args) }) }
  }
  return { prepare } as unknown as D1Database
}
const food = { id: '44f3ce32-2787-4992-9147-601d08f46363', name: 'Original yogurt', calories: 80, protein: 9.5, carbs: 6, fat: 2 }
const entry = { id: '5e40ddc6-c2b3-4d78-9e39-048cd8dfe72a', foodId: food.id, date: '2026-10-11', meal: 'breakfast', grams: 150 }

describe('Nutrition account isolation', () => {
  let sqlite: DatabaseSync; let DB: D1Database
  beforeEach(() => { sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON'); sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8')); sqlite.exec(readFileSync(new URL('../migrations/0002_nutrition.sql', import.meta.url), 'utf8')); sqlite.exec(readFileSync(new URL('../migrations/0003_google_auth_accounts.sql', import.meta.url), 'utf8')); sqlite.prepare('INSERT INTO users (id, google_sub, email) VALUES (?, ?, ?), (?, ?, ?)').run('user-a', 'google-a', 'a@example.test', 'user-b', 'google-b', 'b@example.test'); sqlite.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?), (?, ?, ?)').run('session_a_abcdefghijklmnopqrstuvwxyz', 'user-a', '2999-01-01T00:00:00.000Z', 'session_b_abcdefghijklmnopqrstuvwxyz', 'user-b', '2999-01-01T00:00:00.000Z'); DB = d1Adapter(sqlite) })
  afterEach(() => sqlite.close())
  const request = (path: string, session: 'a' | 'b' = 'a', method = 'GET', body?: unknown) => app.request(`/api/nutrition${path}`, { method, headers: { cookie: `fitflow_session=session_${session}_abcdefghijklmnopqrstuvwxyz`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { DB, ASSETS: {} as Fetcher })

  it('rejects missing and expired sessions', async () => {
    expect((await app.request('/api/nutrition?date=2026-10-11', {}, { DB, ASSETS: {} as Fetcher })).status).toBe(401)
    sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run('2000-01-01T00:00:00.000Z', 'user-a')
    expect((await request('?date=2026-10-11', 'a')).status).toBe(401)
    sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run(new Date(Date.now() - 60_000).toISOString(), 'user-b')
    expect((await request('?date=2026-10-11', 'b')).status).toBe(401)
  })
  it('invalidates a session at the sign-out boundary', async () => {
    const response = await app.request('/api/auth/signout', { method: 'POST', headers: { cookie: 'fitflow_session=session_a_abcdefghijklmnopqrstuvwxyz' } }, { DB, ASSETS: {} as Fetcher })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await request('?date=2026-10-11', 'a')).status).toBe(401)
  })
  it('keeps foods, entries and targets account scoped', async () => {
    expect((await request('/foods', 'a', 'POST', food)).status).toBe(200)
    expect((await request('/entries', 'a', 'POST', entry)).status).toBe(200)
    expect((await request('/targets', 'a', 'PUT', { calories: 2200, protein: 100, carbs: null, fat: null })).status).toBe(200)
    expect(await (await request('?date=2026-10-11', 'b')).json()).toEqual({ foods: [], entries: [], targets: { calories: null, protein: null, carbs: null, fat: null } })
    expect((await request('/entries', 'b', 'POST', { ...entry, id: crypto.randomUUID() })).status).toBe(404)
    expect((await request('?date=2026-10-11', 'a')).headers.get('cache-control')).toBe('private, no-store')
  })
  it('does not surface retained anonymous device rows after authentication', async () => {
    sqlite.prepare('INSERT INTO nutrition_foods (id, device_id, name, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), 'legacy-device', 'Legacy food', 1, 1, 1, 1)
    expect((await (await request('?date=2026-10-11')).json()).foods).toEqual([])
  })
})
