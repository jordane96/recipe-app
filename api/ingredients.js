import { neon } from '@neondatabase/serverless'
import { isStaple } from './_staples.js'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM ingredients ORDER BY name`
    // `staple` is decided in code (api/_staples.js), not stored — so the list deploys with the
    // app instead of needing a migration run against every environment. Overrides any stale
    // `staple` column left over from the original migration.
    const ingredients = rows.map(row => ({ ...row, staple: isStaple(row) }))
    res.json({
      version: 2,
      units: {
        volume: ['tsp', 'tbsp', 'cup', 'to taste'],
        weight: ['oz', 'lb'],
        // "pinch" and "strip" are count units so they can carry a quantity ("2 pinches",
        // "4 strips of bacon"); "to taste" stays the amount-less sentinel.
        count: ['each', 'clove', 'pouch', 'pack', 'bunch', 'box', 'container', 'bottle', 'steak', 'piece', 'slice', 'peppers', 'handful', 'sqz', 'pinch', 'strip', 'sprig', 'head'],
      },
      ingredients,
    })
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}
