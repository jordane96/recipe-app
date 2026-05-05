import { neon } from '@neondatabase/serverless'
import { randomUUID } from 'crypto'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  const { id } = req.query

  if (req.method === 'DELETE') {
    const currentUser = req.query.user ?? null
    const [existing] = await sql`SELECT "Owner" FROM recipes WHERE id = ${id}`
    if (!existing) return res.status(404).json({ error: 'Recipe not found' })
    if (existing.Owner !== currentUser) return res.status(403).json({ error: 'Not your recipe' })

    try {
      const sections = await sql`SELECT id FROM ingredient_sections WHERE recipe_id = ${id}`
      for (const sec of sections) {
        await sql`DELETE FROM ingredient_lines WHERE section_id = ${sec.id}`
      }
      await sql`DELETE FROM ingredient_sections WHERE recipe_id = ${id}`
      await sql`DELETE FROM recipe_instructions WHERE recipe_id = ${id}`
      await sql`DELETE FROM recipe_recommended_sides WHERE recipe_id = ${id}`
      await sql`DELETE FROM recipes WHERE id = ${id}`
      return res.json({ ok: true })
    } catch (e) {
      console.error('DELETE /api/recipes/[id] error:', e)
      return res.status(500).json({ error: 'Failed to delete recipe' })
    }
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const recipe = req.body
  if (!recipe || typeof recipe.title !== 'string' || !recipe.title.trim()) {
    return res.status(400).json({ error: 'Invalid recipe data' })
  }

  const currentUser = recipe.currentUser ?? null

  try {
    const [existing] = await sql`SELECT "Owner" FROM recipes WHERE id = ${id}`
    if (!existing) return res.status(404).json({ error: 'Recipe not found' })

    let targetId = id
    let forked = false

    if (existing.Owner !== currentUser) {
      targetId = randomUUID()
      forked = true

      await sql`
        INSERT INTO recipes (id, title, description, tags, type, source_url, servings, total_cook_time_minutes, notes, "Owner", visibility, forked_from_recipe_id)
        VALUES (
          ${targetId},
          ${recipe.title.trim()},
          ${recipe.description ?? null},
          ${recipe.tags ?? []},
          ${recipe.type ?? 'recipe'},
          ${recipe.source_url ?? null},
          ${recipe.servings ?? null},
          ${recipe.totalCookTimeMinutes ?? null},
          ${recipe.notes ?? null},
          ${currentUser},
          'private',
          ${id}
        )
      `
    } else {
      await sql`
        UPDATE recipes
        SET title       = ${recipe.title.trim()},
            description = ${recipe.description ?? null},
            tags        = ${recipe.tags ?? []}
        WHERE id = ${targetId}
      `
    }

    for (const def of recipe.customIngredientDefs ?? []) {
      await sql`
        INSERT INTO ingredients (id, name, unit, category)
        VALUES (${def.id}, ${def.name}, ${def.unit}, ${def.category})
        ON CONFLICT (id) DO UPDATE SET
          name     = EXCLUDED.name,
          unit     = EXCLUDED.unit,
          category = EXCLUDED.category
      `
    }

    const existingSections = await sql`
      SELECT id FROM ingredient_sections WHERE recipe_id = ${targetId}
    `
    for (const sec of existingSections) {
      await sql`DELETE FROM ingredient_lines WHERE section_id = ${sec.id}`
    }
    await sql`DELETE FROM ingredient_sections WHERE recipe_id = ${targetId}`

    for (let si = 0; si < (recipe.ingredientSections ?? []).length; si++) {
      const sec = recipe.ingredientSections[si]
      const [newSec] = await sql`
        INSERT INTO ingredient_sections (recipe_id, name, sort_order)
        VALUES (${targetId}, ${sec.name ?? 'Main'}, ${si})
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

    await sql`DELETE FROM recipe_instructions WHERE recipe_id = ${targetId}`
    for (let i = 0; i < (recipe.instructions ?? []).length; i++) {
      const step = recipe.instructions[i]
      await sql`
        INSERT INTO recipe_instructions (recipe_id, sort_order, text, duration_seconds, note, step_ingredients)
        VALUES (
          ${targetId},
          ${i},
          ${step.text ?? ''},
          ${step.durationSeconds ?? null},
          ${step.note ?? null},
          ${step.stepIngredients ?? null}
        )
      `
    }

    res.json({ ok: true, forked, newId: forked ? targetId : null })
  } catch (e) {
    console.error('PUT /api/recipes/[id] error:', e)
    res.status(500).json({ error: 'Failed to save recipe' })
  }
}
