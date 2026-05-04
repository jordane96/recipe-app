import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password } = req.body ?? {}
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

  const [existing] = await sql`SELECT "Username" FROM "Owners" WHERE "Username" = ${username}`
  if (existing) return res.status(409).json({ error: 'Username already taken' })

  await sql`INSERT INTO "Owners" ("Username", "Password") VALUES (${username}, ${password})`

  res.json({ username })
}
