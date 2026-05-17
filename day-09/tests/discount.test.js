// tests/discount.test.js

const http = require('http')
const { validateDiscountCode, calculateDiscountAmount, isDiscountActive } = require('../lib/discount')
let passed = 0, failed = 0

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const req = http.request({
      hostname:'localhost', port:3000, path, method,
      headers:{ 'Content-Type':'application/json', ...headers, ...(bodyStr?{'Content-Length':Buffer.byteLength(bodyStr)}:{}) }
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

const agentHeaders = { 'UCP-Agent':'profile="http://localhost:3000/test-platform-profile"' }
const fullBuyer = {
  buyer:{ email:'test@example.com', first_name:'Elisa', last_name:'Martinez' },
  fulfillment:{ destinations:[{ street_address:'123 Main St', city:'SF', postal_code:'94105', country_code:'US' }], selected_option_id:'free' }
}

async function freshCheckout() {
  const res = await request('POST', '/ucp/v1/checkout-sessions', {
    line_items:[{ id:'li_1', item:{ id:'p1', title:'Suitcase', price:26550 }, quantity:1 }]
  }, agentHeaders)
  return res.body.id
}

async function runTests() {
  console.log('\n  Unit tests — discount module\n')

  await test('SAVE10 is valid', async () => {
    const r = validateDiscountCode('SAVE10')
    assert(r.valid === true, 'SAVE10 should be valid')
  })

  await test('case insensitive — save10 works', async () => {
    const r = validateDiscountCode('save10')
    assert(r.valid === true, 'save10 should work same as SAVE10')
  })

  await test('unknown code returns code_not_found', async () => {
    const r = validateDiscountCode('NOTREAL')
    assert(r.valid === false && r.error.code === 'code_not_found', 'Should return code_not_found')
  })

  await test('expired code returns code_expired', async () => {
    const r = validateDiscountCode('EXPIRED')
    assert(r.valid === false && r.error.code === 'code_expired', 'Should return code_expired')
  })

  await test('10% of 26550 = 2655', async () => {
    const amount = calculateDiscountAmount({ type:'percentage', value:10 }, 26550)
    assert(amount === 2655, `Expected 2655 got ${amount}`)
  })

  await test('20% of 26550 = 5310', async () => {
    const amount = calculateDiscountAmount({ type:'percentage', value:20 }, 26550)
    assert(amount === 5310, `Expected 5310 got ${amount}`)
  })

  await test('fixed $5 = 500 cents', async () => {
    const amount = calculateDiscountAmount({ type:'fixed', value:500 }, 26550)
    assert(amount === 500, `Expected 500 got ${amount}`)
  })

  await test('fixed discount cannot exceed subtotal', async () => {
    const amount = calculateDiscountAmount({ type:'fixed', value:99999 }, 26550)
    assert(amount === 26550, 'Should cap at subtotal')
  })

  await test('isDiscountActive: true when checkout present (OR rule)', async () => {
    assert(isDiscountActive({ 'dev.ucp.shopping.checkout':[{}] }) === true)
  })

  await test('isDiscountActive: true when cart present (OR rule)', async () => {
    assert(isDiscountActive({ 'dev.ucp.shopping.cart':[{}] }) === true)
  })

  await test('isDiscountActive: false when neither parent present', async () => {
    assert(isDiscountActive({ 'dev.ucp.shopping.catalog':[{}] }) === false)
  })

  console.log('\n  Integration tests\n')

  await test('SAVE10 — totals recalculate: discount -2655, tax 2390, total 26285', async () => {
    const id = await freshCheckout()
    const res = await request('PATCH', `/ucp/v1/checkout-sessions/${id}`, { ...fullBuyer, discounts:{ codes:['SAVE10'] } }, agentHeaders)
    const discount = res.body.totals?.find(t => t.type === 'discount')
    const tax      = res.body.totals?.find(t => t.type === 'tax')
    const total    = res.body.totals?.find(t => t.type === 'total')
    assert(discount?.amount === -2655, `Discount should be -2655, got ${discount?.amount}`)
    assert(tax?.amount === 2390,       `Tax should be 2390, got ${tax?.amount}`)
    assert(total?.amount === 26285,    `Total should be 26285, got ${total?.amount}`)
  })

  await test('SAVE10 — discount section shows applied code and savings', async () => {
    const id = await freshCheckout()
    const res = await request('PATCH', `/ucp/v1/checkout-sessions/${id}`, { ...fullBuyer, discounts:{ codes:['SAVE10'] } }, agentHeaders)
    assert(res.body.discounts?.applied?.code === 'SAVE10', 'Applied code should be SAVE10')
    assert(res.body.discounts?.applied?.savings === 2655, 'Savings should be 2655')
  })

  await test('SAVE10 — status flips to ready_for_complete', async () => {
    const id = await freshCheckout()
    const res = await request('PATCH', `/ucp/v1/checkout-sessions/${id}`, { ...fullBuyer, discounts:{ codes:['SAVE10'] } }, agentHeaders)
    assert(res.body.status === 'ready_for_complete', `Got ${res.body.status}`)
  })

  await test('FIXED5 — $5 off (500 cents deducted)', async () => {
    const id = await freshCheckout()
    const res = await request('PATCH', `/ucp/v1/checkout-sessions/${id}`, { ...fullBuyer, discounts:{ codes:['FIXED5'] } }, agentHeaders)
    const discount = res.body.totals?.find(t => t.type === 'discount')
    assert(discount?.amount === -500, `Fixed discount should be -500, got ${discount?.amount}`)
  })

  await test('invalid code — info message returned, checkout not blocked', async () => {
    const id = await freshCheckout()
    const res = await request('PATCH', `/ucp/v1/checkout-sessions/${id}`, { ...fullBuyer, discounts:{ codes:['FAKECODE'] } }, agentHeaders)
    const msg = res.body.messages?.find(m => m.code === 'invalid_discount')
    assert(msg, 'Should have invalid_discount message')
    assert(msg.type === 'info', 'Invalid discount is advisory, not blocking')
  })

  await test('no discount — original total 29205 unchanged', async () => {
    const id = await freshCheckout()
    const res = await request('PATCH', `/ucp/v1/checkout-sessions/${id}`, fullBuyer, agentHeaders)
    const total = res.body.totals?.find(t => t.type === 'total')
    assert(total?.amount === 29205, `Total without discount should be 29205, got ${total?.amount}`)
  })

  console.log('')
  console.log('  ─────────────────────────────────')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('  ─────────────────────────────────')
  if (failed > 0) { console.log('  Fix failing tests.'); process.exit(1) }
  else { console.log('  All tests pass. Day 8 complete.\n  Ready for Day 9: Catalog search') }
  console.log('')
  process.exit(0)
}

setTimeout(runTests, 800)
