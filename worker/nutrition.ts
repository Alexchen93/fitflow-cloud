import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'

type NutritionEnv = { Bindings: { DB: D1Database }; Variables: { nutritionDevice: string } }
type Macros = { calories: number; protein: number; carbs: number; fat: number }
type Food = Macros & { id: string; name: string }
type Entry = Macros & { id: string; foodId: string; name: string; meal: string; grams: number; date: string }
const macroKeys = ['calories', 'protein', 'carbs', 'fat'] as const
const amount = (max: number) => z.number().finite().min(0).max(max)
const foodSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(120),
  calories: amount(1000), protein: amount(100), carbs: amount(100), fat: amount(100),
})
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
})
const entrySchema = z.object({
  id: z.string().uuid(), foodId: z.string().uuid(), date: dateSchema,
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']), grams: z.number().finite().positive().max(10000),
})
const target = (max: number) => z.number().finite().positive().max(max).nullable()
const targetsSchema = z.object({ calories: target(20000), protein: target(2000), carbs: target(2000), fat: target(2000) })
const emptyTargets = { calories: null, protein: null, carbs: null, fat: null }
const foodColumns = 'id, name, calories, protein, carbs, fat'
const entryColumns = 'id, food_id AS foodId, name, meal, grams, calories, protein, carbs, fat, date'

export const nutrition = new Hono<NutritionEnv>()
nutrition.use('*', async (c, next) => {
  const device = c.req.header('x-fitflow-device')?.trim()
  if (!device || !/^[a-zA-Z0-9_-]{16,128}$/.test(device)) {
    return c.json({ error: 'Invalid device identifier', code: 'invalid_device' }, 400)
  }
  c.set('nutritionDevice', device)
  c.header('Cache-Control', 'private, no-store')
  await next()
})
nutrition.use('*', bodyLimit({ maxSize: 16384, onError: (c) => c.json({ error: 'Request is too large', code: 'invalid_nutrition' }, 413) }))

nutrition.get('/', async (c) => {
  const date = dateSchema.safeParse(c.req.query('date'))
  if (!date.success) return c.json({ error: 'Use a valid YYYY-MM-DD date', code: 'invalid_date' }, 400)
  const device = c.get('nutritionDevice')
  const [foods, entries, targets] = await Promise.all([
    c.env.DB.prepare(`SELECT ${foodColumns} FROM nutrition_foods WHERE device_id = ? ORDER BY name, id`).bind(device).all<Food>(),
    c.env.DB.prepare(`SELECT ${entryColumns} FROM nutrition_entries WHERE device_id = ? AND date = ? AND deleted_at IS NULL ORDER BY created_at, id`).bind(device, date.data).all<Entry>(),
    c.env.DB.prepare('SELECT calories, protein, carbs, fat FROM nutrition_targets WHERE device_id = ?').bind(device).first(),
  ])
  return c.json({ foods: foods.results, entries: entries.results.map(({ date: _date, ...entry }) => entry), targets: targets ?? emptyTargets })
})

nutrition.post('/foods', async (c) => {
  const parsed = foodSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid food label', code: 'invalid_food' }, 400)
  const body = parsed.data
  const device = c.get('nutritionDevice')
  // The unique ID is the idempotency key, including simultaneous retries.
  await c.env.DB.prepare(`INSERT INTO nutrition_foods (id, device_id, name, calories, protein, carbs, fat)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(body.id, device, body.name, body.calories, body.protein, body.carbs, body.fat).run()
  const existing = await c.env.DB.prepare(`SELECT ${foodColumns} FROM nutrition_foods WHERE id = ? AND device_id = ?`).bind(body.id, device).first<Food>()
  if (!existing || existing.name !== body.name || macroKeys.some((key) => existing[key] !== body[key])) {
    return c.json({ error: 'This identifier was already used for another request', code: 'id_conflict' }, 409)
  }
  return c.json({ ok: true })
})

nutrition.post('/entries', async (c) => {
  const parsed = entrySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid meal entry', code: 'invalid_entry' }, 400)
  const body = parsed.data
  const device = c.get('nutritionDevice')
  const food = await c.env.DB.prepare(`SELECT ${foodColumns} FROM nutrition_foods WHERE id = ? AND device_id = ?`).bind(body.foodId, device).first<Food>()
  if (!food) return c.json({ error: 'Food not found', code: 'food_not_found' }, 404)
  const scale = (value: number) => Math.round(value * body.grams / 100 * 100) / 100
  await c.env.DB.prepare(`INSERT INTO nutrition_entries (id, device_id, food_id, date, meal, grams, name, calories, protein, carbs, fat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(body.id, device, body.foodId, body.date, body.meal, body.grams, food.name,
      scale(food.calories), scale(food.protein), scale(food.carbs), scale(food.fat)).run()
  // Include tombstones: a stale retry must never recreate a deleted meal.
  const existing = await c.env.DB.prepare(`SELECT ${entryColumns} FROM nutrition_entries WHERE id = ? AND device_id = ?`).bind(body.id, device).first<Entry>()
  if (!existing || existing.foodId !== body.foodId || existing.date !== body.date || existing.meal !== body.meal || existing.grams !== body.grams) {
    return c.json({ error: 'This identifier was already used for another request', code: 'id_conflict' }, 409)
  }
  return c.json({ ok: true })
})

nutrition.delete('/entries/:id', async (c) => {
  const id = z.string().uuid().safeParse(c.req.param('id'))
  if (!id.success) return c.json({ error: 'Invalid meal entry identifier', code: 'invalid_entry' }, 400)
  // Missing, foreign-owned, and already deleted entries have the same response.
  await c.env.DB.prepare('UPDATE nutrition_entries SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP) WHERE id = ? AND device_id = ?')
    .bind(id.data, c.get('nutritionDevice')).run()
  return c.json({ ok: true })
})

nutrition.put('/targets', async (c) => {
  const parsed = targetsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid nutrition targets', code: 'invalid_targets' }, 400)
  const body = parsed.data
  await c.env.DB.prepare(`INSERT INTO nutrition_targets (device_id, calories, protein, carbs, fat)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET
    calories = excluded.calories, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat`)
    .bind(c.get('nutritionDevice'), body.calories, body.protein, body.carbs, body.fat).run()
  return c.json({ ok: true })
})
