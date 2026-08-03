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

/**
 * Words that describe a *prepared form* of an ingredient rather than the ingredient itself.
 *
 * Kroger's own relevance is tuned for shoppers browsing, not for recipes: searching "chicken
 * breast" returns "Oscar Mayer Deli Fresh Rotisserie Seasoned Chicken Breast Thin Sliced
 * Lunchmeat" first, because it matches more words. A recipe asking for chicken breast wants the
 * raw cut.
 *
 * Crucially these only ever penalise a product when the **search term itself doesn't contain the
 * word** — so "marinara sauce" isn't punished for saying sauce, and "sliced almonds" still finds
 * sliced almonds. The list is about words the recipe *didn't* ask for.
 */
const PREPARED_FORM_WORDS = [
  'lunchmeat', 'luncheon', 'deli', 'sliced', 'seasoned', 'rotisserie', 'marinated', 'breaded',
  'nugget', 'nuggets', 'patty', 'patties', 'jerky', 'canned', 'soup', 'broth', 'stock',
  'flavored', 'seasoning', 'gravy', 'sauce', 'dip', 'spread', 'kit', 'entree', 'sandwich',
  'wrap', 'pizza', 'frozen', 'dried', 'powder', 'juice', 'snack', 'chips', 'bar', 'bars',
  'dog', 'cat', 'pet', 'roll', 'stuffed', 'topping', 'salad', 'patties', 'patty', 'blend',
  // Variety words that change *what the ingredient is* when the recipe didn't ask for them:
  // a search for "onion" should not land on green onions. Harmless when the term says it —
  // "Green chiles" and "green beans" contain the word, so the penalty never fires for them.
  'green',
]

/**
 * Things you do to an ingredient *after* buying it. These carry no information about which
 * product to put in the cart, and Kroger matches them against product text, so leaving them in
 * returns nothing at all ("Fresh basil (chopped)" matched no products whatsoever).
 */
const PREP_WORDS = new Set([
  'chopped', 'diced', 'minced', 'cubed', 'crushed', 'halved', 'quartered', 'julienned',
  'peeled', 'seeded', 'trimmed', 'torn', 'packed', 'divided', 'softened', 'melted', 'drained',
  'rinsed', 'beaten', 'separated', 'warmed', 'optional', 'finely', 'roughly', 'thinly',
  'freshly', 'plus', 'more', 'needed', 'taste', 'garnish', 'serving', 'room', 'temperature',
  'cut', 'and', 'or', 'for', 'to',
])

/**
 * Turn an ingredient name into something Kroger's product search can answer.
 *
 * The parenthetical is **not** uniformly droppable, which an earlier version of this got wrong:
 * "(chopped)" is prep and must go, but "(fresh)" and "(shredded)" are the *product form* and are
 * the entire point of the line — stripping them returned dried dill weed for fresh dill, and a
 * ball of fresh mozzarella for shredded. So prep words are removed and everything else is kept.
 */
function normalizeTerm(raw) {
  const s = String(raw)
  const kept = s.replace(/\(([^)]*)\)/g, (_, inner) => {
    const words = tokens(inner).filter((w) => !PREP_WORDS.has(w))
    return words.length ? ` ${words.join(' ')} ` : ' '
  })
  const cleaned = kept.replace(/\s+/g, ' ').trim()
  return cleaned || s.trim()
}

function tokens(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Words that qualify an ingredient without identifying it. A product missing one of these is
 * still plausibly the right product ("Simple Truth Organic Basil" for "fresh basil"), so their
 * absence must not be punished the way a missing *noun* is.
 */
const GENERIC_MODIFIERS = new Set([
  'fresh', 'whole', 'large', 'small', 'lean', 'light', 'plain', 'organic', 'natural', 'raw',
  'boneless', 'skinless', 'unsalted', 'salted', 'low', 'fat', 'free', 'style', 'extra',
  'virgin', 'pure', 'real', 'baby', 'mini', 'jumbo',
  // Packaging / preparation state. These describe how the thing is sold, and shoppers say them
  // but product descriptions mostly don't — treating them as identifying meant real green chiles
  // scored −25 for failing to say "canned", losing to refried *beans* that happened to.
  'canned', 'jarred', 'bottled', 'boxed', 'concentrate', 'cooked',
])

/** Split a term's words into the ones that identify the ingredient and the ones that qualify it. */
function termParts(termWords) {
  const essential = []
  const generic = []
  for (const w of termWords) {
    if (/^\d+$/.test(w)) continue // "80", "90" in "Ground beef 90% lean" — pack maths, not identity
    if (GENERIC_MODIFIERS.has(w)) generic.push(w)
    else essential.push(w)
  }
  // A term made entirely of modifiers ("Fresh") still has to match something.
  return essential.length ? { essential, generic } : { essential: generic, generic: [] }
}

/**
 * Words that only ever narrow a Kroger query without steering it anywhere useful. Percentages and
 * grades ("90", "lean") describe a variant within an aisle, not the aisle — and Kroger ANDs the
 * search, so including them returned a single product for "Ground beef 90% lean", and it was
 * turkey. They still count in {@link scoreProduct}; they just don't get to shrink the pool.
 *
 * Note what is deliberately *not* here: "canned", "fresh", "shredded". Those steer which aisle
 * you land in — dropping "canned" from a search for canned tomatoes returns fresh Roma tomatoes —
 * so they stay in the query even though they're only tie-breakers when scoring.
 */
const QUERY_NOISE = new Set(['lean', 'concentrate', 'style', 'pure', 'real'])

/** The query sent to Kroger: the term minus pack maths and words that only constrain it. */
function searchTermFor(term) {
  const words = tokens(term).filter((w) => !/^\d+$/.test(w) && !QUERY_NOISE.has(w))
  return words.length ? words.join(' ') : term
}

/**
 * Whole-word match, tolerating simple plurals ("Potatoes" ↔ "Potato", "Egg" ↔ "Eggs").
 * Substring matching was not safe here — it makes "Egg" match "Eggplant".
 */
function hasWord(descWords, w) {
  if (descWords.includes(w)) return true
  if (descWords.includes(`${w}s`)) return true
  if (w.endsWith('s') && descWords.includes(w.slice(0, -1))) return true
  if (w.endsWith('es') && descWords.includes(w.slice(0, -2))) return true
  return false
}

/**
 * How well `product` answers a recipe asking for `term`. Higher is better; only relative order
 * matters. Deliberately a handful of transparent rules rather than a similarity model — this runs
 * per shopping-list item on every order and has to be debuggable from the description alone.
 */
function scoreProduct(term, product) {
  const desc = String(product.description ?? '').toLowerCase()
  if (!desc) return -Infinity

  const termLower = term.toLowerCase()
  const termWords = tokens(term)
  const descWords = tokens(desc)
  const { essential, generic } = termParts(termWords)
  let score = 0

  /*
   * Essential words identify the *thing*; missing one is disqualifying. Generic modifiers only
   * break ties.
   *
   * An earlier version used "last word = head noun", which reads well for "fresh basil" and
   * fails badly for "Ground beef 90% lean" — the last word is "lean", which Jennie-O's *turkey*
   * satisfies perfectly, so turkey won a search for beef. Splitting by how informative a word is,
   * rather than where it sits, survives both shapes.
   */
  for (const w of essential) {
    if (hasWord(descWords, w)) score += 12
    else score -= 25
  }
  for (const w of generic) {
    if (hasWord(descWords, w)) score += 3
  }

  // The whole term as a contiguous phrase is the strongest signal available:
  // "Fresh Basil" is basil; "Fresh Mozzarella … Basil" is not.
  if (termWords.length > 1 && desc.includes(termLower)) score += 12

  // "Chicken Breast Value Pack" beats "… Chicken Breast …" buried mid-description.
  if (desc.startsWith(termLower)) score += 6

  // Forms the recipe didn't ask for.
  for (const w of PREPARED_FORM_WORDS) {
    if (!termLower.includes(w) && descWords.includes(w)) score -= 6
  }

  // Every extra qualifier past the search term is another way the product is *not* the plain
  // ingredient. Small weight — it only breaks ties between otherwise equal candidates.
  score -= Math.max(0, descWords.length - termWords.length) * 0.8

  // A product with no price at this store is usually not carried; prefer one we can total.
  if (product.price != null) score += 2

  return score
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
      const term = normalizeTerm(it.term ?? it.name ?? '')
      if (!term) return { key: it.key, term, best: null, alternates: [] }

      /*
       * Kroger ANDs the search words, so a long ingredient name can match nothing at all
       * ("chicken stock concentrate" returned zero products). Drop the trailing word and try
       * again until something comes back — the words are ordered least-to-most general in
       * practice, so the tail is what over-constrains. Two extra calls at worst, and only for
       * terms that would otherwise show "No Kroger match found".
       */
      let words = searchTermFor(term).split(' ')
      let products = []
      let lastStatus = null
      while (words.length > 0) {
        // 12, not 5: the re-ranking below can only promote the right product if it came back at
        // all, and Kroger often buries the plain cut behind prepared variants.
        const resp = await krogerApiGet(
          `/v1/products?filter.locationId=${encodeURIComponent(locationId)}` +
            `&filter.term=${encodeURIComponent(words.join(' '))}&filter.limit=12`,
          token,
        )
        if (!resp.ok) {
          lastStatus = resp.status
          break
        }
        const json = await resp.json()
        products = (json.data ?? []).map(toProduct).filter((p) => p.upc)
        if (products.length > 0) break
        words = words.slice(0, -1)
      }
      if (products.length === 0) {
        return { key: it.key, term, best: null, alternates: [], ...(lastStatus ? { error: lastStatus } : {}) }
      }

      // Sort by our own recipe-shaped score rather than trusting Kroger's shopper relevance.
      // Array#sort is stable, so equally-scored products keep Kroger's original ordering.
      const ranked = products
        .map((p) => ({ p, score: scoreProduct(term, p) }))
        .sort((a, b) => b.score - a.score)
        .map(({ p }) => p)
      return { key: it.key, term, best: ranked[0] ?? null, alternates: ranked.slice(0, 8) }
    })
    res.json({ locationId, matches })
  } catch (e) {
    console.error('Kroger match error:', e)
    res.status(500).json({ error: String(e?.message ?? e) })
  }
}
