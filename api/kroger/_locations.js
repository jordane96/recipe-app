/**
 * GET /api/kroger/locations?zip=<5-digit>&limit=<n>
 * Finds nearby Kroger-family stores so the user can pick a store (products and
 * prices are per-location). Uses the app-level token.
 */
import { getAppToken, krogerApiGet } from './_kroger.js'

export default async function handler(req, res) {
  const zip = String(req.query.zip ?? '').trim()
  if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: 'A 5-digit ZIP code is required' })
  const limit = Math.min(Number(req.query.limit) || 8, 20)

  try {
    const token = await getAppToken()
    const resp = await krogerApiGet(
      `/v1/locations?filter.zipCode.near=${zip}&filter.limit=${limit}`,
      token,
    )
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '')
      return res.status(502).json({ error: `Kroger locations failed (${resp.status})`, detail })
    }
    const json = await resp.json()
    const locations = (json.data ?? []).map((loc) => ({
      locationId: loc.locationId,
      name: loc.name,
      chain: loc.chain ?? null,
      address: loc.address
        ? {
            line1: loc.address.addressLine1 ?? '',
            city: loc.address.city ?? '',
            state: loc.address.state ?? '',
            zip: loc.address.zipCode ?? '',
          }
        : null,
    }))
    res.json({ locations })
  } catch (e) {
    console.error('Kroger locations error:', e)
    res.status(500).json({ error: String(e?.message ?? e) })
  }
}
