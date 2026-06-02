import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM ingredients ORDER BY name`
    res.json({
      version: 2,
      units: {
        volume: ['tsp', 'tbsp', 'cup', 'to taste'],
        weight: ['oz', 'lb'],
        count: ['each', 'clove', 'pouch', 'pack', 'bunch', 'box', 'container', 'bottle', 'steak', 'piece', 'slice', 'peppers', 'handful', 'sqz'],
      },
      ingredients: rows,
    })
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}
