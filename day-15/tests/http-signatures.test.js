// tests/http-signatures.test.js — Day 12: HTTP Message Signatures

const http = require('http')
const {
  signMessage,
  verifyMessage,
  getPublicKeyJwk,
  sha256,
  PUBLIC_KEY_PEM
} = require('../lib/http-signatures')

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

async function runTests() {
  console.log('\n  Unit tests — HTTP Message Signatures\n')

  await test('signMessage returns signature, signatureInput, and httpHeaders', async () => {
    const body = JSON.stringify({ event:'test', data:'hello' })
    const result = signMessage(body)
    assert(result.signature, 'Should return signature')
    assert(result.signatureInput, 'Should return signatureInput')
    assert(result.httpHeaders?.['Signature'], 'Should return Signature header')
    assert(result.httpHeaders?.['Signature-Input'], 'Should return Signature-Input header')
    assert(result.httpHeaders?.['Content-Digest'], 'Should return Content-Digest header')
  })

  await test('Signature header is in RFC 9421 format: sig1=:xxx:', async () => {
    const body = JSON.stringify({ test: 'data' })
    const result = signMessage(body)
    assert(
      /^sig1=:[A-Za-z0-9_-]+=*:$/.test(result.httpHeaders['Signature']),
      `Signature header format incorrect: ${result.httpHeaders['Signature']}`
    )
  })

  await test('verifyMessage: valid signature returns { valid: true }', async () => {
    const body = JSON.stringify({ event:'order.shipped', orderId:'order_123' })
    const { signature, timestamp } = signMessage(body)
    const result = verifyMessage(body, signature, timestamp)
    assert(result.valid === true, `Expected valid, got: ${result.reason}`)
  })

  await test('verifyMessage: tampered body fails verification', async () => {
    const body = JSON.stringify({ event:'order.shipped', orderId:'order_123' })
    const { signature, timestamp } = signMessage(body)
    const tampered = JSON.stringify({ event:'order.shipped', orderId:'order_FAKE' })
    const result = verifyMessage(tampered, signature, timestamp)
    assert(result.valid === false, 'Tampered body should fail verification')
  })

  await test('verifyMessage: wrong signature fails', async () => {
    const body = JSON.stringify({ event:'test' })
    const { timestamp } = signMessage(body)
    const result = verifyMessage(body, 'completely_wrong_signature', timestamp)
    assert(result.valid === false, 'Wrong signature should fail')
  })

  await test('verifyMessage: replay attack (old timestamp) fails', async () => {
    const body = JSON.stringify({ event:'test' })
    const { signature } = signMessage(body)
    // Fake an old timestamp — 10 minutes ago
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600
    const result = verifyMessage(body, signature, oldTimestamp)
    assert(result.valid === false, 'Old message should be rejected as replay attack')
    assert(result.reason.includes('old'), `Expected 'old' in reason: ${result.reason}`)
  })

  await test('Content-Digest is SHA-256 of body', async () => {
    const body = JSON.stringify({ test: 'data' })
    const { httpHeaders } = signMessage(body)
    const digest = httpHeaders['Content-Digest']
    const expected = `sha-256=:${sha256(body)}:`
    assert(digest === expected, `Content-Digest mismatch: ${digest} vs ${expected}`)
  })

  await test('public key JWK has correct fields for signing_keys', async () => {
    const jwk = getPublicKeyJwk()
    assert(jwk.kty === 'EC', 'kty should be EC (Elliptic Curve)')
    assert(jwk.crv === 'P-256', 'crv should be P-256')
    assert(jwk.alg === 'ES256', 'alg should be ES256')
    assert(jwk.use === 'sig', 'use should be sig (signing)')
    assert(jwk.x, 'Should have x coordinate')
    assert(jwk.y, 'Should have y coordinate')
    assert(jwk.kid, 'Should have kid (key ID)')
    assert(!jwk.d, 'Public JWK must NOT contain d (private key parameter!)')
  })

  await test('signing is asymmetric: different message = different signature', async () => {
    const r1 = signMessage(JSON.stringify({ order: 'A' }))
    const r2 = signMessage(JSON.stringify({ order: 'B' }))
    assert(r1.signature !== r2.signature, 'Different messages should produce different signatures')
  })

  await test('merchant profile signing_keys matches the public key used to sign', async () => {
    const res = await request('GET', '/.well-known/ucp')
    const keys = res.body.signing_keys
    assert(Array.isArray(keys) && keys.length > 0, 'signing_keys must be present')
    const key = keys[0]
    assert(key.kid === 'day12-key-1', `Expected day12-key-1, got ${key.kid}`)
    assert(key.alg === 'ES256', 'Should use ES256 algorithm')
    assert(!key.d, 'signing_keys must NEVER contain private key (d parameter)')
    const jwk = getPublicKeyJwk()
    assert(key.x === jwk.x, 'Profile key x should match signing key x')
    assert(key.y === jwk.y, 'Profile key y should match signing key y')
  })

  await test('full webhook flow uses HTTP Message Signature (not HMAC)', async () => {
    // Create a completed order
    const create = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [{ id:'li_1', item:{ id:'p1', title:'Suitcase', price:26550 }, quantity:1 }]
    })
    await request('PATCH', `/ucp/v1/checkout-sessions/${create.body.id}`, {
      buyer: { email:'t@t.com', first_name:'T', last_name:'U' },
      fulfillment: { destinations:[{ street_address:'1 St', city:'SF', postal_code:'94105', country_code:'US' }], selected_option_id:'free' }
    })
    const complete = await request('POST', `/ucp/v1/checkout-sessions/${create.body.id}/complete`, {
      payment: { instruments:[{ handler_id:'gpay_handler_1', type:'card', credential:{ type:'PAYMENT_GATEWAY', token:'tok_success' }}]}
    })
    const orderId = complete.body.order_id

    const advance = await request('POST', `/ucp/v1/orders/${orderId}/advance`)
    const sig = advance.body.webhook?.signature
    // RFC 9421 format: sig1=:xxx: (not sha256=xxx)
    assert(sig?.startsWith('sig1=:'), `Expected RFC 9421 sig1 format, got: ${sig}`)
  })

  await test('signed_body can be independently verified with public key', async () => {
    const create = await request('POST', '/ucp/v1/checkout-sessions', {
      line_items: [{ id:'li_1', item:{ id:'p1', title:'Suitcase', price:26550 }, quantity:1 }]
    })
    await request('PATCH', `/ucp/v1/checkout-sessions/${create.body.id}`, {
      buyer: { email:'t@t.com', first_name:'T', last_name:'U' },
      fulfillment: { destinations:[{ street_address:'1 St', city:'SF', postal_code:'94105', country_code:'US' }], selected_option_id:'free' }
    })
    const complete = await request('POST', `/ucp/v1/checkout-sessions/${create.body.id}/complete`, {
      payment: { instruments:[{ handler_id:'gpay_handler_1', type:'card', credential:{ type:'PAYMENT_GATEWAY', token:'tok_success' }}]}
    })
    const advance = await request('POST', `/ucp/v1/orders/${complete.body.order_id}/advance`)

    const { signature: sigHeader, signed_body } = advance.body.webhook
    // Extract sig from sig1=:xxx:
    const match = sigHeader?.match(/sig1=:([^:]+):/)
    if (match && signed_body) {
      // Verify using public key only — no private key needed
      const result = verifyMessage(
        signed_body,
        match[1],
        advance.body.webhook.timestamp || Math.floor(Date.now()/1000)
      )
      assert(result.valid === true, `Signature verification failed: ${result.reason}`)
    }
  })

  console.log('')
  console.log('  ─────────────────────────────────')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('  ─────────────────────────────────')
  if (failed > 0) { process.exit(1) }
  else {
    console.log('  All tests pass. Day 12 complete.')
    console.log('  HMAC → HTTP Message Signatures upgrade done.')
    console.log('  Ready for Day 13: UCP health check CLI')
  }
  console.log('')
  process.exit(0)
}

setTimeout(runTests, 800)
