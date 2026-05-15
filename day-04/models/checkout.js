// models/checkout.js
//
// This file is the "memory" of your checkout system.
// It stores all checkout sessions and knows how to
// create new ones and find existing ones.
//
// Think of it like a filing cabinet:
//   - Every checkout gets a folder (the checkout object)
//   - Every folder has a unique ID on the tab
//   - You can add a new folder (create)
//   - You can find an existing folder by ID (findById)
// ─────────────────────────────────────────────────────

// In-memory store — a Map where:
//   key   = checkout ID (e.g. "chk_abc123")
//   value = the full checkout object
//
// In production this would be a database (Postgres, MongoDB).
// For learning, in-memory is perfect — simple and fast.
const checkouts = new Map()

// ─────────────────────────────────────────────
// Create a new checkout session
//
// Parameters:
//   lineItems    - array of items the agent wants to buy
//   activeCaps   - the negotiated capabilities for this session
//   merchantProfile - the full merchant profile
//
// Returns: the newly created checkout object
// ─────────────────────────────────────────────
function createCheckout(lineItems, activeCaps, merchantProfile) {

  // Generate a unique ID for this checkout.
  // "chk_" prefix makes it obvious what kind of ID this is.
  // Math.random().toString(36) converts a random number to
  // base-36 (letters + numbers), giving us a short random string.
  const id = 'chk_' + Math.random().toString(36).slice(2, 10)

  // Calculate the subtotal.
  // Every item has a price (in cents) and a quantity.
  // reduce() loops through all items, adding price × quantity each time.
  // Start value is 0 (the second argument to reduce).
  //
  // Example: Suitcase $265.50 (26550 cents) × 1 = 26550
  const subtotal = lineItems.reduce((sum, lineItem) => {
    return sum + (lineItem.item.price * lineItem.quantity)
  }, 0)

  // Build the checkout object.
  // This is exactly what gets stored AND what gets returned to the agent.
  const checkout = {
    // The unique ID — agent uses this in every subsequent request
    id,

    // Status machine — starts at 'incomplete'
    // incomplete       = missing required info (address, fulfillment)
    // ready_for_complete = all info present, ready to pay
    // completed        = payment taken, order created
    // requires_escalation = needs 3DS or other challenge
    status: 'incomplete',

    // The items being purchased — stored exactly as received
    line_items: lineItems,

    // Totals array — always an array of objects, never a single number.
    // Why an array? Because totals grow:
    //   subtotal → + tax → + shipping → + discount → = total
    // Each step adds a new entry. Today we only have subtotal.
    totals: [
      {
        type: 'subtotal',
        amount: subtotal   // in cents — $265.50 = 26550
      }
    ],

    // Payment handlers — copied from the merchant profile.
    // These tell the agent HOW to pay.
    // The agent takes this, calls the payment provider directly
    // (e.g. Google Pay), gets an encrypted token, and sends
    // that token back in the complete request.
    payment: {
      handlers: merchantProfile.ucp.payment_handlers
        ? Object.entries(merchantProfile.ucp.payment_handlers).map(([name, versions]) => ({
            id: versions[0].id,
            name: name,
            version: versions[0].version,
            config: versions[0].config || {}
          }))
        : []
    },

    // The active capabilities for THIS session — result of Day 2 negotiation.
    // Stored so the agent always knows what features are available.
    active_capabilities: activeCaps,

    // Timestamps — useful for expiry, debugging, analytics
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Store in the Map using the ID as the key
  checkouts.set(id, checkout)

  return checkout
}

// ─────────────────────────────────────────────
// Find an existing checkout by ID
//
// Returns the checkout object, or null if not found.
// Used by PATCH and complete endpoints (Days 4 and 6).
// ─────────────────────────────────────────────
function findById(id) {
  return checkouts.get(id) || null
}

// ─────────────────────────────────────────────
// Update an existing checkout
// Saves changes back to the Map.
// ─────────────────────────────────────────────
function save(checkout) {
  checkout.updated_at = new Date().toISOString()
  checkouts.set(checkout.id, checkout)
  return checkout
}

// Export the functions so other files can use them
module.exports = { createCheckout, findById, save }
