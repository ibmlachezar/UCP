const express = require('express')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 3000

// ─────────────────────────────────────────────
// Load the merchant profile from disk.
// This is the document every UCP agent fetches
// before it can do anything with your merchant.
// ─────────────────────────────────────────────
const profile = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'profiles/merchant.json'), 'utf-8')
)

// ─────────────────────────────────────────────
// THE most important endpoint in UCP.
//
// Fixed path: /.well-known/ucp
// NOT /ucp, NOT /profile, NOT /api/ucp.
// The path is part of the spec — agents discover
// it without being told where to look.
//
// Cache-Control: public, max-age=60
// Required by spec. Without it, every single API
// call triggers a fresh profile fetch. At scale
// this is catastrophic.
// ─────────────────────────────────────────────
app.get('/.well-known/ucp', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60')
  res.set('Content-Type', 'application/json')
  res.json(profile)
})

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    day: 1,
    feature: 'UCP discovery endpoint',
    try: 'curl http://localhost:3000/.well-known/ucp'
  })
})

app.listen(PORT, () => {
  console.log('')
  console.log('  Day 1 — UCP Discovery Endpoint')
  console.log('  http://localhost:' + PORT + '/.well-known/ucp')
  console.log('')
})
