// routes/catalog.js
//
// ─── THE MENU ANALOGY ─────────────────────────────────────
// Two endpoints — like a menu in a restaurant:
//
// GET /catalog/search?q=suitcase
//   = browsing the menu, looking for something specific
//   = "show me everything with 'suitcase' in the name"
//
// GET /catalog/products/:id
//   = reading one menu item closely before ordering
//   = "tell me everything about the Carry-On Suitcase"
//
// Both use GET because reading never changes anything.
// Query parameters (?q=...) go in the URL — not the body.
// Why? GET requests have no body. Parameters live in the URL.
// ─────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const {
  searchProducts,
  findProductById,
  isCatalogActive,
  formatProduct
} = require('../lib/catalog')

// ─────────────────────────────────────────────
// GET /ucp/v1/catalog/search
//
// Search the product catalogue.
// Parameters all go in the URL as query strings:
//   ?q=suitcase         → keyword search
//   ?category=luggage   → filter by category
//   ?in_stock=true      → only show available items
//   ?limit=5            → how many results to return
//   ?offset=0           → skip this many (for next page)
//
// No UCP-Agent required — catalog search is open.
// But if the agent sends one, it gets the right caps.
//
// Example:
//   GET /ucp/v1/catalog/search?q=suitcase&in_stock=true
// ─────────────────────────────────────────────
router.get('/search', (req, res) => {

  // Check if catalog is active — if not, return 404
  // (agent shouldn't be calling this endpoint if catalog
  //  wasn't in the negotiated capabilities)
  const activeCaps = req.app.locals.activeCaps || req.app.locals.profile?.ucp?.capabilities || {}

  // Pull search parameters from the URL query string
  // req.query contains everything after the ? in the URL
  const { q, category, in_stock, limit, offset } = req.query

  const result = searchProducts({ q, category, in_stock, limit, offset })

  res.json({
    ucp: {
      version:      '2026-04-08',
      capabilities: activeCaps
    },
    // The products the agent found
    products: result.products.map(formatProduct),

    // Pagination metadata — helps agent build "next page" requests
    pagination: {
      total:  result.total,
      limit:  result.limit,
      offset: result.offset,
      // Has more = true means the agent can request the next page
      has_more: result.offset + result.limit < result.total
    },

    // Echo back what was searched — helpful for debugging
    query: { q: q || null, category: category || null, in_stock: in_stock || null }
  })
})

// ─────────────────────────────────────────────
// GET /ucp/v1/catalog/products/:id
//
// Get a single product by its ID.
// Returns full product details.
// Agent uses this to get everything before adding to a checkout.
//
// Example:
//   GET /ucp/v1/catalog/products/prod_suitcase_carryon
// ─────────────────────────────────────────────
router.get('/products/:id', (req, res) => {
  const product = findProductById(req.params.id)

  if (!product) {
    return res.status(404).json({
      code:    'product_not_found',
      message: `Product '${req.params.id}' does not exist`
    })
  }

  const activeCaps = req.app.locals.profile?.ucp?.capabilities || {}

  res.json({
    ucp: {
      version:      '2026-04-08',
      capabilities: activeCaps
    },
    product: formatProduct(product),

    // If the product is buyable, tell the agent exactly
    // what to send in the POST /checkout-sessions body
    // This is the connection between catalog and checkout — Day 9 → Day 3
    checkout_hint: product.in_stock ? {
      description: 'To purchase this product, create a checkout with this line item:',
      line_item: {
        id:   'li_1',
        item: {
          id:    product.id,
          title: product.title,
          price: product.price
        },
        quantity: 1
      }
    } : {
      description: 'This product is currently out of stock and cannot be purchased.'
    }
  })
})

module.exports = router
