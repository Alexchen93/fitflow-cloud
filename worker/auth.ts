export type AuthEnv = { DB: D1Database; GOOGLE_CLIENT_ID?: string }
export type AuthUser = { id: string; googleSub: string; email: string; name: string | null; picture: string | null }
type GoogleClaims = { sub: string; email: string; email_verified: boolean; name?: string; picture?: string; iss: string; aud: string | string[]; exp: number }
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string }

const SESSION_COOKIE = 'fitflow_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const encoder = new TextEncoder()
let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null

const base64UrlToBytes = (value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid JWT encoding')
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const textJson = <T>(value: string) => JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T

async function googleKeys() {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs')
  if (!response.ok) throw new Error('Unable to load Google signing keys')
  const body = await response.json() as { keys?: Jwk[] }
  if (!Array.isArray(body.keys)) throw new Error('Invalid Google signing keys')
  jwksCache = { keys: body.keys, expiresAt: Date.now() + 60 * 60 * 1000 }
  return body.keys
}

export async function verifyGoogleIdToken(token: string, clientId: string): Promise<GoogleClaims> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Malformed Google credential')
  const header = textJson<{ alg?: string; kid?: string }>(parts[0])
  const claims = textJson<GoogleClaims>(parts[1])
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported Google credential')
  const key = (await googleKeys()).find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA' && candidate.use === 'sig' && (!candidate.alg || candidate.alg === 'RS256'))
  if (!key) throw new Error('Unknown Google signing key')
  const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const signed = encoder.encode(`${parts[0]}.${parts[1]}`)
  if (!await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, base64UrlToBytes(parts[2]), signed)) throw new Error('Invalid Google credential signature')
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email || claims.email_verified !== true || typeof claims.iss !== 'string' || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || !audiences.includes(clientId) || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Google credential claims were rejected')
  }
  return claims
}

export function sessionCookie(sessionId: string, expiresAt: string) {
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}`
}

export function clearSessionCookie() { return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` }

export function sessionIdFromRequest(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)
  return value && /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null
}

export async function getAuthenticatedUser(db: D1Database, request: Request): Promise<AuthUser | null> {
  const sessionId = sessionIdFromRequest(request)
  if (!sessionId) return null
  return db.prepare(`SELECT u.id, u.google_sub AS googleSub, u.email, u.name, u.picture
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND julianday(s.expires_at) > julianday('now')`).bind(sessionId).first<AuthUser>()
}

export async function createSession(db: D1Database, claims: GoogleClaims): Promise<{ user: AuthUser; sessionId: string; expiresAt: string }> {
  const userId = crypto.randomUUID()
  await db.prepare(`INSERT INTO users (id, google_sub, email, name, picture) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture, updated_at = CURRENT_TIMESTAMP`)
    .bind(userId, claims.sub, claims.email, claims.name ?? null, claims.picture ?? null).run()
  const user = await db.prepare('SELECT id, google_sub AS googleSub, email, name, picture FROM users WHERE google_sub = ?').bind(claims.sub).first<AuthUser>()
  if (!user) throw new Error('Unable to create account')
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const sessionId = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(sessionId, user.id, expiresAt).run()
  return { user, sessionId, expiresAt }
}

export async function deleteSession(db: D1Database, request: Request) {
  const sessionId = sessionIdFromRequest(request)
  if (sessionId) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
}
