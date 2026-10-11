import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import { nutrition } from './nutrition'
import { clearSessionCookie, createSession, deleteSession, getAuthenticatedUser, sessionCookie, verifyGoogleIdToken, type AuthUser } from './auth'

interface Env {
  DB: D1Database
  ASSETS: Fetcher
  GOOGLE_CLIENT_ID?: string
}

type AppEnv = { Bindings: Env; Variables: { authUser: AuthUser | null } }

type ExerciseRow = {
  id: string
  slug: string
  name_zh: string
  name_en: string
  summary: string
  category: string
  level: string
  equipment: string
  primary_muscles: string
  instructions: string
  cautions: string
  source_name: string
  source_url: string
  license_name: string
  license_url: string
}

type SessionRow = {
  id: string
  program_id: string
  week_number: number
  day_number: number
  title: string
  focus: string
  duration_minutes: number
  intensity: string
}

const app = new Hono<AppEnv>()

const requireUser = (user: AuthUser | null) => user ? user : null

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https://wger.de'],
    connectSrc: ["'self'"],
    frameSrc: ['https://accounts.google.com'],
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
}))

app.use('*', async (c, next) => {
  c.set('authUser', c.env?.DB ? await getAuthenticatedUser(c.env.DB, c.req.raw) : null)
  await next()
})

const jsonArray = (value: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const mapExercise = (row: ExerciseRow) => ({
  id: row.id,
  slug: row.slug,
  name: row.name_zh,
  nameEn: row.name_en,
  summary: row.summary,
  category: row.category,
  level: row.level,
  equipment: row.equipment,
  primaryMuscles: jsonArray(row.primary_muscles),
  instructions: jsonArray(row.instructions),
  cautions: jsonArray(row.cautions),
  attribution: {
    source: row.source_name,
    sourceUrl: row.source_url,
    license: row.license_name,
    licenseUrl: row.license_url,
  },
})

async function getSession(db: D1Database, sessionId: string) {
  const session = await db.prepare('SELECT * FROM program_sessions WHERE id = ?').bind(sessionId).first<SessionRow>()
  if (!session) return null

  const rows = await db.prepare(`
    SELECT pse.id AS prescription_id, pse.position, pse.sets, pse.reps,
           pse.duration_seconds, pse.rest_seconds,
           e.*
    FROM program_session_exercises pse
    JOIN exercises e ON e.id = pse.exercise_id
    WHERE pse.session_id = ?
    ORDER BY pse.position
  `).bind(sessionId).all<ExerciseRow & {
    prescription_id: string
    position: number
    sets: number
    reps: number | null
    duration_seconds: number | null
    rest_seconds: number
  }>()

  return {
    id: session.id,
    weekNumber: session.week_number,
    dayNumber: session.day_number,
    title: session.title,
    focus: session.focus,
    durationMinutes: session.duration_minutes,
    intensity: session.intensity,
    exercises: rows.results.map((row) => ({
      prescriptionId: row.prescription_id,
      position: row.position,
      sets: row.sets,
      reps: row.reps,
      durationSeconds: row.duration_seconds,
      restSeconds: row.rest_seconds,
      exercise: mapExercise(row),
    })),
  }
}

app.get('/api/auth/config', (c) => c.json({ enabled: Boolean(c.env?.GOOGLE_CLIENT_ID), clientId: c.env?.GOOGLE_CLIENT_ID || null }))

app.get('/api/auth/me', (c) => {
  const user = c.get('authUser')
  return c.json({ authenticated: Boolean(user), user: user ? { email: user.email, name: user.name, picture: user.picture } : null })
})

app.post('/api/auth/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  if (!clientId) return c.json({ error: 'Google sign-in is not configured', code: 'auth_unavailable' }, 503)
  const credential = z.object({ credential: z.string().min(1).max(12000) }).safeParse(await c.req.json().catch(() => null))
  if (!credential.success) return c.json({ error: 'Invalid Google credential', code: 'invalid_credential' }, 400)
  try {
    const session = await createSession(c.env.DB, await verifyGoogleIdToken(credential.data.credential, clientId))
    c.header('Set-Cookie', sessionCookie(session.sessionId, session.expiresAt))
    return c.json({ authenticated: true, user: { email: session.user.email, name: session.user.name, picture: session.user.picture } })
  } catch {
    return c.json({ error: 'Google credential could not be verified', code: 'invalid_credential' }, 401)
  }
})

app.post('/api/auth/signout', async (c) => {
  await deleteSession(c.env.DB, c.req.raw)
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ ok: true })
})

app.get('/api/health', (c) => c.json({ ok: true, service: 'fitflow-cloud', version: '0.1.0' }))

app.get('/api/exercises', async (c) => {
  const query = c.req.query('q')?.trim() ?? ''
  const category = c.req.query('category')?.trim() ?? ''
  const clauses: string[] = []
  const values: string[] = []

  if (query) {
    clauses.push('(name_zh LIKE ? OR name_en LIKE ? OR summary LIKE ?)')
    const like = `%${query}%`
    values.push(like, like, like)
  }
  if (category) {
    clauses.push('category = ?')
    values.push(category)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const result = await c.env.DB.prepare(`SELECT * FROM exercises ${where} ORDER BY category, name_zh`)
    .bind(...values)
    .all<ExerciseRow>()

  return c.json({ exercises: result.results.map(mapExercise) })
})

app.get('/api/programs', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, slug, name, summary, duration_weeks, sessions_per_week, level, goal
    FROM programs
    WHERE is_published = 1
    ORDER BY created_at
  `).all<{
    id: string
    slug: string
    name: string
    summary: string
    duration_weeks: number
    sessions_per_week: number
    level: string
    goal: string
  }>()

  return c.json({ programs: result.results.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    durationWeeks: row.duration_weeks,
    sessionsPerWeek: row.sessions_per_week,
    level: row.level,
    goal: row.goal,
  })) })
})

app.get('/api/programs/:slug', async (c) => {
  const program = await c.env.DB.prepare(`
    SELECT id, slug, name, summary, duration_weeks, sessions_per_week, level, goal
    FROM programs WHERE slug = ? AND is_published = 1
  `).bind(c.req.param('slug')).first<{
    id: string
    slug: string
    name: string
    summary: string
    duration_weeks: number
    sessions_per_week: number
    level: string
    goal: string
  }>()

  if (!program) return c.json({ error: '找不到這份計畫' }, 404)

  const sessions = await c.env.DB.prepare(`
    SELECT * FROM program_sessions WHERE program_id = ? ORDER BY week_number, day_number
  `).bind(program.id).all<SessionRow>()
  const phases = await c.env.DB.prepare(`
    SELECT id, position, name, purpose, start_week, end_week
    FROM program_phases WHERE program_id = ? ORDER BY position
  `).bind(program.id).all<{
    id: string
    position: number
    name: string
    purpose: string
    start_week: number
    end_week: number
  }>()

  return c.json({
    program: {
      id: program.id,
      slug: program.slug,
      name: program.name,
      summary: program.summary,
      durationWeeks: program.duration_weeks,
      sessionsPerWeek: program.sessions_per_week,
      level: program.level,
      goal: program.goal,
      phases: phases.results.map((phase) => ({
        id: phase.id,
        position: phase.position,
        name: phase.name,
        purpose: phase.purpose,
        startWeek: phase.start_week,
        endWeek: phase.end_week,
      })),
      weeks: Array.from({ length: program.duration_weeks }, (_, index) => {
        const weekNumber = index + 1
        return {
          weekNumber,
          sessions: sessions.results
            .filter((session) => session.week_number === weekNumber)
            .map((session) => ({
              id: session.id,
              dayNumber: session.day_number,
              title: session.title,
              focus: session.focus,
              durationMinutes: session.duration_minutes,
              intensity: session.intensity,
            })),
        }
      }),
    },
  })
})

app.get('/api/sessions/:id', async (c) => {
  const session = await getSession(c.env.DB, c.req.param('id'))
  return session ? c.json({ session }) : c.json({ error: '找不到這次訓練' }, 404)
})

app.get('/api/today', async (c) => {
  const user = requireUser(c.get('authUser'))
  if (!user) return c.json({ error: 'Authentication required', code: 'unauthenticated' }, 401)

  const next = await c.env.DB.prepare(`
    SELECT ps.id
    FROM program_sessions ps
    JOIN programs p ON p.id = ps.program_id
    WHERE p.is_published = 1
      AND NOT EXISTS (
        SELECT 1 FROM workout_runs wr
        WHERE wr.session_id = ps.id AND wr.user_id = ? AND wr.completed_at IS NOT NULL
      )
    ORDER BY ps.week_number, ps.day_number
    LIMIT 1
  `).bind(user.id).first<{ id: string }>()

  if (!next) return c.json({ session: null, completedProgram: true })

  const session = await getSession(c.env.DB, next.id)
  return c.json({ session, completedProgram: false })
})

app.get('/api/progress', async (c) => {
  const user = requireUser(c.get('authUser'))
  if (!user) return c.json({ error: 'Authentication required', code: 'unauthenticated' }, 401)

  const summary = await c.env.DB.prepare(`
    SELECT COUNT(*) AS completed_sessions,
           COALESCE(SUM(duration_seconds), 0) AS total_seconds,
           MAX(completed_at) AS last_completed_at
    FROM workout_runs
    WHERE user_id = ? AND completed_at IS NOT NULL
  `).bind(user.id).first<{ completed_sessions: number; total_seconds: number; last_completed_at: string | null }>()

  const recent = await c.env.DB.prepare(`
    SELECT wr.id, wr.completed_at, wr.duration_seconds, wr.perceived_effort,
           ps.title, ps.focus, ps.week_number, ps.day_number
    FROM workout_runs wr
    JOIN program_sessions ps ON ps.id = wr.session_id
    WHERE wr.user_id = ? AND wr.completed_at IS NOT NULL
    ORDER BY wr.completed_at DESC
    LIMIT 8
  `).bind(user.id).all<{
    id: string
    completed_at: string
    duration_seconds: number
    perceived_effort: number | null
    title: string
    focus: string
    week_number: number
    day_number: number
  }>()

  return c.json({
    summary: {
      completedSessions: summary?.completed_sessions ?? 0,
      totalMinutes: Math.round((summary?.total_seconds ?? 0) / 60),
      lastCompletedAt: summary?.last_completed_at ?? null,
    },
    recent: recent.results.map((row) => ({
      id: row.id,
      completedAt: row.completed_at,
      durationMinutes: Math.max(1, Math.round(row.duration_seconds / 60)),
      perceivedEffort: row.perceived_effort,
      title: row.title,
      focus: row.focus,
      weekNumber: row.week_number,
      dayNumber: row.day_number,
    })),
  })
})

const completedRunSchema = z.object({
  runId: z.string().uuid(),
  sessionId: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(1).max(6 * 60 * 60),
  perceivedEffort: z.number().int().min(1).max(10),
  notes: z.string().max(1000).default(''),
  sets: z.array(z.object({
    prescriptionId: z.string().min(1),
    setNumber: z.number().int().min(1).max(20),
    reps: z.number().int().min(0).max(1000).nullable(),
    durationSeconds: z.number().int().min(0).max(60 * 60).nullable(),
  })).min(1).max(200),
}).refine(
  ({ startedAt, completedAt }) => Date.parse(completedAt) >= Date.parse(startedAt),
  { message: '完成時間不可早於開始時間', path: ['completedAt'] },
)

app.post('/api/runs', async (c) => {
  const user = requireUser(c.get('authUser'))
  if (!user) return c.json({ error: 'Authentication required', code: 'unauthenticated' }, 401)

  const parsed = completedRunSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: '訓練紀錄格式不正確', details: parsed.error.flatten() }, 400)

  const body = parsed.data
  const prescriptionIds = [...new Set(body.sets.map((set) => set.prescriptionId))]
  const placeholders = prescriptionIds.map(() => '?').join(', ')
  const prescriptions = await c.env.DB.prepare(`
    SELECT id
    FROM program_session_exercises
    WHERE session_id = ? AND id IN (${placeholders})
  `).bind(body.sessionId, ...prescriptionIds).all<{ id: string }>()

  if (prescriptions.results.length !== prescriptionIds.length) {
    return c.json({ error: '訓練內容與指定課程不相符' }, 400)
  }

  const existing = await c.env.DB.prepare(`
    SELECT id FROM workout_runs WHERE id = ? AND user_id = ?
  `).bind(body.runId, user.id).first<{ id: string }>()
  if (existing) return c.json({ ok: true, runId: existing.id, duplicate: true })

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`
      INSERT INTO workout_runs
        (id, device_id, user_id, session_id, started_at, completed_at, duration_seconds, perceived_effort, notes)
      VALUES (?, '', ?, ?, ?, ?, ?, ?, ?)
    `).bind(body.runId, user.id, body.sessionId, body.startedAt, body.completedAt, body.durationSeconds, body.perceivedEffort, body.notes),
    ...body.sets.map((set) => c.env.DB.prepare(`
      INSERT INTO set_logs
        (id, run_id, session_exercise_id, set_number, reps, duration_seconds, completed)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).bind(crypto.randomUUID(), body.runId, set.prescriptionId, set.setNumber, set.reps, set.durationSeconds)),
  ]

  await c.env.DB.batch(statements)
  return c.json({ ok: true, runId: body.runId, duplicate: false }, 201)
})

app.route('/api/nutrition', nutrition)

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: '服務暫時無法處理這個請求' }, 500)
})

export default app
