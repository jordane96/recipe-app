import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { username, recipeId } = req.body ?? {}
  if (typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'username required' })
  }
  if (typeof recipeId !== 'string' || !recipeId.trim()) {
    return res.status(400).json({ error: 'recipeId required' })
  }
  try {
    await sql`
      INSERT INTO recipe_saves (username, recipe_id)
      VALUES (${username.trim()}, ${recipeId.trim()})
      ON CONFLICT (username, recipe_id) DO NOTHING
    `
    return res.json({ ok: true })
  } catch (e) {
    console.error('POST /api/saves error:', e)
    return res.status(500).json({ error: 'Failed to save recipe' })
  }
}
