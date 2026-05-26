// tests/complete.test.js
//
// Tests for POST /checkout-sessions/:id/complete
//
// The bar tab analogy:
//   - Happy path = card approved, receipt printed
//   - tok_3ds = card reader says "enter your PIN"
//   - tok_decline = card declined, try another
//   - Wrong handler = "we don't accept that card type"
//   - Incomplete tab = "you haven't finished ordering yet"

const http = require('http')
let passed = 0, failed = 0

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
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

// Build a fully ready checkout (ready_for_complete)
async function readyCheckout() {
  const create = await request('POST', '/ucp/v1/checkout-sessions', {
    line_items: [{
      id: 'li_1',
      item: { id: 'p1', title: 'Suitcase', price: 26550 },
      quantity: 1
    }]
  })
  const id = create.body.id

  await request('PATCH', `/ucp/v1/checkout-sessions/${id}`, {
    buyer: {
      email: 'elisa@example.com',
      first_name: 'Elisa',
      last_name: 'Martinez'
    },
    fulfillment: {
      destinations: [{
        street_address: '123 Main St',
        city: 'San Francisco',
        postal_code: '94105',
        country_code: 'US'
      }],
      selected_option_id: 'free'
    }
  })

  return id
}

// Standard payment body
function paymentBody(token = 'tok_success', handlerId = 'gpay_handler_1') {
  return {
    payment: {
      instruments: [{
        handler_id: handlerId,
        type: 'card',
        credential: { type: 'PAYMENT_GATEWAY', token }
      }]
    },
    signals: { 'dev.ucp.buyer_ip': '1.2.3.4' }
  }
}

async function runTests() {
  console.log('\n  POST /ucp/v1/checkout-sessions/:id/complete\n')

  await test('happy path — status becomes completed', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody())
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.status === 'completed', `Expected completed got ${res.body.status}`)
  })

  await test('happy path — order_id is returned', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody())
    assert(res.body.order_id?.startsWith('order_'), `Expected order_id starting with order_, got ${res.body.order_id}`)
  })

  await test('happy path — order contains buyer info', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody())
    assert(res.body.order?.buyer?.email === 'elisa@example.com', 'Order should contain buyer email')
  })

  await test('happy path — order contains totals', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody())
    assert(Array.isArray(res.body.order?.totals), 'Order should contain totals array')
    const total = res.body.order.totals.find(t => t.type === 'total')
    assert(total?.amount === 29205, `Total should be 29205 got ${total?.amount}`)
  })

  await test('tok_3ds — returns requires_escalation with continue_url', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody('tok_3ds'))
    assert(res.body.status === 'requires_escalation', `Expected requires_escalation got ${res.body.status}`)
    assert(res.body.continue_url, 'Should return a continue_url for the 3DS challenge')
    const msg = res.body.messages?.find(m => m.code === 'requires_3ds')
    assert(msg, 'Should have requires_3ds message')
  })

  await test('tok_decline — returns requires_escalation with payment_declined', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody('tok_decline'))
    assert(res.body.status === 'requires_escalation', `Expected requires_escalation got ${res.body.status}`)
    const msg = res.body.messages?.find(m => m.code === 'payment_declined')
    assert(msg, 'Should have payment_declined message')
    assert(msg.severity === 'unrecoverable', 'Declined payment should be unrecoverable')
  })

  await test('wrong handler_id — returns 400 invalid_handler', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody('tok_success', 'fake_handler'))
    assert(res.status === 400, `Expected 400 got ${res.status}`)
    assert(res.body.code === 'invalid_handler', `Expected invalid_handler got ${res.body.code}`)
  })

  await test('incomplete checkout — returns 400', async () => {
    // Create a checkout but don't PATCH it — stays incomplete
    const create = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [{ id:'li_1', item:{ id:'p1', title:'T', price: 1000 }, quantity:1 }]
    })
    const res = await request('POST', `/ucp/v1/checkout-sessions/${create.body.id}/complete`, paymentBody())
    assert(res.status === 400, `Expected 400 got ${res.status}`)
    assert(res.body.code === 'checkout_incomplete', `Expected checkout_incomplete got ${res.body.code}`)
  })

  await test('already completed — returns 400', async () => {
    const id = await readyCheckout()
    await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody())
    // Try to pay again
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody())
    assert(res.status === 400, `Expected 400 got ${res.status}`)
    assert(res.body.code === 'already_completed', 'Should reject double payment')
  })

  await test('unknown checkout id — returns 404', async () => {
    const res = await request('POST', '/ucp/v1/checkout-sessions/chk_fake/complete', paymentBody())
    assert(res.status === 404, `Expected 404 got ${res.status}`)
  })

  await test('missing payment instruments — returns 400', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, {})
    assert(res.status === 400, `Expected 400 got ${res.status}`)
  })

  await test('each completed order gets a unique order_id', async () => {
    const id1 = await readyCheckout()
    const id2 = await readyCheckout()
    const r1 = await request('POST', `/ucp/v1/checkout-sessions/${id1}/complete`, paymentBody())
    const r2 = await request('POST', `/ucp/v1/checkout-sessions/${id2}/complete`, paymentBody())
    assert(r1.body.order_id !== r2.body.order_id, 'Each order must have a unique ID')
  })

  await test('response includes ucp.capabilities', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody())
    assert(res.body.ucp?.capabilities, 'Response must include ucp.capabilities')
  })

  await test('response includes next_steps after completion', async () => {
    const id = await readyCheckout()
    const res = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, paymentBody())
    assert(res.body.next_steps?.track, 'Should include next_steps.track for order tracking')
  })

  console.log('')
  console.log('  ─────────────────────────────────')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('  ─────────────────────────────────')
  if (failed > 0) {
    console.log('  Fix failing tests before Day 7.')
    process.exit(1)
  } else {
    console.log('  All tests pass. Day 6 complete.')
    console.log('  The full purchase loop is now working.')
    console.log('  Ready for Day 7: E2E test suite')
  }
  console.log('')
  process.exit(0)
}

setTimeout(runTests, 800)
