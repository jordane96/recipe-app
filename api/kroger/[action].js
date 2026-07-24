/**
 * Single Vercel Serverless Function that dispatches every Kroger route, so the integration costs
 * ONE function instead of seven (the Hobby plan caps a deployment at 12 functions, and the app
 * was at 16). Each `/api/kroger/<action>` request maps to this file with `req.query.action`
 * set to `<action>` — client URLs are unchanged. The individual handlers live in `_`-prefixed
 * sibling files, which Vercel does not treat as routes (so they don't count toward the limit);
 * they're bundled into this function because it imports them.
 */
import authorize from './_authorize.js'
import callback from './_callback.js'
import cartAdd from './_cart-add.js'
import locations from './_locations.js'
import match from './_match.js'
import status from './_status.js'
import store from './_store.js'

const handlers = {
  authorize,
  callback,
  'cart-add': cartAdd,
  locations,
  match,
  status,
  store,
}

export default function handler(req, res) {
  const fn = handlers[req.query.action]
  if (!fn) return res.status(404).json({ error: 'unknown_kroger_action', action: req.query.action })
  return fn(req, res)
}
