import { useEffect, useState, type DependencyList } from 'react'
import type { Exercise, HealthResponse, Program, ProgramDetail, Progress, RunPayload, TodayResponse, WorkoutSession } from './types'

const DEVICE_KEY = 'x-fitflow-device'

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id || !/^[a-zA-Z0-9_-]{16,128}$/.test(id)) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export class ApiError extends Error { constructor(message: string, public status?: number) { super(message) } }

async function request<T>(path: string, options: RequestInit = {}, device = false): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (device) headers.set('x-fitflow-device', getDeviceId())
  if (options.body) headers.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(path, { ...options, headers }) } catch { throw new ApiError('網路連線暫時中斷，請確認連線後再試。') }
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new ApiError(data.error || '服務暫時無法回應，請稍後再試。', response.status)
  return data as T
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  exercises: () => request<{ exercises: Exercise[] }>('/api/exercises'),
  programs: () => request<{ programs: Program[] }>('/api/programs'),
  program: (slug: string) => request<{ program: ProgramDetail }>(`/api/programs/${encodeURIComponent(slug)}`),
  session: (id: string) => request<{ session: WorkoutSession }>(`/api/sessions/${encodeURIComponent(id)}`),
  today: () => request<TodayResponse>('/api/today', {}, true),
  progress: () => request<Progress>('/api/progress', {}, true),
  completeRun: (payload: RunPayload) => request<{ ok: boolean; runId: string; duplicate: boolean }>('/api/runs', { method: 'POST', body: JSON.stringify(payload) }, true),
}

export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  useEffect(() => { let alive = true; setState((s) => ({ ...s, loading: true, error: null })); loader().then((data) => alive && setState({ data, loading: false, error: null })).catch((error: unknown) => alive && setState({ data: null, loading: false, error: error instanceof Error ? error.message : '載入失敗' })); return () => { alive = false } }, [...deps, nonce]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, retry: () => setNonce((n) => n + 1) }
}
