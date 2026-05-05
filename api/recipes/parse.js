import { neon } from '@neondatabase/serverless'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const sql = neon(process.env.DATABASE_URL)

function slugify(name) {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'item'
}

const ingredientLineSchema = z.object({
  ingredientId: z.string().nullable().describe('Exact library ID if matched, null if new ingredient.'),
  ingredientName: z.string().nullable().describe('Required when ingredientId is null — the free-text name.'),
  ingredientUnitKind: z.enum(['volume', 'weight', 'count', 'other']).nullable().describe('Required when ingredientId is null.'),
  ingredientCategory: z.enum(['produce', 'proteins', 'dairy', 'pantry', 'spices', 'oils-sauces', 'baking', 'other']).nullable().describe('Required when ingredientId is null.'),
  amount: z.number().nullable().describe('null for qualitative amounts (to taste, drizzle, pinch).'),
  unit: z.string().nullable().describe('null for qualitative amounts.'),
  note: z.string().nullable(),
})

const parsedRecipeSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  servings: z.number().nullable(),
  course: z.enum(['main', 'side']),
  tags: z.array(z.string()),
  ingredientSections: z.array(z.object({
    name: z.string(),
    lines: z.array(ingredientLineSchema),
  })),
  instructions: z.array(z.object({
    text: z.string(),
    note: z.string().nullable(),
  })),
  sourceUrl: z.string().nullable(),
  notes: z.string().nullable(),
})

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Extract a structured recipe from the user's input.

INGREDIENT MATCHING
You will receive an ingredient library (id: name). For each recipe ingredient:
• If it matches a library entry (same food), use that exact ID as ingredientId.
• If no match exists, set ingredientId to null and provide ingredientName, ingredientUnitKind, and ingredientCategory.

AMOUNTS
• US units only: tsp, tbsp, cup (volume); oz, lb (weight); each, clove, bunch, etc. (count)
• Convert fractions to decimals: ½→0.5, ¼→0.25, ¾→0.75, ⅓→0.333
• Qualitative amounts (to taste, drizzle, pinch, as needed): set amount and unit to null

STRUCTURE
• Preserve section names if they appear (e.g. "For the sauce:", "Marinade:"); otherwise use "Main"
• course: "main" for entrees/mains, "side" for sides/salads/appetizers/snacks
• tags: only include if explicitly stated (cuisine, dietary). Empty array if unclear.
• Only include sourceUrl if a URL appears literally in the input.

For all nullable fields, use null when unknown rather than omitting the field.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text, imageBase64, mimeType } = req.body ?? {}
  if (!text && !imageBase64) {
    return res.status(400).json({ error: 'Provide text or imageBase64' })
  }

  const rows = await sql`SELECT id, name FROM ingredients ORDER BY name`
  const libraryText = rows.map(r => `${r.id}: ${r.name}`).join('\n')

  const userContent = []
  if (imageBase64) {
    userContent.push({
      type: 'image',
      image: Buffer.from(imageBase64, 'base64'),
      mimeType: mimeType ?? 'image/jpeg',
    })
  }
  userContent.push({
    type: 'text',
    text: `Ingredient library:\n${libraryText}\n\n${text ? `Recipe text:\n${text}` : 'Extract the recipe from the image above.'}`,
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
  const usedCustomIds = new Set()

  function makeCustomId(name) {
    const slug = slugify(name)
    let id = `custom-${slug}`
    let n = 2
    while (existingIds.has(id) || usedCustomIds.has(id)) {
      id = `custom-${slug}-${n++}`
    }
    usedCustomIds.add(id)
    existingIds.add(id)
    return id
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
        }
      }
      const id = makeCustomId(line.ingredientName ?? 'item')
      customIngredientDefs.push({
        id,
        name: line.ingredientName ?? 'Unknown ingredient',
        unit: line.ingredientUnitKind ?? 'other',
        category: line.ingredientCategory ?? 'other',
      })
      return {
        ingredientId: id,
        amount: line.amount,
        unit: line.unit,
        ...(line.note ? { note: line.note } : {}),
      }
    }),
  }))

  // Course (main/side) is stored as a tag rather than a separate field.
  const courseTag = object.course === 'side' ? 'side' : 'main'
  const tags = object.tags.includes(courseTag) ? object.tags : [...object.tags, courseTag]

  const draft = {
    title: object.title,
    ...(object.description ? { description: object.description } : {}),
    ...(object.servings != null ? { servings: object.servings } : {}),
    type: 'recipe',
    tags,
    ingredientSections,
    instructions: object.instructions.map(s => ({
      text: s.text,
      ...(s.note ? { note: s.note } : {}),
    })),
    ...(customIngredientDefs.length ? { customIngredientDefs } : {}),
    ...(object.sourceUrl ? { sourceUrl: object.sourceUrl } : {}),
    ...(object.notes ? { notes: object.notes } : {}),
  }

  res.json(draft)
}
