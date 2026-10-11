import { useEffect, useState, type DependencyList } from 'react'
import type { Exercise, HealthResponse, Program, ProgramDetail, Progress, RunPayload, TodayResponse, WorkoutSession } from './types'
import type { NutritionDay, NutritionFood, NutritionTargets, EntryPayload } from './nutrition-types'

export type AuthConfig = { enabled: boolean; clientId: string | null }
export type AuthState = { authenticated: boolean; user: { email: string; name: string | null; picture: string | null } | null }
export class ApiError extends Error { constructor(message: string, public status?: number) { super(message) } }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body) headers.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(path, { ...options, headers, credentials: 'same-origin' }) } catch { throw new ApiError('網路連線暫時中斷，請確認連線後再試。') }
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new ApiError(data.error || '服務暫時無法回應，請稍後再試。', response.status)
  return data as T
}

export const api = {
  authConfig: () => request<AuthConfig>('/api/auth/config'),
  me: () => request<AuthState>('/api/auth/me'),
  signInWithGoogle: (credential: string) => request<AuthState>('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  signOut: () => request<{ ok: boolean }>('/api/auth/signout', { method: 'POST' }),
  nutrition: (date: string) => request<NutritionDay>(`/api/nutrition?date=${encodeURIComponent(date)}`),
  createFood: (food: NutritionFood) => request<{ ok: boolean }>('/api/nutrition/foods', { method: 'POST', body: JSON.stringify(food) }),
  logFood: (entry: EntryPayload) => request<{ ok: boolean }>('/api/nutrition/entries', { method: 'POST', body: JSON.stringify(entry) }),
  deleteFoodEntry: (id: string) => request<{ ok: boolean }>(`/api/nutrition/entries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setNutritionTargets: (targets: NutritionTargets) => request<{ ok: boolean }>('/api/nutrition/targets', { method: 'PUT', body: JSON.stringify(targets) }),
  health: () => request<HealthResponse>('/api/health'), exercises: () => request<{ exercises: Exercise[] }>('/api/exercises'), programs: () => request<{ programs: Program[] }>('/api/programs'), program: (slug: string) => request<{ program: ProgramDetail }>(`/api/programs/${encodeURIComponent(slug)}`), session: (id: string) => request<{ session: WorkoutSession }>(`/api/sessions/${encodeURIComponent(id)}`), today: () => request<TodayResponse>('/api/today'), progress: () => request<Progress>('/api/progress'), completeRun: (payload: RunPayload) => request<{ ok: boolean; runId: string; duplicate: boolean }>('/api/runs', { method: 'POST', body: JSON.stringify(payload) }),
}

export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    const refresh = () => setNonce((n) => n + 1)
    window.addEventListener('fitflow-authchange', refresh)
    return () => window.removeEventListener('fitflow-authchange', refresh)
  }, [])
  useEffect(() => { let alive = true; setState((s) => ({ ...s, loading: true, error: null })); loader().then((data) => alive && setState({ data, loading: false, error: null })).catch((error: unknown) => alive && setState({ data: null, loading: false, error: error instanceof Error ? error.message : '載入失敗' })); return () => { alive = false } }, [...deps, nonce]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, retry: () => setNonce((n) => n + 1) }
}
