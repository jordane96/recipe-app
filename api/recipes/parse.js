import { neon } from '@neondatabase/serverless'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { PROTEINS, METHODS, CUISINES, ADDITIONAL, normalizeTags } from '../_tags.js'
import { z } from 'zod'

const sql = neon(process.env.DATABASE_URL)

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

/** Pull schema.org/Recipe JSON-LD out of raw HTML without a DOM parser. */
function extractRecipeJsonLd(html) {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  for (const m of blocks) {
    let data
    try {
      data = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    const recipe = findRecipeNode(data)
    if (recipe) return recipe
  }
  return null
}

function findRecipeNode(data) {
  if (!data) return null
  if (Array.isArray(data)) {
    for (const x of data) {
      const r = findRecipeNode(x)
      if (r) return r
    }
    return null
  }
  if (typeof data !== 'object') return null
  const t = data['@type']
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return data
  if (data['@graph']) return findRecipeNode(data['@graph'])
  return null
}

/** Flatten recipeInstructions (HowToStep / HowToSection / strings) into ordered step strings. */
function flattenInstructions(instr) {
  if (!instr) return []
  if (typeof instr === 'string') {
    return instr.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean)
  }
  if (!Array.isArray(instr)) return []
  const out = []
  for (const s of instr) {
    if (typeof s === 'string') {
      out.push(s)
    } else if (s['@type'] === 'HowToSection') {
      for (const i of s.itemListElement ?? []) out.push(i.text ?? i.name)
    } else {
      out.push(s.text ?? s.name)
    }
  }
  return out.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
}

/** Render a JSON-LD recipe into plain text for the AI extractor (which handles catalog matching). */
function recipeJsonLdToText(recipe, sourceUrl) {
  const lines = []
  if (recipe.name) lines.push(recipe.name)
  if (recipe.recipeYield != null) {
    lines.push(`Servings: ${Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield}`)
  }
  if (recipe.description && typeof recipe.description === 'string') {
    lines.push('', recipe.description)
  }
  const ings = recipe.recipeIngredient ?? []
  if (ings.length) {
    lines.push('', 'Ingredients:')
    for (const i of ings) lines.push(`- ${i}`)
  }
  const steps = flattenInstructions(recipe.recipeInstructions)
  if (steps.length) {
    lines.push('', 'Instructions:')
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
  }
  if (sourceUrl) lines.push('', `Source: ${sourceUrl}`)
  return lines.join('\n')
}

/**
 * Resolve a recipe URL to plain text the AI can parse.
 * 1. Direct fetch with a realistic browser UA (works for Condé Nast, Food Network, NYT, blogs).
 * 2. Fall back to the Internet Archive's latest snapshot — defeats the TLS-fingerprint bot walls
 *    on the Dotdash Meredith network (AllRecipes, SeriousEats, SimplyRecipes, EatingWell).
 * Returns { text, sourceUrl } or null if neither path yields a JSON-LD Recipe.
 */
async function resolveRecipeTextFromUrl(url) {
  // Tier 1: direct
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (res.ok) {
      const recipe = extractRecipeJsonLd(await res.text())
      if (recipe) return { text: recipeJsonLdToText(recipe, url), sourceUrl: url }
    }
  } catch {
    /* fall through to Wayback */
  }

  // Tier 2: Internet Archive snapshot
  try {
    const api = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
    )
    const snap = (await api.json())?.archived_snapshots?.closest?.url
    if (snap) {
      const res = await fetch(snap)
      if (res.ok) {
        const recipe = extractRecipeJsonLd(await res.text())
        if (recipe) return { text: recipeJsonLdToText(recipe, url), sourceUrl: url }
      }
    }
  } catch {
    /* fall through */
  }

  return null
}

function slugify(name) {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'item'
}

const ingredientLineSchema = z.object({
  ingredientId: z.string().nullable().describe('Library ID if you matched it (even loosely), null if new ingredient.'),
  potentialMatch: z.boolean().nullable().describe('Set true when ingredientId is set but you are not confident — the user will be asked to confirm.'),
  ingredientName: z.string().nullable().describe('Required when ingredientId is null — the free-text name for a new library entry.'),
  ingredientUnitKind: z.enum(['volume', 'weight', 'count', 'other']).nullable().describe('Required when ingredientId is null.'),
  ingredientCategory: z.enum(['produce', 'proteins', 'dairy', 'pantry', 'spices', 'oils-sauces', 'baking', 'other']).nullable().describe('Required when ingredientId is null.'),
  amount: z.number().nullable().describe('null for qualitative amounts (to taste, drizzle, pinch).'),
  unit: z.string().nullable().describe('null for qualitative amounts.'),
  note: z.string().nullable(),
})

const parsedRecipeSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  servings: z
    .number()
    .nullable()
    .describe(
      'How many people the recipe as written feeds. Use the stated yield; if unstated, infer from the ingredient quantities. Null only when there are no quantities to reason from.',
    ),
  course: z.enum(['main', 'side']),
  // Tags are a closed vocabulary split into facets (see docs/tag-reconciliation.md). Modelling
  // them as separate enum fields rather than one free-text array is what stops the model from
  // inventing variants like "Italian-American" or "crock pot" alongside "crock-pot".
  protein: z.enum(PROTEINS).nullable().describe('Main protein. "veggie" when the dish has no meat.'),
  method: z
    .enum(METHODS)
    .nullable()
    .describe(
      'The appliance that defines how the dish is cooked. When several are used, pick the distinguishing one in this order: crock-pot, grill, air-fryer, baked, stovetop. Null only if nothing is cooked.',
    ),
  cuisine: z.enum(CUISINES).nullable().describe('Only when the dish clearly belongs to one.'),
  additionalTags: z.array(z.enum(ADDITIONAL)).describe('Empty array unless clearly applicable.'),
  ingredientSections: z.array(z.object({
    name: z.string(),
    lines: z.array(ingredientLineSchema),
  })),
  instructions: z.array(z.object({
    text: z.string(),
    note: z.string().nullable(),
    durationSeconds: z.number().nullable().describe('Duration the step calls for, in seconds. Use the lower end of any range; if multiple times are mentioned, use the first.'),
  })),
  sourceUrl: z.string().nullable(),
  notes: z.string().nullable(),
})

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Break the input into title, servings, ingredients, and instructions, and return everything in the required structure.

INGREDIENTS
You will receive an ingredient library (id: name). For each ingredient in the recipe:
1. Look for a match in the library. Matches do NOT have to be exact — "creamy peanut butter" matches "peanut butter", "russet potato" matches "potato", "extra-virgin olive oil" matches "olive oil". When you find a close match, use that library ID as ingredientId.
2. If you are confident the match is right, leave potentialMatch null (or false).
3. If a match is plausible but you are not confident (unusual variant, ambiguous name, significant difference in form/preparation), still set the matching ingredientId AND set potentialMatch: true. The user will be asked to confirm.
4. If no library entry comes close, set ingredientId to null and provide ingredientName, ingredientUnitKind, and ingredientCategory so a new library entry can be created. The category must come from the allowed list (produce, proteins, dairy, pantry, spices, oils-sauces, baking, other).

AMOUNTS
• US units only:
  - volume: tsp, tbsp, cup
  - weight: oz, lb
  - count: each, clove, pouch, pack, bunch, box, container, bottle, steak, piece, slice, peppers, handful, sqz
• Use count units whenever an ingredient is naturally counted rather than measured (e.g. "2 eggs" → amount 2, unit "each"; "3 cloves garlic" → amount 3, unit "clove"; "1 bunch parsley" → amount 1, unit "bunch"). Do not fall back to weight/volume when count is the natural fit.
• Pick the count unit that best matches the source phrasing — prefer "clove" for garlic, "bunch" for herbs, "slice" for bread/cheese, "piece" or "each" for whole items, etc. Only use a count unit from the list above; if none fits, use "each".
• Convert fractions to decimals: ½→0.5, ¼→0.25, ¾→0.75, ⅓→0.333
• Qualitative amounts (to taste, drizzle, pinch, as needed): set amount and unit to null

INSTRUCTIONS
• List each step from the recipe in the order it appears.
• If a step mentions a duration (cook 10 minutes, simmer 5–7 minutes, etc.), set durationSeconds to that duration in seconds.
  - For a range, use the LOWER end. "5–7 minutes" → 300.
  - If multiple times are mentioned in one step, use the FIRST one.
  - Otherwise leave durationSeconds as null.

OTHER
• Preserve section names from the source (e.g. "For the sauce:", "Marinade:"); otherwise use "Main".
• servings: how many people the recipe as written feeds. Take the stated yield when the source gives
  one ("Serves 4", "Yield: 6 portions", "makes 12 cookies" -> 12). If the source does not state it,
  INFER it from the ingredient quantities rather than giving up — typical single portions are ~4-6 oz
  boneless protein, ~2-3 oz dry pasta or rice, ~1 bread roll, 1-2 tortillas. So 10 oz chicken + 2 pita
  is 2 servings; 1 lb ground beef is 4. Meal-kit style recipes (stock concentrate pouches, "mini"
  produce, 10 oz protein) are almost always 2. Only use null if the input has no quantities at all to
  reason from. Never guess 1 just because the yield is unstated — 1 is rare for a full recipe.
• course: "main" for entrees/mains, "side" for sides/salads/appetizers/snacks.

TAGS — each is a closed list. Never invent a value outside it; use null / an empty array instead.
• protein: chicken | beef | pork | turkey | lamb | seafood | egg | veggie. Judge by the substantial
  protein, not by stock or broth — a pasta side seasoned with chicken stock concentrate is "veggie".
  Use "veggie" for any dish with no meat, including tofu and bean dishes. Null only when the recipe
  leaves it open (e.g. "leftover filling").
• method: crock-pot | pressure-cooker | air-fryer | grill | smoker | baked | stovetop | sous-vide |
  no-cook. Read the INSTRUCTIONS, not the title. Many recipes use two — a crock pot plus a browning
  step, an air fryer plus boiling pasta. Pick the distinguishing appliance, the one that changes how
  the cook plans their day, in this priority: crock-pot > pressure-cooker > smoker > grill >
  sous-vide > air-fryer > baked > stovetop. If an appliance only cooks a garnish or a side
  component, it is NOT the method. Use "no-cook" for dips, dressings and assembled salads that are
  never heated — prefer it over null.
• cuisine: italian | french | spanish | greek | german | mexican | caribbean | american | southern |
  cajun | indian | thai | chinese | japanese | korean | vietnamese | asian | middle-eastern |
  north-african | lithuanian. Prefer the specific country over the generic "asian" — use "asian"
  only for fusion or when the dish genuinely spans several (e.g. Thai curry paste with Japanese
  mirin). A single soy-glazed ingredient does not make a dish Asian. Null when it belongs to no
  particular tradition.
• additionalTags: any of [quick, one-pot, meal-prep, kid-friendly, spicy, vegan, gluten-free,
  dairy-free, keto, low-carb, high-protein]. Only when clearly true from the recipe itself — do not
  infer "gluten-free" from the absence of flour, or "quick" from a missing time. "quick" means under
  about 30 minutes total. Empty array when nothing clearly applies.
• sourceUrl: only include if a URL appears literally in the input.

The recipe owner will be set automatically by the system — do not include it.

For all nullable fields, use null when unknown rather than omitting the field.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text, imageBase64, mimeType, images, url } = req.body ?? {}
  // Accept either a single image (legacy { imageBase64, mimeType }) or an array of them
  // ({ images: [{ imageBase64, mimeType }, …] }) — e.g. multiple screenshots of one recipe.
  const imageList = (Array.isArray(images) && images.length
    ? images
    : imageBase64
      ? [{ imageBase64, mimeType }]
      : []
  ).filter((img) => img && typeof img.imageBase64 === 'string' && img.imageBase64.length > 0)
  if (!text && imageList.length === 0 && !url) {
    return res.status(400).json({ error: 'Provide text, image(s), or url' })
  }

  // URL import: resolve to clean recipe text (direct fetch → Wayback fallback), then run it
  // through the same AI extractor below so catalog matching / verify-match all work the same.
  let resolvedText = text
  let importedSourceUrl = null
  if (url && !text && imageList.length === 0) {
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Enter a valid http(s) URL.' })
    }
    const resolved = await resolveRecipeTextFromUrl(url)
    if (!resolved) {
      return res.status(422).json({
        error:
          "Couldn't read a recipe from that link. Open the page, copy the recipe, and use Paste text instead.",
      })
    }
    resolvedText = resolved.text
    importedSourceUrl = resolved.sourceUrl
  }

  const rows = await sql`SELECT id, name FROM ingredients ORDER BY name`
  const libraryText = rows.map(r => `${r.id}: ${r.name}`).join('\n')

  const userContent = []
  for (const img of imageList) {
    userContent.push({
      type: 'image',
      image: Buffer.from(img.imageBase64, 'base64'),
      mimeType: img.mimeType ?? 'image/jpeg',
    })
  }
  const imageInstruction =
    imageList.length > 1
      ? 'The images above are multiple photos/screenshots of ONE recipe (e.g. a recipe split across several screens). Combine them into a single recipe, in order.'
      : 'Extract the recipe from the image above.'
  userContent.push({
    type: 'text',
    text: `Ingredient library:\n${libraryText}\n\n${resolvedText ? `Recipe text:\n${resolvedText}` : imageInstruction}`,
  })

  let object
  try {
    const result = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: parsedRecipeSchema,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      maxOutputTokens: 4096,
    })
    object = result.object
  } catch (e) {
    console.error('Parse error:', e)
    return res.status(502).json({ error: 'AI service error — try again.' })
  }

  const existingIds = new Set(rows.map(r => r.id))
  const usedNewIds = new Set()

  /**
   * Mint an id for a "new" ingredient. The slug IS the id (no `custom-` prefix anymore —
   * legacy distinction caused duplicate-row bugs and id leaks in the UI).
   *
   * If the slug already exists in the library, reuse it — the AI flagged this as "new" but
   * it actually matches an existing entry. Cheap deduplication on the server side; the
   * client UI will get the existing id back and merge correctly in the shopping list.
   *
   * Returns { id, isExisting } so the caller knows whether to also push a new ingredient def.
   */
  function makeIdForNew(name) {
    const slug = slugify(name)
    if (existingIds.has(slug)) {
      return { id: slug, isExisting: true }
    }
    let id = slug
    let n = 2
    while (existingIds.has(id) || usedNewIds.has(id)) {
      id = `${slug}-${n++}`
    }
    usedNewIds.add(id)
    existingIds.add(id)
    return { id, isExisting: false }
  }

  const customIngredientDefs = []

  const ingredientSections = object.ingredientSections.map(sec => ({
    name: sec.name || 'Main',
    lines: sec.lines.map(line => {
      if (line.ingredientId && existingIds.has(line.ingredientId)) {
        return {
          ingredientId: line.ingredientId,
          amount: line.amount,
          unit: line.unit,
          ...(line.note ? { note: line.note } : {}),
          ...(line.potentialMatch ? { potentialMatch: true } : {}),
        }
      }
      const { id, isExisting } = makeIdForNew(line.ingredientName ?? 'item')
      if (!isExisting) {
        customIngredientDefs.push({
          id,
          name: line.ingredientName ?? 'Unknown ingredient',
          unit: line.ingredientUnitKind ?? 'other',
          category: line.ingredientCategory ?? 'other',
        })
      }
      return {
        ingredientId: id,
        amount: line.amount,
        unit: line.unit,
        ...(line.note ? { note: line.note } : {}),
      }
    }),
  }))

  // Course (main/side) is stored as a tag rather than a separate field. The facets are flattened
  // back into the single tags array the rest of the app reads, deduped and in facet order so the
  // stored value is stable regardless of what order the model returned things in.
  const courseTag = object.course === 'side' ? 'side' : 'main'
  const tags = normalizeTags([
    courseTag,
    object.protein,
    object.method,
    object.cuisine,
    ...(object.additionalTags ?? []),
  ])

  const draft = {
    title: object.title,
    ...(object.description ? { description: object.description } : {}),
    // Never persist a missing yield. Without a base, the servings stepper becomes a silent
    // no-op — scaling is amount x (target / base), so there is nothing to divide by and
    // quantities stay put while the counter climbs. 1 is the last-resort fallback only.
    servings: Number.isFinite(object.servings) && object.servings > 0 ? Math.round(object.servings) : 1,
    type: 'recipe',
    tags,
    ingredientSections,
    instructions: object.instructions.map(s => ({
      text: s.text,
      ...(s.durationSeconds != null && s.durationSeconds > 0 ? { durationSeconds: s.durationSeconds } : {}),
      ...(s.note ? { note: s.note } : {}),
    })),
    ...(customIngredientDefs.length ? { customIngredientDefs } : {}),
    ...((importedSourceUrl || object.sourceUrl)
      ? { sourceUrl: importedSourceUrl || object.sourceUrl }
      : {}),
    ...(object.notes ? { notes: object.notes } : {}),
  }

  res.json(draft)
}
