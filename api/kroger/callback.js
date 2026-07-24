/**
 * GET /api/kroger/callback?code=&state=
 * Kroger redirects here after the user authorizes. Verifies the CSRF state,
 * exchanges the code for tokens, persists them, then redirects back into the app.
 */
import { sql, exchangeAuthCode, redirect } from './_kroger.js'

export default async function handler(req, res) {
  const { code, state, error } = req.query

  if (error) return redirect(res, `/#/order/kroger?kroger_error=${encodeURIComponent(error)}`)
  if (!code || !state) return redirect(res, '/#/order/kroger?kroger_error=missing_code')

  const [stateRow] = await sql`SELECT username FROM kroger_oauth_state WHERE state = ${state}`
  await sql`DELETE FROM kroger_oauth_state WHERE state = ${state}` // single use
  if (!stateRow) return redirect(res, '/#/order/kroger?kroger_error=bad_state')

  const username = stateRow.username
  try {
    const data = await exchangeAuthCode(code)
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 1800) * 1000).toISOString()
    // Upsert tokens; preserve any previously chosen store (location_* untouched).
    await sql`
      INSERT INTO kroger_tokens (username, access_token, refresh_token, access_token_expires_at, updated_at)
      VALUES (${username}, ${data.access_token}, ${data.refresh_token}, ${expiresAt}, now())
      ON CONFLICT (username) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        updated_at = now()
    `
    return redirect(res, '/#/order/kroger?kroger=connected')
  } catch (e) {
    console.error('Kroger callback error:', e)
    return redirect(res, '/#/order/kroger?kroger_error=token_exchange')
  }
}
