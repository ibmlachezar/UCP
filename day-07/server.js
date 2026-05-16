const express = require('express')
const fs = require('fs')
const path = require('path')
const { negotiate } = require('./lib/negotiation')
const checkoutRouter = require('./routes/checkout')
const completeRouter = require('./routes/checkout-complete')

const app = express()
const PORT = 3000

app.use(express.json())

// ─────────────────────────────────────────────
// Load merchant profile + share across all routes
// via app.locals — no need to import it in every file
// ─────────────────────────────────────────────
const profile = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'profiles/merchant.json'), 'utf-8')
)
app.locals.profile = profile

// ─────────────────────────────────────────────
// Day 1: Discovery endpoint
// ─────────────────────────────────────────────
app.get('/.well-known/ucp', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60')
  res.set('Content-Type', 'application/json')
  res.json(profile)
})

// ─────────────────────────────────────────────
// Day 2: Negotiation debug endpoints
// ─────────────────────────────────────────────
const testPlatformProfile = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'profiles/platform-test.json'), 'utf-8')
)
app.get('/test-platform-profile', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60')
  res.json(testPlatformProfile)
})
app.get('/negotiate', async (req, res) => {
  try {
    const result = await negotiate(req, profile)
    res.json({
      ucp_agent_header:      req.headers['ucp-agent'] || 'not provided',
      merchant_capabilities: profile.ucp.capabilities,
      platform_capabilities: result.platformProfile?.ucp?.capabilities || null,
      active_capabilities:   result.activeCaps,
      active_count:          Object.keys(result.activeCaps).length,
      error: result.error || null,
      note:  result.note  || null
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────
// Day 3: Checkout sessions
//
// app.use() mounts the router at this base path.
// POST /ucp/v1/checkout-sessions     → router.post('/')
// GET  /ucp/v1/checkout-sessions/:id → router.get('/:id')
// ─────────────────────────────────────────────
app.use('/ucp/v1/checkout-sessions', checkoutRouter)

// Day 6: Complete a checkout — POST /:id/complete
app.use('/ucp/v1/checkout-sessions', completeRouter)

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:   'running',
    day:      3,
    merchant: 'UCP Demo Merchant',
    endpoints: {
      discovery:       'GET  /.well-known/ucp',
      negotiation:     'GET  /negotiate',
      create_checkout: 'POST /ucp/v1/checkout-sessions',
      get_checkout:    'GET  /ucp/v1/checkout-sessions/:id'
    }
  })
})

app.listen(PORT, () => {
  console.log('')
  console.log('  UCP Merchant — Day 3: Checkout Sessions')
  console.log('')
  console.log('  POST /ucp/v1/checkout-sessions to create a checkout')
  console.log('')
})
