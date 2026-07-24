/**
 * POST /api/kroger/cart-add  { user, items: [{ upc, quantity, modality? }], modality? }
 * Adds items to the authenticated user's Kroger cart (PUT /v1/cart/add).
 *
 * NOTE: Kroger's public API only ADDS to the cart — it cannot place/pay for an
 * order. The user completes checkout on Kroger.com / the Kroger app afterward.
 * A successful add returns HTTP 204 (no content).
 */
import { API_BASE, getUserToken, KrogerNotConnectedError } from './_kroger.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { user, items, modality } = req.body ?? {}
  if (!user) return res.status(400).json({ error: 'Missing user' })
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'No items to add' })

  const cartItems = items
    .filter((i) => i.upc)
    .map((i) => ({
      upc: String(i.upc),
      quantity: Math.max(1, Number(i.quantity) || 1),
      modality: i.modality || modality || 'PICKUP',
    }))
  if (cartItems.length === 0) return res.status(400).json({ error: 'No valid UPCs to add' })

  try {
    const { accessToken } = await getUserToken(user)
    const resp = await fetch(`${API_BASE}/v1/cart/add`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cartItems }),
    })

    if (resp.status === 204) return res.json({ ok: true, count: cartItems.length })

    const detail = await resp.text().catch(() => '')
    if (resp.status === 401 || resp.status === 403) {
      return res.status(401).json({ error: 'not_connected', message: 'Kroger session expired; please reconnect.' })
    }
    return res.status(502).json({ error: `Kroger cart add failed (${resp.status})`, detail })
  } catch (e) {
    if (e instanceof KrogerNotConnectedError) {
      return res.status(401).json({ error: 'not_connected', message: e.message })
    }
    console.error('Kroger cart-add error:', e)
    res.status(500).json({ error: String(e?.message ?? e) })
  }
}
