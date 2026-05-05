import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { recipeId } = req.query
  const username = req.query.user ?? null
  if (typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'user query param required' })
  }
  if (typeof recipeId !== 'string' || !recipeId.trim()) {
    return res.status(400).json({ error: 'recipeId required' })
  }
  try {
    await sql`
      DELETE FROM recipe_saves
      WHERE username = ${username.trim()} AND recipe_id = ${recipeId.trim()}
    `
    return res.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/saves/[recipeId] error:', e)
    return res.status(500).json({ error: 'Failed to remove save' })
  }
}
