/**
 * GET /api/kroger/status?user=<username>
 * Reports whether this user has linked a Kroger account and which store is set,
 * plus whether the server even has Kroger credentials configured.
 */
import { sql, isKrogerConfigured } from './_kroger.js'

export default async function handler(req, res) {
  const username = req.query.user
  if (!username) return res.status(400).json({ error: 'Missing user' })

  const [row] = await sql`
    SELECT location_id, location_name, location_chain, (refresh_token IS NOT NULL) AS connected
    FROM kroger_tokens
    WHERE username = ${username}
  `

  res.json({
    configured: isKrogerConfigured(),
    connected: !!(row && row.connected),
    locationId: row?.location_id ?? null,
    locationName: row?.location_name ?? null,
    locationChain: row?.location_chain ?? null,
  })
}
