// routes/identity.js
//
// ─── THE LOYALTY CARD ANALOGY ─────────────────────────────
// Two endpoints — like a bar's loyalty desk:
//
// POST /ucp/v1/identity/link-request
//   = "Do you have a loyalty card with us?"
//   = Agent sends user's Google ID
//   = Merchant checks their database
//   = Known: "Yes! Here's your saved data."
//   = Unknown: "No. Here's the registration form."
//
// GET /ucp/v1/identity/status?platform=google&id=xxx
//   = "Is this Google account linked to a loyalty card?"
//   = Quick check, no data returned
// ─────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const { linkRequest, completeLink, getStatus } = require('../lib/identity')

// ─────────────────────────────────────────────
// POST /ucp/v1/identity/link-request
//
// The agent sends the user's platform identity.
// Merchant checks if this user has an account.
//
// Request body:
// {
//   "platform_identity": {
//     "platform":    "google",
//     "platform_id": "google_user_elisa_123",
//     "email":       "elisa@example.com",
//     "name":        "Elisa Martinez"
//   }
// }
//
// Response (known user):
// {
//   "status": "linked",
//   "account": { name, email, loyalty_points, saved_addresses }
//   "loyalty_discount": { code, description, value }
// }
//
// Response (unknown user):
// {
//   "status": "not_linked",
//   "auth_url": "http://localhost:3000/auth/link?session=xxx",
//   "optional": true
// }
// ─────────────────────────────────────────────
router.post('/link-request', (req, res) => {
  const { platform_identity } = req.body

  if (!platform_identity || !platform_identity.platform) {
    return res.status(400).json({
      code:    'invalid_request',
      message: 'platform_identity with platform field is required',
      path:    '$.platform_identity.platform'
    })
  }

  const result = linkRequest(platform_identity)

  res.json({
    ucp: {
      version:      '2026-04-08',
      capabilities: req.app.locals.profile?.ucp?.capabilities || {}
    },
    ...result
  })
})

// ─────────────────────────────────────────────
// GET /ucp/v1/identity/status
//
// Quick check: is this identity linked?
// Parameters go in the URL:
//   ?platform=google&id=google_user_elisa_123
// ─────────────────────────────────────────────
router.get('/status', (req, res) => {
  const { platform, id } = req.query

  if (!platform || !id) {
    return res.status(400).json({
      code:    'missing_params',
      message: 'platform and id query parameters are required'
    })
  }

  const status = getStatus(platform, id)

  res.json({
    ucp: {
      version:      '2026-04-08',
      capabilities: req.app.locals.profile?.ucp?.capabilities || {}
    },
    platform,
    platform_id: id,
    ...status
  })
})

// ─────────────────────────────────────────────
// POST /ucp/v1/identity/complete-link
//
// Called after user completes the OAuth flow.
// Merchant stores the link between Google account
// and merchant account.
//
// In production: this is your OAuth callback.
// For learning: simulated with session token + email.
// ─────────────────────────────────────────────
router.post('/complete-link', (req, res) => {
  const { session_token, merchant_email } = req.body

  if (!session_token || !merchant_email) {
    return res.status(400).json({
      code:    'invalid_request',
      message: 'session_token and merchant_email are required'
    })
  }

  const result = completeLink(session_token, merchant_email)

  if (!result.success) {
    return res.status(400).json({ code:'link_failed', message:result.error })
  }

  res.json({
    ucp: { version:'2026-04-08', capabilities: {} },
    ...result,
    message: result.new_account
      ? `New account created with ${result.welcome_points} welcome loyalty points`
      : 'Existing account linked successfully'
  })
})

// ─────────────────────────────────────────────
// GET /auth/link
//
// The simulated OAuth landing page.
// In real life: your website's OAuth authorization page.
// For learning: a simple page explaining what to do next.
// ─────────────────────────────────────────────
router.get('/auth-page', (req, res) => {
  const { session } = req.query
  res.json({
    message:       'OAuth linking page (simulated)',
    session_token: session,
    instruction:   'POST to /ucp/v1/identity/complete-link with session_token and merchant_email to complete linking',
    example: {
      session_token:  session,
      merchant_email: 'elisa@example.com'
    }
  })
})

module.exports = router
