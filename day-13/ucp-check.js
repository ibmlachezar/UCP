#!/usr/bin/env node
// ucp-check.js
//
// ─── THE HEALTH INSPECTOR ANALOGY ────────────────────────
// A restaurant health inspector visits any restaurant
// with a clipboard and runs through a checklist.
// They don't care who owns it — just whether it meets
// the standards.
//
// This tool IS that inspector.
// Run it against any domain and it tells you:
//   ✅ What passes
//   ❌ What fails (and why)
//   ⚠️  What's a warning
//   ℹ️  What's informational
//
// Usage:
//   node ucp-check.js localhost:3000
//   node ucp-check.js nike.com
//   node ucp-check.js api.example.com --verbose
//   node ucp-check.js localhost:3000 --json
//
// ─────────────────────────────────────────────────────────

const https = require('https')
const http  = require('http')

// ─────────────────────────────────────────────
// Parse command line arguments
// ─────────────────────────────────────────────
const args    = process.argv.slice(2)
const domain  = args.find(a => !a.startsWith('--'))
const verbose = args.includes('--verbose') || args.includes('-v')
const jsonOut = args.includes('--json')

if (!domain) {
  console.log(`
  UCP Health Check — diagnose any merchant's UCP implementation

  Usage:
    node ucp-check.js <domain> [options]

  Examples:
    node ucp-check.js localhost:3000
    node ucp-check.js nike.com
    node ucp-check.js example.com --verbose
    node ucp-check.js example.com --json

  Options:
    --verbose, -v   Show detailed output for each check
    --json          Output results as JSON (for programmatic use)
  `)
  process.exit(0)
}

// ─────────────────────────────────────────────
// HTTP fetch helper
// Works with both http:// and https://
// ─────────────────────────────────────────────
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url)
    const client  = parsed.protocol === 'https:' ? https : http
    const timeout = options.timeout || 5000

    const req = client.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  { 'Accept': 'application/json', 'User-Agent': 'UCP-Health-Check/1.0', ...options.headers },
      rejectUnauthorized: false  // Allow self-signed certs for local testing
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    data,
        json:    () => { try { return JSON.parse(data) } catch { return null } }
      }))
    })

    req.setTimeout(timeout, () => { req.destroy(); reject(new Error(`Timeout after ${timeout}ms`)) })
    req.on('error', reject)
    req.end()
  })
}

// ─────────────────────────────────────────────
// Result builder
// ─────────────────────────────────────────────
const results = {
  domain,
  checked_at: new Date().toISOString(),
  checks: [],
  summary: { pass: 0, fail: 0, warn: 0, info: 0 }
}

function check(status, category, name, message, detail = '') {
  const entry = { status, category, name, message, detail }
  results.checks.push(entry)
  results.summary[status]++
  return entry
}

// ─────────────────────────────────────────────
// COLOURS for terminal output
// ─────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  white:  '\x1b[37m'
}

function icon(status) {
  return { pass:'✅', fail:'❌', warn:'⚠️ ', info:'ℹ️ ' }[status] || '?'
}

function printCheck(entry) {
  const col = { pass:c.green, fail:c.red, warn:c.yellow, info:c.blue }[entry.status] || c.white
  console.log(`  ${icon(entry.status)}  ${col}${entry.name}${c.reset}`)
  console.log(`     ${c.gray}${entry.message}${c.reset}`)
  if (verbose && entry.detail) {
    console.log(`     ${c.cyan}→ ${entry.detail}${c.reset}`)
  }
}

// ─────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────
function section(title) {
  if (!jsonOut) {
    console.log(`\n  ${c.bold}${c.white}${title}${c.reset}`)
    console.log(`  ${'─'.repeat(50)}`)
  }
}

// ─────────────────────────────────────────────
// ALL THE CHECKS
// ─────────────────────────────────────────────

async function run() {
  // Determine base URL — localhost uses http, everything else https
  const isLocal = domain.startsWith('localhost') || domain.startsWith('127.')
  const base    = isLocal ? `http://${domain}` : `https://${domain}`

  if (!jsonOut) {
    console.log(`\n  ${c.bold}${c.cyan}UCP Health Check${c.reset}`)
    console.log(`  ${c.gray}Inspecting: ${base}${c.reset}`)
    console.log(`  ${c.gray}${new Date().toISOString()}${c.reset}`)
  }

  // ══════════════════════════════════════════
  // SECTION 1: Profile Discovery
  // ══════════════════════════════════════════
  section('1. Profile Discovery')

  let profile = null
  const profileUrl = `${base}/.well-known/ucp`

  try {
    const res = await fetch(profileUrl)

    // 1.1 HTTP status
    if (res.status === 200) {
      check('pass', 'discovery', 'Profile accessible',
        `GET /.well-known/ucp returned ${res.status}`,
        profileUrl)
    } else if (res.status === 404) {
      check('fail', 'discovery', 'Profile not found',
        `GET /.well-known/ucp returned 404 — merchant has no UCP profile`,
        'Create a profile at this exact path. The path is fixed by the spec.')
    } else {
      check('fail', 'discovery', 'Profile returned unexpected status',
        `Expected 200, got ${res.status}`,
        profileUrl)
    }

    // 1.2 Content-Type
    const ct = res.headers['content-type'] || ''
    if (ct.includes('application/json')) {
      check('pass', 'discovery', 'Content-Type is application/json',
        `Content-Type: ${ct.split(';')[0]}`)
    } else {
      check('fail', 'discovery', 'Wrong Content-Type',
        `Got: ${ct || '(none)'}. Must be application/json`,
        'Agents parse this as JSON. Wrong Content-Type causes parse failures.')
    }

    // 1.3 Cache-Control
    const cc = res.headers['cache-control'] || ''
    if (cc.includes('public')) {
      const match = cc.match(/max-age=(\d+)/)
      const maxAge = match ? parseInt(match[1]) : 0
      if (maxAge >= 60) {
        check('pass', 'discovery', 'Cache-Control is correct',
          `${cc}`)
      } else if (maxAge > 0) {
        check('warn', 'discovery', 'Cache-Control max-age is too short',
          `max-age=${maxAge} — spec requires ≥ 60 seconds`,
          'Short max-age causes agents to re-fetch on every request. At scale: millions of wasted fetches.')
      } else {
        check('warn', 'discovery', 'Cache-Control has no max-age',
          `Found: ${cc}. Should include max-age=60 or higher.`)
      }
    } else if (cc) {
      check('warn', 'discovery', 'Cache-Control missing "public"',
        `Found: ${cc}. Must include "public" so CDNs can cache it.`)
    } else {
      check('fail', 'discovery', 'No Cache-Control header',
        'Cache-Control: public, max-age=60 is required.',
        'Without this, agents must re-fetch the profile on every API call.')
    }

    // 1.4 Valid JSON
    profile = res.json()
    if (profile) {
      check('pass', 'discovery', 'Profile is valid JSON',
        'Profile parses without errors')
    } else {
      check('fail', 'discovery', 'Profile is not valid JSON',
        'The profile body failed to parse as JSON',
        'Check for trailing commas, unquoted keys, or encoding issues.')
      if (!jsonOut) {
        results.checks.forEach(printCheck)
        printSummary()
      }
      return
    }

  } catch (err) {
    check('fail', 'discovery', 'Profile unreachable',
      `Could not connect: ${err.message}`,
      `Tried: ${profileUrl}`)
    if (!jsonOut) {
      results.checks.forEach(printCheck)
      printSummary()
    }
    return
  }

  // Print section 1
  if (!jsonOut) results.checks.filter(c => c.category === 'discovery').forEach(printCheck)

  // ══════════════════════════════════════════
  // SECTION 2: Profile Structure
  // ══════════════════════════════════════════
  section('2. Profile Structure')

  // 2.1 UCP version
  const ucp = profile.ucp || profile
  const version = ucp.version
  if (version && /^\d{4}-\d{2}-\d{2}$/.test(version)) {
    check('pass', 'structure', 'Version format is correct',
      `version: ${version}`)
  } else if (version) {
    check('warn', 'structure', 'Version format unexpected',
      `Got: ${version}. Expected: YYYY-MM-DD format like 2026-04-08`)
  } else {
    check('fail', 'structure', 'No version declared',
      'ucp.version is required in the profile')
  }

  // 2.2 Services declared
  const services = ucp.services
  if (services && Object.keys(services).length > 0) {
    const svcNames = Object.keys(services).join(', ')
    check('pass', 'structure', 'Services declared',
      `Found: ${svcNames}`)

    // Check service has an endpoint
    const ucpShopping = services['dev.ucp.shopping']
    if (ucpShopping?.[0]?.endpoint) {
      check('pass', 'structure', 'Shopping service has endpoint',
        `endpoint: ${ucpShopping[0].endpoint}`)
    } else if (ucpShopping) {
      check('warn', 'structure', 'Shopping service missing endpoint',
        'dev.ucp.shopping should declare an endpoint URL')
    }
  } else {
    check('fail', 'structure', 'No services declared',
      'ucp.services is required — agents need to know where your API lives')
  }

  // 2.3 Capabilities
  const caps = ucp.capabilities
  if (!caps || Object.keys(caps).length === 0) {
    check('fail', 'structure', 'No capabilities declared',
      'ucp.capabilities is required — what can agents do with this merchant?')
  } else {
    check('pass', 'structure', `${Object.keys(caps).length} capabilities declared`,
      Object.keys(caps).join(', '))
  }

  if (!jsonOut) results.checks.filter(c => c.category === 'structure').forEach(printCheck)

  // ══════════════════════════════════════════
  // SECTION 3: Capabilities
  // ══════════════════════════════════════════
  section('3. Capabilities')

  const REQUIRED_CAPS = ['dev.ucp.shopping.checkout']
  const KNOWN_CAPS    = [
    'dev.ucp.shopping.checkout',
    'dev.ucp.shopping.fulfillment',
    'dev.ucp.shopping.discount',
    'dev.ucp.shopping.catalog',
    'dev.ucp.shopping.identity_linking',
    'dev.ucp.shopping.cart'
  ]

  for (const cap of REQUIRED_CAPS) {
    if (caps?.[cap]) {
      const capData = caps[cap][0]
      check('pass', 'capabilities', `${cap} declared`,
        `version: ${capData.version || '(not specified)'}`)
    } else {
      check('fail', 'capabilities', `${cap} is MISSING`,
        'This is the minimum required capability — without it agents cannot purchase',
        'Add "dev.ucp.shopping.checkout" to capabilities in your profile.')
    }
  }

  // Check optional caps that are declared
  for (const cap of Object.keys(caps || {})) {
    if (REQUIRED_CAPS.includes(cap)) continue
    const capData = caps[cap][0]
    const extendsInfo = capData.extends
      ? ` (extends: ${Array.isArray(capData.extends) ? capData.extends.join(', ') : capData.extends})`
      : ''
    check('info', 'capabilities', `Optional: ${cap}`,
      `Declared${extendsInfo}. version: ${capData.version || '(not specified)'}`)
  }

  if (!jsonOut) results.checks.filter(c => c.category === 'capabilities').forEach(printCheck)

  // ══════════════════════════════════════════
  // SECTION 4: Payment Handlers
  // ══════════════════════════════════════════
  section('4. Payment Handlers')

  const handlers = ucp.payment_handlers
  if (!handlers || Object.keys(handlers).length === 0) {
    check('warn', 'payment', 'No payment handlers declared',
      'Agents cannot process payments without at least one payment handler')
  } else {
    for (const [name, handlerList] of Object.entries(handlers)) {
      const h = handlerList[0]
      if (!h.id) {
        check('fail', 'payment', `Handler ${name} missing id`,
          'Each payment handler must have a unique id field',
          'The id is what agents send in the complete request')
      } else {
        check('pass', 'payment', `Handler: ${name}`,
          `id: ${h.id}, version: ${h.version || '(not specified)'}`)
      }
    }
  }

  if (!jsonOut) results.checks.filter(c => c.category === 'payment').forEach(printCheck)

  // ══════════════════════════════════════════
  // SECTION 5: Security (signing_keys)
  // ══════════════════════════════════════════
  section('5. Security — signing_keys')

  const signingKeys = profile.signing_keys || ucp.signing_keys
  if (!signingKeys || signingKeys.length === 0) {
    check('warn', 'security', 'No signing_keys declared',
      'signing_keys are needed for agents to verify webhook authenticity (Day 11+12)',
      'Without signing_keys, agents cannot verify your webhooks are genuine.')
  } else {
    for (const key of signingKeys) {
      // Check required JWK fields
      if (!key.kid) check('fail', 'security', 'Key missing kid (key ID)', 'Each key needs a unique kid so agents can look up the right key')
      else check('pass', 'security', `Key declared: kid=${key.kid}`, `alg: ${key.alg || '(not specified)'}, kty: ${key.kty}`)

      if (!key.alg) check('warn', 'security', `Key ${key.kid}: missing alg`, 'Should declare algorithm e.g. ES256')
      if (!key.use) check('warn', 'security', `Key ${key.kid}: missing use field`, 'Should be use: "sig" for signing keys')

      // CRITICAL: check private key d parameter is not exposed
      if (key.d) {
        check('fail', 'security', `🚨 CRITICAL: Key ${key.kid} exposes PRIVATE KEY`,
          'The "d" parameter is the private key — it must NEVER appear in the public profile',
          'Remove the "d" field immediately. Anyone who reads this profile can now forge your webhooks.')
      } else {
        check('pass', 'security', `Key ${key.kid}: private key is NOT exposed`,
          'Public key only (no "d" parameter) ✓')
      }
    }
  }

  if (!jsonOut) results.checks.filter(c => c.category === 'security').forEach(printCheck)

  // ══════════════════════════════════════════
  // SECTION 6: Capability Negotiation Simulation
  // ══════════════════════════════════════════
  section('6. Negotiation Simulation')

  // Try to actually call the checkout endpoint
  const shoppingSvc = (ucp.services?.['dev.ucp.shopping'] || [])[0]
  if (shoppingSvc?.endpoint) {
    try {
      const checkoutUrl = `${shoppingSvc.endpoint}/checkout-sessions`
      const res = await fetch(checkoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
        timeout: 3000
      })

      if (res.status === 400 || res.status === 422) {
        // 400 = endpoint exists, just needs valid body
        check('pass', 'negotiation', 'Checkout endpoint is reachable',
          `POST /checkout-sessions → ${res.status} (endpoint exists, expected validation error for empty body)`)
      } else if (res.status === 200 || res.status === 201) {
        check('pass', 'negotiation', 'Checkout endpoint responded',
          `POST /checkout-sessions → ${res.status}`)
      } else if (res.status === 404) {
        check('fail', 'negotiation', 'Checkout endpoint not found',
          `POST ${checkoutUrl} → 404`)
      } else {
        check('info', 'negotiation', 'Checkout endpoint status',
          `POST /checkout-sessions → ${res.status}`)
      }
    } catch (err) {
      check('warn', 'negotiation', 'Checkout endpoint unreachable',
        `Could not reach ${shoppingSvc.endpoint}/checkout-sessions: ${err.message}`,
        'This could be expected if the API requires auth or is on a private network.')
    }
  } else {
    check('info', 'negotiation', 'Skipped — no service endpoint declared',
      'Add a services endpoint to enable live endpoint testing')
  }

  if (!jsonOut) results.checks.filter(c => c.category === 'negotiation').forEach(printCheck)

  // Print final summary
  printSummary()
}

function printSummary() {
  if (jsonOut) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  const { pass, fail, warn, info } = results.summary
  const total = pass + fail + warn + info
  const score = Math.round((pass / (pass + fail) || 0) * 100)

  console.log(`\n  ${'═'.repeat(52)}`)
  console.log(`  ${c.bold}RESULT: ${domain}${c.reset}`)
  console.log(`  ${c.gray}${results.checked_at}${c.reset}`)
  console.log('')
  console.log(`  ${c.green}✅ ${pass} passed${c.reset}    ${c.red}❌ ${fail} failed${c.reset}    ${c.yellow}⚠️  ${warn} warnings${c.reset}    ${c.blue}ℹ️  ${info} info${c.reset}`)
  console.log('')

  if (fail === 0 && warn === 0) {
    console.log(`  ${c.green}${c.bold}🎉 FULLY COMPLIANT — ready for AI agents${c.reset}`)
  } else if (fail === 0) {
    console.log(`  ${c.yellow}${c.bold}⚠️  MOSTLY COMPLIANT — fix warnings for best results${c.reset}`)
  } else {
    console.log(`  ${c.red}${c.bold}❌ NOT COMPLIANT — ${fail} critical issue${fail > 1 ? 's' : ''} must be fixed${c.reset}`)
  }

  const failedChecks = results.checks.filter(c => c.status === 'fail')
  if (failedChecks.length > 0) {
    console.log(`\n  ${c.bold}What to fix first:${c.reset}`)
    failedChecks.forEach((f, i) => {
      console.log(`  ${i + 1}. ${c.red}${f.name}${c.reset} — ${f.message}`)
    })
  }

  console.log(`\n  ${c.gray}Run with --verbose for more detail, --json for machine-readable output${c.reset}`)
  console.log('')
}

// ─────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────
run().catch(err => {
  console.error(`\n  Fatal error: ${err.message}`)
  process.exit(1)
})
