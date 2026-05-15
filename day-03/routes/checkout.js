// routes/checkout.js
//
// The most important endpoint in UCP.
// Every purchase starts here.
//
// What happens when an agent POSTs here:
//   1. Validate the request has line_items
//   2. Run capability negotiation (Day 2)
//   3. Create a new checkout session
//   4. Return the checkout with status: incomplete
// ─────────────────────────────────────────────────────

const express = require('express')
const router = express.Router()
const { negotiate } = require('../lib/negotiation')
const { createCheckout, findById } = require('../models/checkout')

// ─────────────────────────────────────────────
// POST /ucp/v1/checkout-sessions
//
// Creates a new checkout session.
//
// Request body the agent sends:
// {
//   "line_items": [
//     {
//       "id": "li_1",
//       "item": {
//         "id": "prod_abc",
//         "title": "Carry-On Suitcase",
//         "price": 26550        ← cents! $265.50
//       },
//       "quantity": 1
//     }
//   ]
// }
//
// Response the server sends back:
// {
//   "ucp": { "version": "...", "capabilities": {...} },
//   "id": "chk_abc123",
//   "status": "incomplete",
//   "line_items": [...],
//   "totals": [{ "type": "subtotal", "amount": 26550 }],
//   "payment": { "handlers": [...] }
// }
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {

  // ── Step 1: Validate the request ──────────────────
  //
  // line_items is required. Without it, we have no idea
  // what the agent wants to buy.
  //
  // We return 400 Bad Request when the CLIENT sent something wrong.
  // (As opposed to 500 which means WE crashed.)
  const { line_items } = req.body

  if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({
      code: 'invalid_request',
      message: 'line_items is required and must be a non-empty array',
      // UCP convention: tell the agent exactly which field is wrong
      // and where it should be in the request
      path: '$.line_items'
    })
  }

  // Validate each line item has the required fields
  for (const item of line_items) {
    if (!item.item?.id || !item.item?.price || !item.quantity) {
      return res.status(400).json({
        code: 'invalid_line_item',
        message: 'Each line_item must have item.id, item.price, and quantity',
        path: '$.line_items[]'
      })
    }

    // Price must be a positive integer (cents)
    if (!Number.isInteger(item.item.price) || item.item.price <= 0) {
      return res.status(400).json({
        code: 'invalid_price',
        message: 'item.price must be a positive integer in minor units (cents)',
        path: '$.line_items[].item.price'
      })
    }
  }

  // ── Step 2: Run capability negotiation ────────────
  //
  // Every endpoint runs negotiation — not just the discovery endpoint.
  // The active capabilities change depending on WHICH agent is calling.
  // This is why req (the request) is passed in — it has the UCP-Agent header.
  let activeCaps = {}
  try {
    const result = await negotiate(req, req.app.locals.profile)
    activeCaps = result.activeCaps
  } catch (err) {
    // Negotiation failing is not fatal — we continue with empty caps
    // This is the "graceful degradation" principle of UCP
    console.error('Negotiation error:', err.message)
  }

  // ── Step 3: Create the checkout ───────────────────
  //
  // createCheckout() handles the ID generation,
  // subtotal calculation, and storing in memory
  const checkout = createCheckout(
    line_items,
    activeCaps,
    req.app.locals.profile   // full merchant profile (for payment handlers)
  )

  // ── Step 4: Send the response ─────────────────────
  //
  // 201 Created — something NEW was made.
  // (Not 200 OK — that's for reads and updates)
  //
  // The response has two main sections:
  //   - ucp: protocol metadata (version + active capabilities)
  //   - everything else: the checkout data itself
  res.status(201).json({

    // ucp field — ALWAYS included in every UCP response.
    // Tells the agent what protocol version and capabilities
    // are active for this session.
    ucp: {
      version: '2026-04-08',
      capabilities: activeCaps
    },

    // The checkout data
    id:         checkout.id,
    status:     checkout.status,       // 'incomplete' — always starts here
    line_items: checkout.line_items,
    totals:     checkout.totals,       // [{ type: 'subtotal', amount: 26550 }]
    payment:    checkout.payment,      // handlers the agent can use to pay
    created_at: checkout.created_at,

    // Helpful hint — tells agent what to do next
    // Day 4 (PATCH) will use this ID
    next_steps: {
      update: `PATCH /ucp/v1/checkout-sessions/${checkout.id}`,
      hint:   'Add buyer info and shipping address to move to ready_for_complete'
    }
  })
})

// ─────────────────────────────────────────────
// GET /ucp/v1/checkout-sessions/:id
//
// Retrieve an existing checkout by ID.
// Agents use this to check the current state.
// ─────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const checkout = findById(req.params.id)

  // 404 Not Found — the ID doesn't exist in our store
  if (!checkout) {
    return res.status(404).json({
      code: 'not_found',
      message: `Checkout ${req.params.id} does not exist`
    })
  }

  res.json({
    ucp: {
      version: '2026-04-08',
      capabilities: checkout.active_capabilities
    },
    id:         checkout.id,
    status:     checkout.status,
    line_items: checkout.line_items,
    totals:     checkout.totals,
    payment:    checkout.payment,
    created_at: checkout.created_at,
    updated_at: checkout.updated_at
  })
})

module.exports = router
