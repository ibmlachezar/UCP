// tests/webhooks.test.js — Day 11: Order webhooks

const http = require('http')
const {
  buildWebhookPayload,
  signPayload,
  verifySignature,
  STATUS_LIFECYCLE,
  WEBHOOK_SECRET
} = require('../lib/webhooks')
let passed = 0, failed = 0

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const req = http.request({
      hostname:'localhost', port:3000, path, method,
      headers:{ 'Content-Type':'application/json',
        ...(bodyStr ? {'Content-Length':Buffer.byteLength(bodyStr)} : {}) }
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status:res.statusCode, body:JSON.parse(data) }))
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

function assert(c, m) { if (!c) throw new Error(m || 'Assertion failed') }

// Helper: run full purchase to get an order_id
async function completePurchase() {
  const create = await request('POST', '/ucp/v1/checkout-sessions', {
    line_items: [{ id:'li_1', item:{ id:'p1', title:'Suitcase', price:26550 }, quantity:1 }]
  })
  const id = create.body.id
  await request('PATCH', `/ucp/v1/checkout-sessions/${id}`, {
    buyer: { email:'test@example.com', first_name:'Test', last_name:'User' },
    fulfillment: {
      destinations: [{ street_address:'1 Main St', city:'SF', postal_code:'94105', country_code:'US' }],
      selected_option_id: 'free'
    }
  })
  const complete = await request('POST', `/ucp/v1/checkout-sessions/${id}/complete`, {
    payment: { instruments:[{ handler_id:'gpay_handler_1', type:'card', credential:{ type:'PAYMENT_GATEWAY', token:'tok_success' }}]}
  })
  return complete.body.order_id
}

async function runTests() {
  console.log('\n  Unit tests — webhooks module\n')

  await test('STATUS_LIFECYCLE has correct order: processing → shipped → out_for_delivery → delivered', async () => {
    assert(STATUS_LIFECYCLE.processing.next === 'shipped', 'processing → shipped')
    assert(STATUS_LIFECYCLE.shipped.next === 'out_for_delivery', 'shipped → out_for_delivery')
    assert(STATUS_LIFECYCLE.out_for_delivery.next === 'delivered', 'out_for_delivery → delivered')
    assert(STATUS_LIFECYCLE.delivered.next === null, 'delivered is the final status')
  })

  await test('buildWebhookPayload includes event_type, order, and timestamp', async () => {
    const fakeOrder = { id:'order_test', status:'shipped', checkout_id:'chk_abc',
      buyer:{ email:'a@b.com' }, totals:[], shipping_method:null }
    const payload = buildWebhookPayload(fakeOrder, 'order.shipped', 'Your order shipped')
    assert(payload.event_type === 'order.shipped', 'Should have event_type')
    assert(payload.order.id === 'order_test', 'Should have order id')
    assert(payload.timestamp, 'Should have timestamp')
    assert(payload.event_id?.startsWith('evt_'), 'Should have event_id')
  })

  await test('signPayload produces sha256 signature', async () => {
    const payload = { test: 'data' }
    const { signature, header } = signPayload(payload)
    assert(signature.length === 64, 'HMAC-SHA256 hex should be 64 chars')
    assert(header.startsWith('sha256='), 'Header should start with sha256=')
  })

  await test('verifySignature: valid signature returns true', async () => {
    const payload = { event:'test', data:'hello' }
    const { body, header } = signPayload(payload)
    assert(verifySignature(body, header) === true, 'Should verify valid signature')
  })

  await test('verifySignature: tampered payload returns false', async () => {
    const payload = { event:'test', data:'hello' }
    const { header } = signPayload(payload)
    const tamperedBody = JSON.stringify({ event:'test', data:'TAMPERED' })
    assert(verifySignature(tamperedBody, header) === false, 'Should reject tampered payload')
  })

  await test('verifySignature: wrong signature returns false', async () => {
    const { body } = signPayload({ test:'data' })
    assert(verifySignature(body, 'sha256=wrongsignature') === false, 'Should reject wrong signature')
  })

  console.log('\n  Integration tests — full webhook flow\n')

  await test('POST /webhooks/register: registers successfully for valid order', async () => {
    const orderId = await completePurchase()
    const res = await request('POST', '/ucp/v1/webhooks/register', {
      order_id:    orderId,
      webhook_url: 'http://localhost:3001/webhook-receiver'
    })
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.registered === true, 'Should confirm registration')
    assert(res.body.order_id === orderId, 'Should echo back order_id')
    assert(Array.isArray(res.body.events), 'Should list events that will be sent')
  })

  await test('POST /webhooks/register: 404 for unknown order', async () => {
    const res = await request('POST', '/ucp/v1/webhooks/register', {
      order_id:    'order_doesnotexist',
      webhook_url: 'http://localhost:3001/webhook-receiver'
    })
    assert(res.status === 404, `Expected 404 got ${res.status}`)
  })

  await test('POST /webhooks/register: 400 for missing fields', async () => {
    const res = await request('POST', '/ucp/v1/webhooks/register', { order_id:'order_abc' })
    assert(res.status === 400, `Expected 400 got ${res.status}`)
  })

  await test('POST /orders/:id/advance: moves processing → shipped', async () => {
    const orderId = await completePurchase()
    const res = await request('POST', `/ucp/v1/orders/${orderId}/advance`)
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.order.status === 'shipped', `Expected shipped got ${res.body.order.status}`)
    assert(res.body.webhook_dispatched === true, 'Should dispatch webhook')
    assert(res.body.webhook.event_type === 'order.shipped', `Expected order.shipped got ${res.body.webhook.event_type}`)
    assert(res.body.webhook.signature, 'Webhook should include signature')
  })

  await test('order gets tracking number when shipped', async () => {
    const orderId = await completePurchase()
    const res = await request('POST', `/ucp/v1/orders/${orderId}/advance`)
    assert(res.body.order.tracking?.tracking_number, 'Should have tracking number when shipped')
    assert(res.body.order.tracking?.carrier, 'Should have carrier info')
    assert(res.body.order.tracking?.estimated_delivery, 'Should have estimated delivery date')
  })

  await test('full lifecycle: processing → shipped → out_for_delivery → delivered', async () => {
    const orderId = await completePurchase()
    const statuses = ['shipped', 'out_for_delivery', 'delivered']
    for (const expectedStatus of statuses) {
      const res = await request('POST', `/ucp/v1/orders/${orderId}/advance`)
      assert(res.body.order.status === expectedStatus,
        `Expected ${expectedStatus} got ${res.body.order.status}`)
    }
  })

  await test('cannot advance past delivered (final status)', async () => {
    const orderId = await completePurchase()
    // Advance to delivered
    await request('POST', `/ucp/v1/orders/${orderId}/advance`)
    await request('POST', `/ucp/v1/orders/${orderId}/advance`)
    await request('POST', `/ucp/v1/orders/${orderId}/advance`)
    // Try to advance again
    const res = await request('POST', `/ucp/v1/orders/${orderId}/advance`)
    assert(res.status === 400, `Expected 400 got ${res.status}`)
    assert(res.body.code === 'already_final', 'Should return already_final error')
  })

  await test('GET /orders/:id returns order with event history', async () => {
    const orderId = await completePurchase()
    await request('POST', `/ucp/v1/orders/${orderId}/advance`) // ship it
    const res = await request('GET', `/ucp/v1/orders/${orderId}`)
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.order.id === orderId, 'Should return correct order')
    assert(Array.isArray(res.body.event_history), 'Should have event history')
    assert(res.body.event_history.length > 0, 'Should have at least one event')
  })

  await test('GET /orders/:id includes webhook registration info after register', async () => {
    const orderId = await completePurchase()
    await request('POST', '/ucp/v1/webhooks/register', {
      order_id: orderId, webhook_url: 'http://localhost:3001/test'
    })
    const res = await request('GET', `/ucp/v1/orders/${orderId}`)
    assert(res.body.webhook_registration?.url === 'http://localhost:3001/test',
      'Should show webhook registration')
  })

  await test('webhook payload contains valid verifiable signature', async () => {
    const orderId = await completePurchase()
    const advanceRes = await request('POST', `/ucp/v1/orders/${orderId}/advance`)
    const { signature, signed_body } = advanceRes.body.webhook
    // Verify using the exact body that was signed (not re-serialized)
    const valid = verifySignature(signed_body, signature)
    assert(valid === true, 'Agent should be able to verify the webhook signature')
  })

  console.log('')
  console.log('  ─────────────────────────────────')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('  ─────────────────────────────────')
  if (failed > 0) { process.exit(1) }
  else {
    console.log('  All tests pass. Day 11 complete.')
    console.log('  The order lifecycle + webhook system is working.')
    console.log('  Ready for Day 12: HTTP Message Signatures (RFC 9421)')
  }
  console.log('')
  process.exit(0)
}

setTimeout(runTests, 800)
