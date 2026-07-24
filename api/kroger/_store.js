/**
 * POST /api/kroger/store  { user, locationId, locationName }
 * Saves the user's chosen Kroger store. Requires an existing connection
 * (the row is created when the account is linked).
 */
import { sql } from './_kroger.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { user, locationId, locationName, chain } = req.body ?? {}
  if (!user || !locationId) return res.status(400).json({ error: 'Missing user or locationId' })

  const updated = await sql`
    UPDATE kroger_tokens
    SET location_id = ${locationId},
        location_name = ${locationName ?? null},
        location_chain = ${chain ?? null},
        updated_at = now()
    WHERE username = ${user}
    RETURNING username
  `
  if (updated.length === 0) {
    return res.status(400).json({ error: 'not_connected', message: 'Connect your Kroger account first.' })
  }
  res.json({ ok: true, locationId, locationName: locationName ?? null })
}
