import { neon } from '@neondatabase/serverless'
import { normalizeTags } from './_tags.js'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const currentUser = req.query.user ?? null
    const [recipes, sections, lines, instructions, sides, saves] = await Promise.all([
      sql`SELECT * FROM recipes ORDER BY title`,
      sql`SELECT * FROM ingredient_sections ORDER BY recipe_id, sort_order`,
      sql`SELECT * FROM ingredient_lines ORDER BY section_id, sort_order`,
      sql`SELECT * FROM recipe_instructions ORDER BY recipe_id, sort_order`,
      sql`SELECT * FROM recipe_recommended_sides`,
      currentUser
        ? sql`SELECT recipe_id FROM recipe_saves WHERE username = ${currentUser}`
        : Promise.resolve([]),
    ])

    const assembled = recipes.map(recipe => ({
      ...recipe,
      owner: recipe.Owner ?? null,
      visibility: recipe.visibility ?? 'public',
      forkedFromRecipeId: recipe.forked_from_recipe_id ?? null,
      // The DB column is snake_case; the client type is `sourceUrl`. Without this the imported
      // source link never reaches the UI and the "Original recipe" link silently never renders.
      sourceUrl: recipe.source_url ?? undefined,
      totalCookTimeMinutes: recipe.total_cook_time_minutes ?? undefined,
      // Normalised on read so legacy spellings reach the UI canonical, before any migration.
      tags: normalizeTags(recipe.tags),
      ingredientSections: sections
        .filter(s => s.recipe_id === recipe.id)
        .map(section => ({
          name: section.name,
          lines: lines
            .filter(l => l.section_id === section.id)
            .map(l => ({
              ingredientId: l.ingredient_id,
              amount: l.amount !== null ? Number(l.amount) : null,
              unit: l.unit,
              note: l.note,
            })),
        })),
      instructions: instructions
        .filter(i => i.recipe_id === recipe.id)
        .map(i => ({
          text: i.text,
          ...(i.duration_seconds && { durationSeconds: i.duration_seconds }),
          ...(i.note && { note: i.note }),
          ...(i.step_ingredients && { stepIngredients: i.step_ingredients }),
        })),
      recommendedSides: sides
        .filter(s => s.recipe_id === recipe.id)
        .map(s => ({ recipeId: s.side_recipe_id, label: s.label })),
    }))

    const savedRecipeIds = saves.map(s => s.recipe_id)
    res.json({ version: 2, recipes: assembled, savedRecipeIds })
  } else if (req.method === 'POST') {
    const recipe = req.body
    if (!recipe || typeof recipe.title !== 'string' || !recipe.title.trim()) {
      return res.status(400).json({ error: 'Invalid recipe data' })
    }
    const currentUser = recipe.currentUser ?? null

    const slug = recipe.title.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'recipe'

    const existing = await sql`SELECT id FROM recipes WHERE id LIKE ${slug + '%'}`
    const existingIds = new Set(existing.map(r => r.id))
    let id = slug
    let n = 2
    while (existingIds.has(id)) { id = `${slug}-${n++}` }

    try {
      await sql`
        INSERT INTO recipes (id, title, description, type, tags, servings, source_url, notes, "Owner", visibility)
        VALUES (
          ${id},
          ${recipe.title.trim()},
          ${recipe.description ?? null},
          ${recipe.type ?? 'recipe'},
          ${normalizeTags(recipe.tags)},
          ${recipe.servings ?? null},
          ${recipe.sourceUrl ?? null},
          ${recipe.notes ?? null},
          ${currentUser},
          'public'
        )
      `

      for (const def of recipe.customIngredientDefs ?? []) {
        await sql`
          INSERT INTO ingredients (id, name, unit, category)
          VALUES (${def.id}, ${def.name}, ${def.unit}, ${def.category})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, unit = EXCLUDED.unit, category = EXCLUDED.category
        `
      }

      for (let si = 0; si < (recipe.ingredientSections ?? []).length; si++) {
        const sec = recipe.ingredientSections[si]
        const [newSec] = await sql`
          INSERT INTO ingredient_sections (recipe_id, name, sort_order)
          VALUES (${id}, ${sec.name ?? 'Main'}, ${si})
          RETURNING id
        `
        for (let li = 0; li < (sec.lines ?? []).length; li++) {
          const line = sec.lines[li]
          await sql`
            INSERT INTO ingredient_lines (section_id, ingredient_id, amount, unit, note, sort_order)
            VALUES (${newSec.id}, ${line.ingredientId}, ${line.amount ?? null}, ${line.unit ?? null}, ${line.note ?? null}, ${li})
          `
        }
      }

      for (let i = 0; i < (recipe.instructions ?? []).length; i++) {
        const step = recipe.instructions[i]
        await sql`
          INSERT INTO recipe_instructions (recipe_id, sort_order, text, duration_seconds, note, step_ingredients)
          VALUES (
            ${id}, ${i},
            ${step.text ?? ''},
            ${step.durationSeconds ?? null},
            ${step.note ?? null},
            ${step.stepIngredients ?? null}
          )
        `
      }

      res.status(201).json({ id })
    } catch (e) {
      console.error('POST /api/recipes error:', e)
      res.status(500).json({ error: 'Failed to create recipe' })
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}
