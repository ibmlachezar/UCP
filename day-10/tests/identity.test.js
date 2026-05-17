// tests/identity.test.js — Day 10: OAuth identity linking

const http = require('http')
const { linkRequest, getStatus } = require('../lib/identity')
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
  console.log('\n  Unit tests — identity module\n')

  await test('known user by platform_id returns linked status', async () => {
    const result = linkRequest({
      platform: 'google',
      platform_id: 'google_user_elisa_123',
      email: 'elisa@example.com'
    })
    assert(result.status === 'linked', `Expected linked got ${result.status}`)
    assert(result.account?.name === 'Elisa Martinez', 'Should return account name')
    assert(result.account?.loyalty_points === 1250, 'Should return loyalty points')
  })

  await test('known user gets saved address pre-filled', async () => {
    const result = linkRequest({ platform:'google', platform_id:'google_user_elisa_123' })
    assert(result.account?.saved_addresses?.length > 0, 'Should have saved addresses')
    assert(result.account.saved_addresses[0].city === 'San Francisco', 'Should have correct city')
  })

  await test('gold tier user gets 15% loyalty discount', async () => {
    const result = linkRequest({ platform:'google', platform_id:'google_user_elisa_123' })
    assert(result.loyalty_discount?.value === 15, `Gold tier should get 15%, got ${result.loyalty_discount?.value}`)
    assert(result.loyalty_discount?.code === 'LOYAL15', 'Should have LOYAL15 code')
  })

  await test('unknown user returns not_linked with auth_url', async () => {
    const result = linkRequest({ platform:'google', platform_id:'google_unknown_999', email:'new@example.com' })
    assert(result.status === 'not_linked', `Expected not_linked got ${result.status}`)
    assert(result.auth_url, 'Should return auth_url')
    assert(result.auth_url.includes('session='), 'auth_url should contain session token')
    assert(result.optional === true, 'Identity linking should be optional')
  })

  await test('getStatus returns linked for known identity', async () => {
    const status = getStatus('google', 'google_user_elisa_123')
    assert(status.linked === true, 'Should be linked')
    assert(status.tier === 'gold', 'Should have gold tier')
    assert(status.loyalty_points === 1250, 'Should have 1250 points')
  })

  await test('getStatus returns not linked for unknown identity', async () => {
    const status = getStatus('google', 'google_nobody_999')
    assert(status.linked === false, 'Should not be linked')
  })

  await test('can match by email as well as platform_id', async () => {
    const result = linkRequest({ platform:'google', email:'elisa@example.com' })
    assert(result.status === 'linked', 'Should find user by email too')
  })

  console.log('\n  Integration tests — HTTP endpoints\n')

  await test('POST /identity/link-request: known user → linked', async () => {
    const res = await request('POST', '/ucp/v1/identity/link-request', {
      platform_identity: { platform:'google', platform_id:'google_user_elisa_123' }
    })
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.status === 'linked', `Expected linked got ${res.body.status}`)
    assert(res.body.account?.loyalty_points === 1250, 'Should have 1250 points')
  })

  await test('POST /identity/link-request: unknown user → not_linked + auth_url', async () => {
    const res = await request('POST', '/ucp/v1/identity/link-request', {
      platform_identity: { platform:'google', platform_id:'google_brand_new_user', email:'newuser@example.com' }
    })
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.status === 'not_linked', `Expected not_linked got ${res.body.status}`)
    assert(res.body.auth_url, 'Should have auth_url')
    assert(res.body.optional === true, 'Should be optional')
  })

  await test('POST /identity/link-request: missing platform returns 400', async () => {
    const res = await request('POST', '/ucp/v1/identity/link-request', {
      platform_identity: { platform_id:'abc' }  // missing platform field
    })
    assert(res.status === 400, `Expected 400 got ${res.status}`)
  })

  await test('GET /identity/status: linked identity returns correct tier', async () => {
    const res = await request('GET', '/ucp/v1/identity/status?platform=google&id=google_user_elisa_123')
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.linked === true, 'Should be linked')
    assert(res.body.tier === 'gold', 'Should be gold tier')
  })

  await test('GET /identity/status: unknown identity returns linked: false', async () => {
    const res = await request('GET', '/ucp/v1/identity/status?platform=google&id=nobody')
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.linked === false, 'Should not be linked')
  })

  await test('GET /identity/status: missing params returns 400', async () => {
    const res = await request('GET', '/ucp/v1/identity/status?platform=google')
    assert(res.status === 400, `Expected 400 got ${res.status}`)
  })

  await test('complete link flow: request → complete → now linked', async () => {
    // 1. Request for unknown user — get session token
    const linkRes = await request('POST', '/ucp/v1/identity/link-request', {
      platform_identity: { platform:'google', platform_id:'google_james_456', email:'james@example.com' }
    })
    assert(linkRes.body.status === 'not_linked', 'Should start as not linked')
    const sessionToken = linkRes.body.session_token

    // 2. Complete the link (simulate OAuth callback)
    const completeRes = await request('POST', '/ucp/v1/identity/complete-link', {
      session_token: sessionToken,
      merchant_email: 'james@example.com'
    })
    assert(completeRes.body.success === true, 'Should complete successfully')

    // 3. Now check status — should be linked
    const statusRes = await request('GET', `/ucp/v1/identity/status?platform=google&id=google_james_456`)
    assert(statusRes.body.linked === true, 'Should now be linked after completing OAuth flow')
  })

  await test('merchant profile declares identity_linking capability', async () => {
    const res = await request('GET', '/.well-known/ucp')
    const caps = res.body.ucp?.capabilities
    assert(caps?.['dev.ucp.shopping.identity_linking'], 'identity_linking must be in merchant profile')
  })

  await test('response always includes ucp.capabilities', async () => {
    const res = await request('POST', '/ucp/v1/identity/link-request', {
      platform_identity: { platform:'google', platform_id:'google_user_elisa_123' }
    })
    assert(res.body.ucp?.capabilities !== undefined, 'Must include ucp.capabilities')
  })

  console.log('')
  console.log('  ─────────────────────────────────')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('  ─────────────────────────────────')
  if (failed > 0) { process.exit(1) }
  else { console.log('  All tests pass. Day 10 complete.\n  Ready for Day 11: Order webhooks') }
  console.log('')
  process.exit(0)
}

setTimeout(runTests, 800)
