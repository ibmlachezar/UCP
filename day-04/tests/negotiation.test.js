// tests/negotiation.test.js
//
// Tests for the capability negotiation engine.
// Run with: node tests/negotiation.test.js
//
// No test framework needed — pure Node.js assertions.
// Each test prints PASS or FAIL with a clear message.

const {
  extractProfileUrl,
  intersectCapabilities,
  pruneOrphanedExtensions
} = require('../lib/negotiation')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log('  PASS  ' + name)
    passed++
  } catch (err) {
    console.log('  FAIL  ' + name)
    console.log('        ' + err.message)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error((message || '') + '\n        actual:   ' + a + '\n        expected: ' + e)
}

// ─────────────────────────────────────────────────────────────
// PART 1: extractProfileUrl
// ─────────────────────────────────────────────────────────────
console.log('\n  extractProfileUrl\n')

test('extracts URL from valid UCP-Agent header', () => {
  const url = extractProfileUrl('profile="http://localhost:3000/test-platform-profile"')
  assertEqual(url, 'http://localhost:3000/test-platform-profile')
})

test('returns null when header is missing', () => {
  const url = extractProfileUrl(null)
  assertEqual(url, null)
})

test('returns null when header has no profile key', () => {
  const url = extractProfileUrl('version="2026-04-08"')
  assertEqual(url, null)
})

// ─────────────────────────────────────────────────────────────
// PART 2: intersectCapabilities
// ─────────────────────────────────────────────────────────────
console.log('\n  intersectCapabilities\n')

test('keeps capabilities that both sides declare', () => {
  const merchant  = { 'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }] }
  const platform  = { 'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }] }
  const result    = intersectCapabilities(merchant, platform)
  assert(result['dev.ucp.shopping.checkout'], 'checkout should survive')
})

test('removes capabilities the platform does not declare', () => {
  const merchant  = {
    'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }],
    'dev.ucp.shopping.catalog':  [{ version: '2026-04-08' }]
  }
  const platform  = { 'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }] }
  const result    = intersectCapabilities(merchant, platform)
  assert(result['dev.ucp.shopping.checkout'],  'checkout should survive')
  assert(!result['dev.ucp.shopping.catalog'],  'catalog should be removed — platform does not have it')
})

test('removes capabilities the merchant does not declare', () => {
  const merchant  = { 'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }] }
  const platform  = {
    'dev.ucp.shopping.checkout':    [{ version: '2026-04-08' }],
    'dev.ucp.shopping.fulfillment': [{ version: '2026-04-08' }]
  }
  const result = intersectCapabilities(merchant, platform)
  assert(!result['dev.ucp.shopping.fulfillment'], 'fulfillment removed — merchant does not have it')
})

test('picks the highest shared version when multiple exist', () => {
  const merchant = {
    'dev.ucp.shopping.checkout': [
      { version: '2026-04-08' },
      { version: '2025-10-01' }
    ]
  }
  const platform = {
    'dev.ucp.shopping.checkout': [
      { version: '2026-04-08' },
      { version: '2025-10-01' }
    ]
  }
  const result = intersectCapabilities(merchant, platform)
  assertEqual(result['dev.ucp.shopping.checkout'][0].version, '2026-04-08', 'should pick the newest version')
})

test('excludes capability when no shared version exists', () => {
  const merchant = { 'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }] }
  const platform = { 'dev.ucp.shopping.checkout': [{ version: '2025-10-01' }] }
  const result   = intersectCapabilities(merchant, platform)
  assert(!result['dev.ucp.shopping.checkout'], 'checkout removed — no shared version')
})

test('returns empty object when no overlap at all', () => {
  const merchant = { 'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }] }
  const platform = { 'dev.ucp.shopping.catalog':  [{ version: '2026-04-08' }] }
  const result   = intersectCapabilities(merchant, platform)
  assertEqual(Object.keys(result).length, 0, 'nothing should survive')
})

// ─────────────────────────────────────────────────────────────
// PART 3: pruneOrphanedExtensions
// ─────────────────────────────────────────────────────────────
console.log('\n  pruneOrphanedExtensions\n')

test('keeps extension when its parent is present', () => {
  const caps = {
    'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }],
    'dev.ucp.shopping.fulfillment': [{
      version: '2026-04-08',
      extends: 'dev.ucp.shopping.checkout'
    }]
  }
  const result = pruneOrphanedExtensions(caps)
  assert(result['dev.ucp.shopping.fulfillment'], 'fulfillment should survive — checkout is present')
})

test('removes extension when its parent is missing', () => {
  const caps = {
    // checkout is NOT here — it was removed by intersection
    'dev.ucp.shopping.fulfillment': [{
      version: '2026-04-08',
      extends: 'dev.ucp.shopping.checkout'
    }]
  }
  const result = pruneOrphanedExtensions(caps)
  assert(!result['dev.ucp.shopping.fulfillment'], 'fulfillment pruned — parent checkout is missing')
})

test('handles multi-parent extension — survives if ANY parent is present', () => {
  // discount extends BOTH checkout AND cart
  // checkout is present, cart is not — discount should survive
  const caps = {
    'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }],
    'dev.ucp.shopping.discount': [{
      version: '2026-04-08',
      extends: ['dev.ucp.shopping.checkout', 'dev.ucp.shopping.cart']
    }]
  }
  const result = pruneOrphanedExtensions(caps)
  assert(result['dev.ucp.shopping.discount'], 'discount survives — checkout (one of its parents) is present')
})

test('handles chain pruning — grandchild removed when grandparent missing', () => {
  // loyalty extends fulfillment extends checkout
  // If checkout is missing → fulfillment pruned → loyalty pruned
  const caps = {
    // checkout NOT present
    'dev.ucp.shopping.fulfillment': [{
      version: '2026-04-08',
      extends: 'dev.ucp.shopping.checkout'
    }],
    'dev.ucp.shopping.loyalty': [{
      version: '2026-04-08',
      extends: 'dev.ucp.shopping.fulfillment'
    }]
  }
  const result = pruneOrphanedExtensions(caps)
  assert(!result['dev.ucp.shopping.fulfillment'], 'fulfillment pruned — checkout missing')
  assert(!result['dev.ucp.shopping.loyalty'],     'loyalty pruned — fulfillment was pruned')
})

test('does not prune non-extension capabilities', () => {
  const caps = {
    'dev.ucp.shopping.checkout': [{ version: '2026-04-08' }],
    'dev.ucp.shopping.catalog':  [{ version: '2026-04-08' }]
  }
  const result = pruneOrphanedExtensions(caps)
  assert(result['dev.ucp.shopping.checkout'], 'checkout kept — not an extension')
  assert(result['dev.ucp.shopping.catalog'],  'catalog kept — not an extension')
})

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log('')
console.log('  ─────────────────────────────────')
console.log('  ' + passed + ' passed, ' + failed + ' failed')
console.log('  ─────────────────────────────────')
if (failed > 0) {
  console.log('  Fix the failing tests before moving to Day 3.')
  process.exit(1)
} else {
  console.log('  All tests pass. Day 2 complete.')
  console.log('  Ready for Day 3: POST /checkout-sessions')
}
console.log('')
