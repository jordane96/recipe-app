import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM ingredients ORDER BY name`
    res.json({ version: 2, ingredients: rows })
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}
