import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password } = req.body ?? {}
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

  const [user] = await sql`
    SELECT "Username" FROM "Owners"
    WHERE "Username" = ${username} AND "Password" = ${password}
  `

  if (!user) return res.status(401).json({ error: 'Invalid username or password' })

  res.json({ username: user.Username })
}
