/**
 * GET /api/kroger/authorize?user=<username>
 * Starts the OAuth2 authorization-code flow: stores a single-use CSRF state,
 * then redirects the browser to Kroger's sign-in/consent page.
 */
import { randomBytes } from 'node:crypto'
import { sql, krogerEnv, redirect, OAUTH2_BASE } from './_kroger.js'

// Minimal scopes: write to the customer's cart, and read their name for display.
const SCOPE = 'cart.basic:write profile.compact'

export default async function handler(req, res) {
  const username = req.query.user
  if (!username) return res.status(400).json({ error: 'Missing user' })

  let env
  try {
    env = krogerEnv()
  } catch {
    return redirect(res, '/#/order/kroger?kroger_error=not_configured')
  }

  const state = randomBytes(16).toString('hex')
  // Housekeeping: drop this user's old state rows and anything stale.
  await sql`DELETE FROM kroger_oauth_state WHERE username = ${username} OR created_at < now() - interval '1 hour'`
  await sql`INSERT INTO kroger_oauth_state (state, username) VALUES (${state}, ${username})`

  const url =
    `${OAUTH2_BASE}/authorize?` +
    `client_id=${encodeURIComponent(env.clientId)}` +
    `&redirect_uri=${encodeURIComponent(env.redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${encodeURIComponent(state)}`

  return redirect(res, url)
}
