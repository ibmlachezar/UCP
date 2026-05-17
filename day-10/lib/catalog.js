// lib/catalog.js
//
// ─── THE MENU ANALOGY ─────────────────────────────────────
// Before you open a tab at the bar, you read the menu.
// The menu shows what's available, the prices, descriptions.
// You pick what you want THEN tell the bartender.
//
// This file IS the menu.
// PRODUCTS = every item on the menu
// searchProducts() = the agent browsing the menu
// findProductById() = the agent looking at one item closely
// isCatalogActive() = checking if this bar has a menu
//   (some merchants are direct-order only, no browse)
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────
// The product catalogue — your menu items
//
// In production: fetched from a database, synced
// with inventory, updated in real-time.
// For learning: hardcoded. Easy to understand.
//
// Every product has:
//   id         → unique identifier (used in checkout line_items)
//   title      → what the agent shows the user
//   price      → in CENTS (always integers — no decimals)
//   category   → for filtering searches
//   description → what the agent reads to describe the item
//   in_stock   → false = don't let agent put it in a checkout
//   images     → URLs the agent can show the user
// ─────────────────────────────────────────────
const PRODUCTS = [
  {
    id:          'prod_suitcase_carryon',
    title:       'Carry-On Suitcase',
    price:       26550,   // $265.50
    category:    'luggage',
    description: 'Lightweight 4-wheel spinner. 55cm. Fits most overhead compartments. TSA-approved lock.',
    in_stock:    true,
    inventory:   42,
    images:      ['https://example.com/images/suitcase-carryon.jpg'],
    tags:        ['luggage', 'carry-on', 'travel', 'spinner']
  },
  {
    id:          'prod_suitcase_large',
    title:       'Large Check-In Suitcase',
    price:       38900,   // $389.00
    category:    'luggage',
    description: 'Expandable 4-wheel spinner. 75cm. 110L capacity. Integrated TSA lock.',
    in_stock:    true,
    inventory:   18,
    images:      ['https://example.com/images/suitcase-large.jpg'],
    tags:        ['luggage', 'check-in', 'travel', 'spinner', 'large']
  },
  {
    id:          'prod_backpack_travel',
    title:       'Travel Backpack 40L',
    price:       12900,   // $129.00
    category:    'bags',
    description: 'Water-resistant 40L travel backpack. Fits 15" laptop. USB charging port.',
    in_stock:    true,
    inventory:   95,
    images:      ['https://example.com/images/backpack-travel.jpg'],
    tags:        ['bags', 'backpack', 'travel', 'laptop']
  },
  {
    id:          'prod_packing_cubes',
    title:       'Packing Cube Set (6 pieces)',
    price:       3499,    // $34.99
    category:    'accessories',
    description: 'Lightweight mesh packing cubes. Sizes: 2× large, 2× medium, 2× small.',
    in_stock:    true,
    inventory:   200,
    images:      ['https://example.com/images/packing-cubes.jpg'],
    tags:        ['accessories', 'packing', 'organiser', 'travel']
  },
  {
    id:          'prod_luggage_scale',
    title:       'Digital Luggage Scale',
    price:       1999,    // $19.99
    category:    'accessories',
    description: 'Handheld digital scale. Up to 50kg/110lbs. Avoids overweight luggage fees.',
    in_stock:    false,   // Out of stock — agent should not offer this
    inventory:   0,
    images:      ['https://example.com/images/luggage-scale.jpg'],
    tags:        ['accessories', 'scale', 'weight']
  },
  {
    id:          'prod_travel_pillow',
    title:       'Memory Foam Travel Pillow',
    price:       2499,    // $24.99
    category:    'accessories',
    description: 'Ergonomic U-shaped memory foam pillow. Machine washable cover.',
    in_stock:    true,
    inventory:   150,
    images:      ['https://example.com/images/travel-pillow.jpg'],
    tags:        ['accessories', 'pillow', 'comfort', 'sleep']
  }
]

// ─────────────────────────────────────────────
// searchProducts
//
// The agent browses the menu.
// Supports: keyword search, category filter, in_stock filter
//
// Parameters (all optional):
//   q        → keyword to search in title, description, tags
//   category → filter by category
//   in_stock → true = only show available items
//   limit    → max results to return (default 10, max 50)
//   offset   → for pagination (skip first N results)
//
// Returns: { products, total, limit, offset }
// ─────────────────────────────────────────────
function searchProducts({ q, category, in_stock, limit = 10, offset = 0 } = {}) {
  let results = [...PRODUCTS]

  // ── Keyword search ─────────────────────────
  // Looks in title, description, and tags
  // Case-insensitive — "SUITCASE" and "suitcase" both work
  if (q && q.trim()) {
    const query = q.trim().toLowerCase()
    results = results.filter(p =>
      p.title.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.tags.some(tag => tag.includes(query))
    )
  }

  // ── Category filter ────────────────────────
  if (category) {
    results = results.filter(p =>
      p.category.toLowerCase() === category.toLowerCase()
    )
  }

  // ── Stock filter ───────────────────────────
  // Most agents should filter out-of-stock items
  // by default so they don't offer what can't be bought
  if (in_stock === 'true' || in_stock === true) {
    results = results.filter(p => p.in_stock)
  }

  // Total before pagination (for the agent to show
  // "showing 1-10 of 23 results")
  const total = results.length

  // ── Pagination ─────────────────────────────
  // limit and offset work like SQL: skip offset items,
  // return the next limit items
  const capped = Math.min(parseInt(limit) || 10, 50)
  const skip   = parseInt(offset) || 0
  results = results.slice(skip, skip + capped)

  return { products: results, total, limit: capped, offset: skip }
}

// ─────────────────────────────────────────────
// findProductById
//
// Agent looks at one menu item closely.
// Returns null if the product doesn't exist.
// ─────────────────────────────────────────────
function findProductById(id) {
  return PRODUCTS.find(p => p.id === id) || null
}

// ─────────────────────────────────────────────
// isCatalogActive
//
// Is the catalog capability negotiated for this session?
// Unlike fulfillment, catalog has no parent —
// it's a standalone capability (not an extension).
// ─────────────────────────────────────────────
function isCatalogActive(activeCaps) {
  return !!activeCaps['dev.ucp.shopping.catalog']
}

// ─────────────────────────────────────────────
// formatProduct
//
// Formats a product for the API response.
// Hides internal fields (inventory count).
// Adds a "buyable" flag agents can use.
// ─────────────────────────────────────────────
function formatProduct(product) {
  return {
    id:          product.id,
    title:       product.title,
    price:       product.price,
    category:    product.category,
    description: product.description,
    in_stock:    product.in_stock,
    images:      product.images,
    tags:        product.tags,
    // Tells the agent if this product can be added to a checkout
    buyable:     product.in_stock
  }
}

module.exports = {
  searchProducts,
  findProductById,
  isCatalogActive,
  formatProduct,
  PRODUCTS
}
