/**
 * POST /api/kroger/match  { user, items: [{ key, name|term }], locationId? }
 * For each shopping item, searches Kroger products at the user's store and
 * returns the top match plus a few alternates (for the editable review UI).
 */
import { sql, getAppToken, krogerApiGet } from './_kroger.js'

function pickImage(images) {
  if (!Array.isArray(images)) return null
  const featured = images.find((i) => i.featured) ?? images[0]
  if (!featured?.sizes) return null
  // Prefer larger renditions first — the card shows the photo at ~132px, so a
  // thumbnail looks blurry. Fall back down the chain if a size is missing.
  for (const size of ['large', 'xlarge', 'medium', 'small', 'thumbnail']) {
    const found = featured.sizes.find((z) => z.size === size)
    if (found) return found.url
  }
  return featured.sizes[0]?.url ?? null
}

function toProduct(p) {
  const item = p.items?.[0] ?? {}
  const price = item.price ? (item.price.promo > 0 ? item.price.promo : item.price.regular) : null
  return {
    upc: p.upc ?? p.productId,
    brand: p.brand ?? null,
    description: p.description ?? '',
    size: item.size ?? null,
    price,
    image: pickImage(p.images),
    fulfillment: item.fulfillment ?? null,
    stockLevel: item.inventory?.stockLevel ?? null,
  }
}

/** Run async fn over items with a small concurrency cap (preserves order). */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { user, items, locationId: bodyLoc } = req.body ?? {}
  if (!user) return res.status(400).json({ error: 'Missing user' })
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'No items to match' })

  let locationId = bodyLoc
  if (!locationId) {
    const [row] = await sql`SELECT location_id FROM kroger_tokens WHERE username = ${user}`
    locationId = row?.location_id ?? null
  }
  if (!locationId) return res.status(400).json({ error: 'no_store', message: 'Select a Kroger store first.' })

  try {
    const token = await getAppToken()
    const matches = await mapLimit(items, 6, async (it) => {
      const term = String(it.term ?? it.name ?? '').trim()
      if (!term) return { key: it.key, term, best: null, alternates: [] }
      const resp = await krogerApiGet(
        `/v1/products?filter.locationId=${encodeURIComponent(locationId)}` +
          `&filter.term=${encodeURIComponent(term)}&filter.limit=5`,
        token,
      )
      if (!resp.ok) return { key: it.key, term, best: null, alternates: [], error: resp.status }
      const json = await resp.json()
      const products = (json.data ?? []).map(toProduct).filter((p) => p.upc)
      return { key: it.key, term, best: products[0] ?? null, alternates: products.slice(0, 5) }
    })
    res.json({ locationId, matches })
  } catch (e) {
    console.error('Kroger match error:', e)
    res.status(500).json({ error: String(e?.message ?? e) })
  }
}
