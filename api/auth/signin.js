import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

/**
 * PROTOTYPE ONLY — password recovery escape hatch.
 *
 * There is no email on "Owners" and no mail service wired up, so a real reset link isn't
 * possible. Instead, a sign-in attempt with a valid username but the wrong password comes back
 * with `usernameExists: true`, and the client offers a "Sign in anyway" button which posts
 * `{ recoverWithoutPassword: true }`.
 *
 * This means anyone who knows a username can enter that account. Delete this branch (and the
 * matching button in AuthScreen.tsx) before the app has real users or real data.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password, recoverWithoutPassword } = req.body ?? {}
  if (!username) return res.status(400).json({ error: 'Username required' })
  if (!password && !recoverWithoutPassword) {
    return res.status(400).json({ error: 'Username and password required' })
  }

  if (recoverWithoutPassword) {
    const [account] = await sql`
      SELECT "Username" FROM "Owners" WHERE "Username" = ${username}
    `
    if (!account) return res.status(404).json({ error: 'No account with that username' })
    return res.json({ username: account.Username, recovered: true })
  }

  const [user] = await sql`
    SELECT "Username" FROM "Owners"
    WHERE "Username" = ${username} AND "Password" = ${password}
  `

  if (!user) {
    // Tell the client whether the username itself is real, so it knows to offer the escape
    // hatch rather than leaving the user stuck on a dead end.
    const [account] = await sql`SELECT 1 FROM "Owners" WHERE "Username" = ${username}`
    return res.status(401).json({
      error: 'Invalid username or password',
      usernameExists: Boolean(account),
    })
  }

  res.json({ username: user.Username })
}
