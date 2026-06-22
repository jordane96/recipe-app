/**
 * Shared Kroger Public API helpers.
 *
 * Filename is underscore-prefixed so Vercel does NOT expose it as an endpoint —
 * it's a library imported by the api/kroger/* handlers.
 *
 * Two kinds of token:
 *   - App token  (client_credentials, scope product.compact) — product/location search.
 *   - User token (authorization_code + refresh)              — writing to a user's cart.
 *
 * Docs: https://developer.kroger.com/documentation
 */
import { neon } from '@neondatabase/serverless'

export const sql = neon(process.env.DATABASE_URL)

export const OAUTH2_BASE = 'https://api.kroger.com/v1/connect/oauth2'
export const API_BASE = 'https://api.kroger.com'

export class KrogerConfigError extends Error {}
export class KrogerNotConnectedError extends Error {}

export function krogerEnv() {
  const clientId = process.env.KROGER_CLIENT_ID
  const clientSecret = process.env.KROGER_CLIENT_SECRET
  const redirectUri = process.env.KROGER_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new KrogerConfigError(
      'Kroger API is not configured (KROGER_CLIENT_ID / KROGER_CLIENT_SECRET / KROGER_REDIRECT_URI).',
    )
  }
  return { clientId, clientSecret, redirectUri }
}

export function isKrogerConfigured() {
  return !!(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET && process.env.KROGER_REDIRECT_URI)
}

function basicAuth({ clientId, clientSecret }) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

/** POST to the OAuth2 /token endpoint with the given grant params. */
async function requestToken(params) {
  const env = krogerEnv()
  const resp = await fetch(`${OAUTH2_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(env),
    },
    body: new URLSearchParams(params).toString(),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    const err = new Error(`Kroger token request failed (${resp.status}): ${text}`)
    err.status = resp.status
    throw err
  }
  return resp.json()
}

// ---- App-level token (client_credentials) ---------------------------------
// Cached in module scope; survives within a warm function instance.
let appTokenCache = { token: null, expiresAt: 0 }

export async function getAppToken() {
  const now = Date.now()
  if (appTokenCache.token && appTokenCache.expiresAt > now + 60_000) {
    return appTokenCache.token
  }
  const data = await requestToken({ grant_type: 'client_credentials', scope: 'product.compact' })
  appTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in ?? 1800) * 1000 }
  return appTokenCache.token
}

// ---- Per-user token (authorization_code + refresh) ------------------------
export async function exchangeAuthCode(code) {
  const { redirectUri } = krogerEnv()
  return requestToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
}

/**
 * Return a valid user access token, refreshing (and persisting) it if expired.
 * Throws KrogerNotConnectedError when there's no usable refresh token.
 */
export async function getUserToken(username) {
  const [row] = await sql`SELECT * FROM kroger_tokens WHERE username = ${username}`
  if (!row || !row.refresh_token) {
    throw new KrogerNotConnectedError('No Kroger account connected.')
  }
  const expMs = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0
  if (row.access_token && expMs > Date.now() + 60_000) {
    return { accessToken: row.access_token, row }
  }

  let data
  try {
    data = await requestToken({ grant_type: 'refresh_token', refresh_token: row.refresh_token })
  } catch {
    throw new KrogerNotConnectedError('Kroger session expired; please reconnect.')
  }
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 1800) * 1000).toISOString()
  const newRefresh = data.refresh_token ?? row.refresh_token // Kroger may rotate it
  await sql`
    UPDATE kroger_tokens
    SET access_token = ${data.access_token},
        refresh_token = ${newRefresh},
        access_token_expires_at = ${expiresAt},
        updated_at = now()
    WHERE username = ${username}
  `
  return { accessToken: data.access_token, row: { ...row, access_token: data.access_token, refresh_token: newRefresh } }
}

/** Portable 302 redirect that works under both Vercel and scripts/local-api.mjs. */
export function redirect(res, location) {
  res.setHeader('Location', location)
  return res.status(302).end()
}

/** GET an absolute Kroger API path with a bearer token. Returns the raw Response. */
export function krogerApiGet(path, token) {
  return fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  })
}
