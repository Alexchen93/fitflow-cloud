import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import app from '../worker/index'

// Execute the actual migration and route SQL against SQLite, not canned query results.
function d1Adapter(sqlite: DatabaseSync) {
  function prepare(sql: string, args: (string | number | null)[] = []) {
    return {
      bind: (...values: (string | number | null)[]) => prepare(sql, values),
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args), success: true }),
      run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...args) }),
    }
  }
  return { prepare } as unknown as D1Database
}
const deviceA = 'nutrition_device_a_123456'
const deviceB = 'nutrition_device_b_123456'
const foodId = '44f3ce32-2787-4992-9147-601d08f46363'
const entryId = '5e40ddc6-c2b3-4d78-9e39-048cd8dfe72a'
const food = { id: foodId, name: 'Original yogurt', calories: 80, protein: 9.5, carbs: 6, fat: 2 }
const entry = { id: entryId, foodId, date: '2026-10-11', meal: 'breakfast', grams: 150 }

describe('Nutrition API with real SQLite migration', () => {
  let sqlite: DatabaseSync
  let DB: D1Database
  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:')
    sqlite.exec('PRAGMA foreign_keys = ON')
    sqlite.exec(readFileSync(new URL('../migrations/0002_nutrition.sql', import.meta.url), 'utf8'))
    DB = d1Adapter(sqlite)
  })
  afterEach(() => sqlite.close())
  function request(path = '?date=2026-10-11', method = 'GET', body?: unknown, device = deviceA) {
    return app.request(`/api/nutrition${path}`, {
      method, headers: { 'x-fitflow-device': device, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, { DB, ASSETS: {} as Fetcher })
  }
  async function seed() {
    expect((await request('/foods', 'POST', food)).status).toBe(200)
    expect((await request('/entries', 'POST', entry)).status).toBe(200)
  }
  it('starts empty with no inferred targets and does not cache personal data', async () => {
    const res = await request()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ foods: [], entries: [], targets: { calories: null, protein: null, carbs: null, fat: null } })
  })
  it('requires valid device IDs and real calendar dates', async () => {
    expect((await request('?date=2026-10-11', 'GET', undefined, '')).status).toBe(400)
    for (const date of ['2026-02-29', '2024-02-30', '2026-13-01', '2026-1-1', 'nope']) {
      expect((await request(`?date=${date}`)).status).toBe(400)
      expect((await request('/entries', 'POST', { ...entry, date })).status).toBe(400)
    }
    expect((await request('?date=2024-02-29')).status).toBe(200)
  })
  it('rejects invalid labels, grams, meal types and targets before writes', async () => {
    for (const invalid of [{ ...food, name: '   ' }, { ...food, calories: -1 }, { ...food, protein: 101 }, { ...food, calories: null }]) {
      expect((await request('/foods', 'POST', invalid)).status).toBe(400)
    }
    for (const grams of [0, -1, 10001, null, '100']) {
      expect((await request('/entries', 'POST', { ...entry, grams })).status).toBe(400)
    }
    expect((await request('/entries', 'POST', { ...entry, meal: 'unknown' })).status).toBe(400)
    expect((await request('/targets', 'PUT', { calories: 0, protein: null, carbs: null, fat: null })).status).toBe(400)
    expect((await request('/targets', 'PUT', { calories: 20001, protein: null, carbs: null, fat: null })).status).toBe(400)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM nutrition_foods').get()?.n).toBe(0)
  })
  it('scales per-100g labels, filters dates, and keeps logged nutrient snapshots', async () => {
    await seed()
    const expected = { id: entryId, foodId, name: food.name, meal: 'breakfast', grams: 150, calories: 120, protein: 14.25, carbs: 9, fat: 3 }
    expect((await (await request()).json()).entries).toEqual([expected])
    sqlite.prepare('UPDATE nutrition_foods SET calories = 90, name = ? WHERE id = ?').run('Changed label', foodId)
    expect((await (await request()).json()).entries).toEqual([expected])
    expect((await (await request('?date=2026-10-12')).json()).entries).toEqual([])
  })
  it('isolates foods, entries and targets across devices including guessed identifiers', async () => {
    await seed()
    const targets = { calories: 2200, protein: 100, carbs: null, fat: null }
    expect((await request('/targets', 'PUT', targets)).status).toBe(200)
    const other = await (await request('?date=2026-10-11', 'GET', undefined, deviceB)).json()
    expect(other).toEqual({ foods: [], entries: [], targets: { calories: null, protein: null, carbs: null, fat: null } })
    expect((await request('/entries', 'POST', { ...entry, id: crypto.randomUUID() }, deviceB)).status).toBe(404)
    expect((await request('/foods', 'POST', food, deviceB)).status).toBe(409)
    expect((await request(`/entries/${entryId}`, 'DELETE', undefined, deviceB)).status).toBe(200)
    expect((await (await request()).json()).entries).toHaveLength(1)
    expect((await (await request()).json()).targets).toEqual(targets)
    // Defense in depth: SQLite rejects food/device ownership mismatches too.
    expect(() => sqlite.prepare('UPDATE nutrition_entries SET device_id = ? WHERE id = ?').run(deviceB, entryId)).toThrow()
  })
  it('makes simultaneous retries idempotent but refuses changed payloads', async () => {
    const foodResponses = await Promise.all([request('/foods', 'POST', food), request('/foods', 'POST', food)])
    expect(foodResponses.map((res) => res.status)).toEqual([200, 200])
    const entryResponses = await Promise.all([request('/entries', 'POST', entry), request('/entries', 'POST', entry)])
    expect(entryResponses.map((res) => res.status)).toEqual([200, 200])
    expect((await request('/foods', 'POST', { ...food, calories: 90 })).status).toBe(409)
    expect((await request('/entries', 'POST', { ...entry, grams: 200 })).status).toBe(409)
    const result = await (await request()).json()
    expect(result.foods).toHaveLength(1)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].grams).toBe(150)
  })
  it('prevents deleted entries from reappearing on stale create retries', async () => {
    await seed()
    expect((await request(`/entries/${entryId}`, 'DELETE')).status).toBe(200)
    expect((await request(`/entries/${entryId}`, 'DELETE')).status).toBe(200)
    expect((await request('/entries', 'POST', entry)).status).toBe(200)
    expect((await (await request()).json()).entries).toEqual([])
  })
  it('can explicitly set and clear user targets without affecting another device', async () => {
    const targets = { calories: 2000, protein: 90, carbs: 250, fat: 70 }
    expect((await request('/targets', 'PUT', targets)).status).toBe(200)
    expect((await (await request()).json()).targets).toEqual(targets)
    const cleared = { calories: null, protein: null, carbs: null, fat: null }
    expect((await request('/targets', 'PUT', cleared)).status).toBe(200)
    expect((await (await request()).json()).targets).toEqual(cleared)
  })
})
