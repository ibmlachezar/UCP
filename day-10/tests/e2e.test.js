// tests/e2e.test.js
//
// ─── THE HEALTH INSPECTOR ANALOGY ─────────────────────────
// A restaurant health inspector doesn't just check the
// kitchen in isolation. They run through the ENTIRE
// customer experience:
//   1. Read the menu (discover profile)
//   2. Sit down and agree on what's available (negotiate)
//   3. Order food (create checkout)
//   4. Fill in delivery details (PATCH)
//   5. Pay the bill (complete)
//   6. Get the receipt (verify order)
//
// If ANY step fails, the whole experience breaks.
// These tests prove every step works together.
//
// This is different from unit tests (Days 2, 4, 5, 6)
// which test individual functions in isolation.
// E2E tests test the WHOLE SYSTEM as one piece.
// ───────────────────────────────────────────────────────────

const http = require('http')
let passed = 0, failed = 0

// ─────────────────────────────────────────────
// HTTP helper — makes real network requests
// to your running server
// ─────────────────────────────────────────────
function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers })
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers })
        }
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function test(name, fn) {
  return fn()
    .then(() => { console.log('  PASS  ' + name); passed++ })
    .catch(err => { console.log('  FAIL  ' + name + '\n        ' + err.message); failed++ })
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

// ─────────────────────────────────────────────
// THE FULL JOURNEY — called by multiple tests
//
// This function runs the complete purchase flow:
//   discover → negotiate → create → update → pay
//
// Returns the final completed response so tests
// can assert on the end result.
// ─────────────────────────────────────────────
async function runFullJourney(options = {}) {
  const {
    token = 'tok_success',
    withFulfillment = true,
    shippingMethod = 'free'
  } = options

  // ── Step 1: Discover the merchant ──────────
  // Health inspector reads the menu sign.
  // Every agent starts here — no exceptions.
  const profileRes = await request('GET', '/.well-known/ucp')
  assert(profileRes.status === 200, 'Profile must return 200')
  assert(profileRes.body.ucp?.capabilities, 'Profile must have capabilities')
  assert(profileRes.headers['cache-control']?.includes('public'), 'Must have Cache-Control: public')

  const merchantCaps = profileRes.body.ucp.capabilities
  assert(merchantCaps['dev.ucp.shopping.checkout'], 'Merchant must declare checkout')

  // ── Step 2: Create a checkout ───────────────
  // Inspector places the order.
  const agentHeaders = withFulfillment
    ? { 'UCP-Agent': 'profile="http://localhost:3000/test-platform-profile"' }
    : {}

  const lineItems = [{
    id: 'li_e2e_1',
    item: { id: 'prod_suitcase', title: 'Carry-On Suitcase', price: 26550 },
    quantity: 1
  }]

  const createRes = await request(
    'POST',
    '/ucp/v1/checkout-sessions',
    { line_items: lineItems },
    agentHeaders
  )

  assert(createRes.status === 201, `Create must return 201, got ${createRes.status}`)
  assert(createRes.body.id?.startsWith('chk_'), 'Must return a checkout ID')
  assert(createRes.body.status === 'incomplete', 'New checkout must be incomplete')
  assert(createRes.body.ucp?.capabilities, 'Response must include active capabilities')

  const checkoutId = createRes.body.id
  const activeCaps = createRes.body.ucp.capabilities

  // If fulfillment was negotiated, verify it's active
  if (withFulfillment) {
    assert(
      activeCaps['dev.ucp.shopping.fulfillment'],
      'Fulfillment should be active when both sides declare it'
    )
  }

  // Subtotal must be correct
  const subtotal = createRes.body.totals?.find(t => t.type === 'subtotal')
  assert(subtotal?.amount === 26550, `Subtotal must be 26550, got ${subtotal?.amount}`)

  // ── Step 3: Update with buyer + shipping ───
  // Inspector fills in the delivery details.
  const patchBody = {
    buyer: {
      email: 'inspector@health.gov',
      first_name: 'Health',
      last_name:  'Inspector'
    },
    fulfillment: {
      destinations: [{
        street_address: '1 Market Street',
        city:           'San Francisco',
        postal_code:    '94105',
        country_code:   'US'
      }],
      selected_option_id: shippingMethod
    }
  }

  const patchRes = await request(
    'PATCH',
    `/ucp/v1/checkout-sessions/${checkoutId}`,
    patchBody,
    agentHeaders
  )

  assert(patchRes.status === 200, `PATCH must return 200, got ${patchRes.status}`)
  assert(
    patchRes.body.status === 'ready_for_complete',
    `Status must be ready_for_complete, got ${patchRes.body.status}`
  )

  // No blocking errors
  const blockingErrors = (patchRes.body.messages || []).filter(m => m.type === 'error')
  assert(blockingErrors.length === 0, `Should have no blocking errors, got: ${JSON.stringify(blockingErrors)}`)

  // Buyer info was stored
  assert(patchRes.body.buyer?.email === 'inspector@health.gov', 'Buyer email should be stored')

  // Totals must include tax
  const tax = patchRes.body.totals?.find(t => t.type === 'tax')
  assert(tax?.amount === 2655, `Tax must be 2655 (10%), got ${tax?.amount}`)

  // next_steps must point to complete
  assert(
    patchRes.body.next_steps?.complete?.includes(checkoutId),
    'next_steps.complete must reference the checkout ID'
  )

  // ── Step 4: Pay ─────────────────────────────
  // Inspector pays the bill.
  const completeRes = await request(
    'POST',
    `/ucp/v1/checkout-sessions/${checkoutId}/complete`,
    {
      payment: {
        instruments: [{
          handler_id: 'gpay_handler_1',
          type: 'card',
          credential: { type: 'PAYMENT_GATEWAY', token }
        }]
      },
      signals: { 'dev.ucp.buyer_ip': '1.2.3.4' }
    },
    agentHeaders
  )

  return { completeRes, checkoutId, activeCaps }
}

// ─────────────────────────────────────────────
// THE TESTS
// ─────────────────────────────────────────────

async function runTests() {
  console.log('\n  Day 7 — End-to-End Test Suite\n')
  console.log('  The health inspector runs the full experience.\n')

  // ── HAPPY PATH ─────────────────────────────
  console.log('  Happy path\n')

  await test('full journey: discover → negotiate → create → update → pay → completed', async () => {
    const { completeRes } = await runFullJourney()
    assert(completeRes.status === 200, `Expected 200 got ${completeRes.status}`)
    assert(completeRes.body.status === 'completed', `Expected completed got ${completeRes.body.status}`)
    assert(completeRes.body.order_id?.startsWith('order_'), 'Must have an order_id')
  })

  await test('order contains full receipt — buyer, totals, shipping', async () => {
    const { completeRes } = await runFullJourney()
    const order = completeRes.body.order
    assert(order.buyer.email === 'inspector@health.gov', 'Order must have buyer email')
    assert(order.totals?.find(t => t.type === 'total')?.amount === 29205, 'Total must be 29205')
    assert(order.shipping_method?.id === 'free', 'Order must record shipping method')
  })

  await test('express shipping: total includes 999 shipping cost', async () => {
    const { completeRes } = await runFullJourney({ shippingMethod: 'express' })
    const order = completeRes.body.order
    const total = order.totals?.find(t => t.type === 'total')
    assert(total?.amount === 30204, `Express total must be 30204, got ${total?.amount}`)
  })

  await test('two purchases get different checkout IDs and order IDs', async () => {
    const r1 = await runFullJourney()
    const r2 = await runFullJourney()
    assert(r1.checkoutId !== r2.checkoutId, 'Checkout IDs must be unique')
    assert(r1.completeRes.body.order_id !== r2.completeRes.body.order_id, 'Order IDs must be unique')
  })

  // ── PAYMENT PATHS ──────────────────────────
  console.log('\n  Payment paths\n')

  await test('tok_3ds: returns requires_escalation with continue_url', async () => {
    const { completeRes } = await runFullJourney({ token: 'tok_3ds' })
    assert(completeRes.body.status === 'requires_escalation', 'Must be requires_escalation for 3DS')
    assert(completeRes.body.continue_url, 'Must return a continue_url for the bank challenge')
    const msg = completeRes.body.messages?.find(m => m.code === 'requires_3ds')
    assert(msg, 'Must have requires_3ds message')
    assert(msg.severity === 'requires_buyer_input', '3DS requires buyer input to resolve')
  })

  await test('tok_decline: returns requires_escalation as unrecoverable', async () => {
    const { completeRes } = await runFullJourney({ token: 'tok_decline' })
    assert(completeRes.body.status === 'requires_escalation', 'Declined = requires_escalation')
    const msg = completeRes.body.messages?.find(m => m.code === 'payment_declined')
    assert(msg?.severity === 'unrecoverable', 'Decline is unrecoverable — agent needs new payment')
  })

  // ── NEGOTIATION ────────────────────────────
  console.log('\n  Capability negotiation\n')

  await test('with UCP-Agent: fulfillment section appears in PATCH response', async () => {
    const createRes = await request(
      'POST', '/ucp/v1/checkout-sessions',
      { line_items: [{ id:'li_1', item:{ id:'p1', title:'T', price:1000 }, quantity:1 }] },
      { 'UCP-Agent': 'profile="http://localhost:3000/test-platform-profile"' }
    )
    const patchRes = await request(
      'PATCH', `/ucp/v1/checkout-sessions/${createRes.body.id}`,
      { buyer: { email: 'a@b.com', first_name: 'A', last_name: 'B' },
        fulfillment: { destinations:[{ street_address:'1 St', city:'SF', postal_code:'94105', country_code:'US' }], selected_option_id:'free' }},
      { 'UCP-Agent': 'profile="http://localhost:3000/test-platform-profile"' }
    )
    assert(patchRes.body.fulfillment, 'Fulfillment section must appear when negotiated')
    assert(patchRes.body.fulfillment.available_methods?.length === 2, 'Must have 2 shipping options')
  })

  await test('without UCP-Agent: checkout works, fulfillment uses merchant defaults', async () => {
    const createRes = await request(
      'POST', '/ucp/v1/checkout-sessions',
      { line_items: [{ id:'li_1', item:{ id:'p1', title:'T', price:1000 }, quantity:1 }] }
    )
    assert(createRes.status === 201, 'Checkout must still be created without UCP-Agent')
    assert(createRes.body.id?.startsWith('chk_'), 'Must get a checkout ID')
  })

  // ── SPEC COMPLIANCE ────────────────────────
  console.log('\n  Spec compliance\n')

  await test('profile has Cache-Control: public, max-age >= 60', async () => {
    const res = await request('GET', '/.well-known/ucp')
    const cc = res.headers['cache-control'] || ''
    assert(cc.includes('public'), 'Cache-Control must include public')
    const maxAge = parseInt(cc.match(/max-age=(\d+)/)?.[1] || '0')
    assert(maxAge >= 60, `max-age must be >= 60, got ${maxAge}`)
  })

  await test('profile Content-Type is application/json', async () => {
    const res = await request('GET', '/.well-known/ucp')
    assert(
      res.headers['content-type']?.includes('application/json'),
      'Content-Type must be application/json'
    )
  })

  await test('checkout response always includes ucp.capabilities', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [{ id:'li_1', item:{ id:'p1', title:'T', price:100 }, quantity:1 }]
    })
    assert(res.body.ucp?.capabilities !== undefined, 'ucp.capabilities must always be present')
  })

  await test('completed checkout returns 400 on second payment attempt', async () => {
    const { checkoutId } = await runFullJourney()
    const retry = await request(
      'POST',
      `/ucp/v1/checkout-sessions/${checkoutId}/complete`,
      { payment: { instruments: [{ handler_id:'gpay_handler_1', type:'card', credential:{ type:'PAYMENT_GATEWAY', token:'tok_success' }}]}}
    )
    assert(retry.status === 400, 'Second payment on completed checkout must return 400')
    assert(retry.body.code === 'already_completed', 'Must return already_completed code')
  })

  await test('404 for unknown checkout ID', async () => {
    const res = await request('GET', '/ucp/v1/checkout-sessions/chk_doesnotexist999')
    assert(res.status === 404, `Expected 404 got ${res.status}`)
  })

  // ── RESULTS ────────────────────────────────
  console.log('')
  console.log('  ─────────────────────────────────')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('  ─────────────────────────────────')
  if (failed > 0) {
    console.log('  Fix the failures — they show a gap in the implementation.')
    process.exit(1)
  } else {
    console.log('  All tests pass. Day 7 complete.')
    console.log('  Your merchant is E2E spec-compliant.')
    console.log('  Ready for Day 8: Discount extension')
  }
  console.log('')
  process.exit(0)
}

setTimeout(runTests, 800)
