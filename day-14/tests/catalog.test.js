// tests/catalog.test.js — Day 9: Catalog search

const http = require('http')
const { searchProducts, findProductById, isCatalogActive } = require('../lib/catalog')
let passed = 0, failed = 0

function request(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname:'localhost', port:3000, path, method,
      headers:{'Content-Type':'application/json'}
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status:res.statusCode, body:JSON.parse(data) }))
    })
    req.on('error', reject)
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
  console.log('\n  Unit tests — catalog module\n')

  await test('searchProducts: returns all products with no filters', async () => {
    const result = searchProducts()
    assert(result.products.length > 0, 'Should return products')
    assert(result.total > 0, 'Should have total count')
  })

  await test('searchProducts: keyword search finds suitcase', async () => {
    const result = searchProducts({ q: 'suitcase' })
    assert(result.products.length >= 2, 'Should find at least 2 suitcases')
    assert(result.products.every(p => p.title.toLowerCase().includes('suitcase') ||
      p.tags.some(t => t.includes('suitcase'))), 'All results should match query')
  })

  await test('searchProducts: keyword search is case-insensitive', async () => {
    const r1 = searchProducts({ q: 'SUITCASE' })
    const r2 = searchProducts({ q: 'suitcase' })
    assert(r1.products.length === r2.products.length, 'Case should not matter')
  })

  await test('searchProducts: category filter works', async () => {
    const result = searchProducts({ category: 'luggage' })
    assert(result.products.every(p => p.category === 'luggage'), 'All should be luggage')
  })

  await test('searchProducts: in_stock filter excludes out-of-stock items', async () => {
    const result = searchProducts({ in_stock: 'true' })
    assert(result.products.every(p => p.in_stock), 'All results should be in stock')
  })

  await test('searchProducts: limit controls result count', async () => {
    const result = searchProducts({ limit: 2 })
    assert(result.products.length <= 2, 'Should return at most 2 products')
    assert(result.limit === 2, 'Limit should be 2')
  })

  await test('searchProducts: offset skips results for pagination', async () => {
    const page1 = searchProducts({ limit: 2, offset: 0 })
    const page2 = searchProducts({ limit: 2, offset: 2 })
    if (page1.products.length > 0 && page2.products.length > 0) {
      assert(page1.products[0].id !== page2.products[0].id, 'Pages should have different products')
    }
  })

  await test('findProductById: returns correct product', async () => {
    const product = findProductById('prod_suitcase_carryon')
    assert(product !== null, 'Should find the product')
    assert(product.id === 'prod_suitcase_carryon', 'Should return correct product')
    assert(product.price === 26550, 'Price should be 26550 cents')
  })

  await test('findProductById: returns null for unknown id', async () => {
    const product = findProductById('prod_doesnotexist')
    assert(product === null, 'Should return null for unknown product')
  })

  await test('isCatalogActive: true when catalog in caps', async () => {
    const caps = { 'dev.ucp.shopping.catalog': [{ version:'2026-04-08' }] }
    assert(isCatalogActive(caps) === true)
  })

  await test('isCatalogActive: false when catalog not in caps', async () => {
    const caps = { 'dev.ucp.shopping.checkout': [{ version:'2026-04-08' }] }
    assert(isCatalogActive(caps) === false)
  })

  console.log('\n  Integration tests — HTTP endpoints\n')

  await test('GET /catalog/search returns 200 with products', async () => {
    const res = await request('GET', '/ucp/v1/catalog/search')
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(Array.isArray(res.body.products), 'Should return products array')
    assert(res.body.pagination, 'Should have pagination info')
  })

  await test('GET /catalog/search?q=suitcase finds luggage', async () => {
    const res = await request('GET', '/ucp/v1/catalog/search?q=suitcase')
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.products.length >= 2, 'Should find suitcases')
  })

  await test('GET /catalog/search?in_stock=true excludes out-of-stock', async () => {
    const res = await request('GET', '/ucp/v1/catalog/search?in_stock=true')
    assert(res.body.products.every(p => p.in_stock), 'All products should be in stock')
  })

  await test('GET /catalog/search?category=accessories filters correctly', async () => {
    const res = await request('GET', '/ucp/v1/catalog/search?category=accessories')
    assert(res.body.products.every(p => p.category === 'accessories'), 'All should be accessories')
  })

  await test('GET /catalog/products/:id returns product with checkout_hint', async () => {
    const res = await request('GET', '/ucp/v1/catalog/products/prod_suitcase_carryon')
    assert(res.status === 200, `Expected 200 got ${res.status}`)
    assert(res.body.product.id === 'prod_suitcase_carryon', 'Should return correct product')
    assert(res.body.checkout_hint?.line_item, 'Should include checkout_hint with line_item')
    assert(res.body.checkout_hint.line_item.item.price === 26550, 'Price should be 26550')
  })

  await test('GET /catalog/products/:id returns 404 for unknown product', async () => {
    const res = await request('GET', '/ucp/v1/catalog/products/prod_fake')
    assert(res.status === 404, `Expected 404 got ${res.status}`)
  })

  await test('out-of-stock product has buyable: false', async () => {
    const res = await request('GET', '/ucp/v1/catalog/products/prod_luggage_scale')
    assert(res.body.product.buyable === false, 'Out-of-stock product should not be buyable')
    assert(res.body.checkout_hint?.description?.includes('out of stock'), 'Hint should mention out of stock')
  })

  await test('response always includes ucp.capabilities', async () => {
    const res = await request('GET', '/ucp/v1/catalog/search')
    assert(res.body.ucp?.capabilities !== undefined, 'Must include ucp.capabilities')
  })

  await test('merchant profile now declares catalog capability', async () => {
    const res = await request('GET', '/.well-known/ucp')
    const caps = res.body.ucp?.capabilities
    assert(caps?.['dev.ucp.shopping.catalog'], 'Catalog must be in merchant profile')
  })

  console.log('')
  console.log('  ─────────────────────────────────')
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log('  ─────────────────────────────────')
  if (failed > 0) { process.exit(1) }
  else { console.log('  All tests pass. Day 9 complete.\n  Ready for Day 10: OAuth identity linking') }
  console.log('')
  process.exit(0)
}

setTimeout(runTests, 800)
