// tests/checkout.test.js
//
// Tests for POST /checkout-sessions
// Run with: node tests/checkout.test.js
//
// These tests spin up the real server and make
// real HTTP requests — so you test exactly what
// the agent experiences, not a mock.

const http = require('http')

let passed = 0
let failed = 0
const BASE = 'http://localhost:3000'

// ─────────────────────────────────────────────
// Helper: make an HTTP request and get the response
// ─────────────────────────────────────────────
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, body: data })
        }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function test(name, fn) {
  return fn().then(() => {
    console.log('  PASS  ' + name)
    passed++
  }).catch(err => {
    console.log('  FAIL  ' + name)
    console.log('        ' + err.message)
    failed++
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

// A valid line item to reuse across tests
const validLineItem = {
  id: 'li_1',
  item: { id: 'p1', title: 'Carry-On Suitcase', price: 26550 },
  quantity: 1
}

async function runTests() {
  console.log('\n  POST /ucp/v1/checkout-sessions\n')

  await test('returns 201 Created for a valid request', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [validLineItem]
    })
    assert(res.status === 201, `Expected 201 got ${res.status}`)
  })

  await test('response has a checkout id starting with chk_', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [validLineItem]
    })
    assert(res.body.id?.startsWith('chk_'), `Expected id starting with chk_, got: ${res.body.id}`)
  })

  await test('status starts as incomplete', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [validLineItem]
    })
    assert(res.body.status === 'incomplete', `Expected incomplete got ${res.body.status}`)
  })

  await test('subtotal is correctly calculated in cents', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [validLineItem]  // price: 26550 × quantity: 1
    })
    const subtotal = res.body.totals?.find(t => t.type === 'subtotal')
    assert(subtotal?.amount === 26550, `Expected subtotal 26550 got ${subtotal?.amount}`)
  })

  await test('subtotal multiplies price by quantity', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [{
        id: 'li_1',
        item: { id: 'p1', title: 'Water Bottle', price: 2999 },
        quantity: 3   // 2999 × 3 = 8997
      }]
    })
    const subtotal = res.body.totals?.find(t => t.type === 'subtotal')
    assert(subtotal?.amount === 8997, `Expected 8997 got ${subtotal?.amount}`)
  })

  await test('subtotal adds up multiple line items', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [
        { id: 'li_1', item: { id: 'p1', title: 'Suitcase', price: 26550 }, quantity: 1 },
        { id: 'li_2', item: { id: 'p2', title: 'Bag',      price:  9900 }, quantity: 2 }
        // 26550 + (9900 × 2) = 26550 + 19800 = 46350
      ]
    })
    const subtotal = res.body.totals?.find(t => t.type === 'subtotal')
    assert(subtotal?.amount === 46350, `Expected 46350 got ${subtotal?.amount}`)
  })

  await test('response includes ucp.capabilities field', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [validLineItem]
    })
    assert(res.body.ucp?.capabilities !== undefined, 'Missing ucp.capabilities in response')
  })

  await test('response includes payment handlers', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [validLineItem]
    })
    assert(Array.isArray(res.body.payment?.handlers), 'payment.handlers should be an array')
    assert(res.body.payment.handlers.length > 0, 'Should have at least one payment handler')
  })

  await test('each checkout gets a unique id', async () => {
    const res1 = await request('POST', '/ucp/v1/checkout-sessions', { line_items: [validLineItem] })
    const res2 = await request('POST', '/ucp/v1/checkout-sessions', { line_items: [validLineItem] })
    assert(res1.body.id !== res2.body.id, 'Each checkout must have a unique ID')
  })

  await test('returns 400 when line_items is missing', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {})
    assert(res.status === 400, `Expected 400 got ${res.status}`)
  })

  await test('returns 400 when line_items is empty array', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', { line_items: [] })
    assert(res.status === 400, `Expected 400 got ${res.status}`)
  })

  await test('returns 400 when price is not an integer', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [{
        id: 'li_1',
        item: { id: 'p1', title: 'Suitcase', price: 265.50 }, // ← decimal, not cents
        quantity: 1
      }]
    })
    assert(res.status === 400, `Expected 400 got ${res.status}`)
  })

  console.log('\n  GET /ucp/v1/checkout-sessions/:id\n')

  await test('can retrieve a checkout by id', async () => {
    const create = await request('POST', '/ucp/v1/checkout-sessions', { line_items: [validLineItem] })
    const id = create.body.id
    const get = await request('GET', `/ucp/v1/checkout-sessions/${id}`)
    assert(get.status === 200, `Expected 200 got ${get.status}`)
    assert(get.body.id === id, 'Retrieved checkout should have same id')
  })

  await test('returns 404 for unknown checkout id', async () => {
    const res = await request('GET', '/ucp/v1/checkout-sessions/chk_doesnotexist')
    assert(res.status === 404, `Expected 404 got ${res.status}`)
  })

  // ── Results ──────────────────────────────────
  console.log('')
  console.log('  ─────────────────────────────────')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('  ─────────────────────────────────')
  if (failed > 0) {
    console.log('  Fix failing tests before Day 4.')
    process.exit(1)
  } else {
    console.log('  All tests pass. Day 3 complete.')
    console.log('  Ready for Day 4: PATCH /checkout-sessions/:id')
  }
  console.log('')
}

// Give the server a moment to start, then run tests
setTimeout(runTests, 500)
