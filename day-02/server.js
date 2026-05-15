const express = require('express')
const fs = require('fs')
const path = require('path')
const { negotiate } = require('./lib/negotiation')

const app = express()
const PORT = 3000

app.use(express.json())

// Load merchant profile
const profile = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'profiles/merchant.json'), 'utf-8')
)

// Load test platform profile (served locally for testing)
const testPlatformProfile = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'profiles/platform-test.json'), 'utf-8')
)

// ─────────────────────────────────────────────
// Day 1: Discovery endpoint — unchanged
// ─────────────────────────────────────────────
app.get('/.well-known/ucp', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60')
  res.set('Content-Type', 'application/json')
  res.json(profile)
})

// ─────────────────────────────────────────────
// Day 2: Negotiation demo endpoint
//
// Shows the intersection algorithm live.
// Pass a UCP-Agent header to trigger negotiation.
//
// Without header: returns all merchant capabilities
// With header:    fetches platform profile, runs
//                 intersection, returns active set
// ─────────────────────────────────────────────
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

// Serve test platform profile locally for testing
app.get('/test-platform-profile', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60')
  res.json(testPlatformProfile)
})

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    day: 2,
    feature: 'Capability negotiation engine',
    endpoints: {
      discovery:    'GET /.well-known/ucp',
      negotiation:  'GET /negotiate',
      test_profile: 'GET /test-platform-profile'
    }
  })
})

app.listen(PORT, () => {
  console.log('')
  console.log('  Day 2 — Capability Negotiation Engine')
  console.log('')
  console.log('  Test without agent (all caps returned):')
  console.log('  curl http://localhost:' + PORT + '/negotiate')
  console.log('')
  console.log('  Test with agent (intersection runs):')
  console.log('  Invoke-WebRequest -Uri "http://localhost:' + PORT + '/negotiate" -Headers @{"UCP-Agent" = \'profile="http://localhost:' + PORT + '/test-platform-profile"\'}  | Select-Object -ExpandProperty Content')
  console.log('')
})
