// models/order.js
//
// ─── BAR TAB ANALOGY ───────────────────────────────────────
// When you close your bar tab, the bartender tears off
// a paper receipt and files it in the till drawer.
// That receipt is the ORDER. It proves the transaction
// happened. The tab is now closed.
//
// This file IS the till drawer.
// orders Map = the drawer full of receipts.
// createOrder() = tear off the receipt and file it.
// findOrderById() = look up a past receipt.
// ───────────────────────────────────────────────────────────

// In-memory store — like the tab board behind the bar.
// Key   = order ID  (e.g. "order_abc123")
// Value = full order object (the receipt)
const orders = new Map()

// ─────────────────────────────────────────────
// createOrder — tear off the receipt and file it
//
// Called when a checkout completes successfully.
// Takes the checkout, creates an order record,
// stores it, and returns it to the caller.
// ─────────────────────────────────────────────
function createOrder(checkout) {

  // Generate a unique order ID.
  // "order_" prefix makes it clear what type of ID this is.
  // Just like a receipt number printed at the top.
  const id = 'order_' + Math.random().toString(36).slice(2, 10)

  // The order object — everything on the receipt.
  // Who bought what, how much, when, what method.
  const order = {
    id,

    // Link back to the checkout — the tab number
    checkout_id: checkout.id,

    // Who bought it
    buyer: checkout.buyer,

    // What they bought
    line_items: checkout.line_items,

    // What they paid
    totals: checkout.totals,

    // Where to ship it
    shipping_address: checkout.shippingAddress || null,

    // Which shipping method they chose
    shipping_method: checkout.selectedShipping || null,

    // Order status — starts as 'processing'
    // Day 11 you add webhooks that push updates:
    //   processing → shipped → delivered
    status: 'processing',

    // Timestamps
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // File the receipt in the till drawer
  orders.set(id, order)

  return order
}

// ─────────────────────────────────────────────
// findOrderById — look up a past receipt
// ─────────────────────────────────────────────
function findOrderById(id) {
  return orders.get(id) || null
}

module.exports = { createOrder, findOrderById }
