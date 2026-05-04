import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const [recipes, sections, lines, instructions, sides] = await Promise.all([
      sql`SELECT * FROM recipes ORDER BY title`,
      sql`SELECT * FROM ingredient_sections ORDER BY recipe_id, sort_order`,
      sql`SELECT * FROM ingredient_lines ORDER BY section_id, sort_order`,
      sql`SELECT * FROM recipe_instructions ORDER BY recipe_id, sort_order`,
      sql`SELECT * FROM recipe_recommended_sides`,
    ])

    const assembled = recipes.map(recipe => ({
      ...recipe,
      owner: recipe.Owner ?? null,
      visibility: recipe.visibility ?? 'public',
      forkedFromRecipeId: recipe.forked_from_recipe_id ?? null,
      tags: recipe.tags ?? [],
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

    res.json({ version: 2, recipes: assembled })
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}
