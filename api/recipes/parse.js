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
• servings: extract if stated, otherwise null.
• course: "main" for entrees/mains, "side" for sides/salads/appetizers/snacks.
• tags: only if explicitly stated (cuisine, dietary). Empty array if unclear.
• sourceUrl: only include if a URL appears literally in the input.

The recipe owner will be set automatically by the system — do not include it.

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
          ...(line.potentialMatch ? { potentialMatch: true } : {}),
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
      ...(s.durationSeconds != null && s.durationSeconds > 0 ? { durationSeconds: s.durationSeconds } : {}),
      ...(s.note ? { note: s.note } : {}),
    })),
    ...(customIngredientDefs.length ? { customIngredientDefs } : {}),
    ...(object.sourceUrl ? { sourceUrl: object.sourceUrl } : {}),
    ...(object.notes ? { notes: object.notes } : {}),
  }

  res.json(draft)
}
