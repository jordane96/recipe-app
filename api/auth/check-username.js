import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username } = req.body ?? {}
  if (!username) return res.status(400).json({ error: 'Username required' })

  const [existing] = await sql`SELECT 1 FROM "Owners" WHERE "Username" = ${username}`

  res.json({ taken: Boolean(existing) })
}
