// lib/validate.js
//
// UCP validation — returns a messages array, NOT HTTP errors.
//
// This is the most important design difference between UCP and
// typical REST APIs. Instead of rejecting partial updates with
// 400 errors, UCP accepts them and returns structured messages
// explaining what is still needed.
//
// Why? Because agents fill in checkouts incrementally:
//   - First PATCH: just the email
//   - Second PATCH: adds the shipping address
//   - Third PATCH: selects a shipping method
//
// Rejecting the first two with 400s would force agents to collect
// ALL information before making any update — a poor UX for
// conversational AI agents.
//
// Message types:
//   "error" → blocking. Checkout cannot complete until resolved.
//   "info"  → advisory. Non-blocking. Just helpful context.
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────
// Available shipping methods
// Day 5 moves this into the fulfillment extension.
// For now, hardcoded here.
// ─────────────────────────────────────────────
const SHIPPING_METHODS = [
  { id: 'free',    title: 'Free Standard Shipping', cost: 0,   eta: '5-7 business days' },
  { id: 'express', title: 'Express 2-Day Shipping',  cost: 999, eta: '2 business days'   }
]

// ─────────────────────────────────────────────
// Validate a checkout and return:
//   messages     - array of error/info messages
//   isComplete   - true if all required fields are present
//   selectedShipping - the shipping method object if selected
// ─────────────────────────────────────────────
function validateCheckout(checkout) {
  const messages = []

  // ── Required: buyer email ──────────────────
  // Without email, the merchant can't send an order confirmation.
  // The path field uses JSONPath syntax to pinpoint exactly
  // which field is missing — agents parse this to know what to ask for.
  if (!checkout.buyer?.email) {
    messages.push({
      type: 'error',
      code: 'required',
      path: '$.buyer.email',
      content: 'Email address is required to proceed'
    })
  } else if (!isValidEmail(checkout.buyer.email)) {
    messages.push({
      type: 'error',
      code: 'invalid_format',
      path: '$.buyer.email',
      content: 'Email address format is invalid'
    })
  }

  // ── Required: buyer name ───────────────────
  if (!checkout.buyer?.first_name) {
    messages.push({
      type: 'error',
      code: 'required',
      path: '$.buyer.first_name',
      content: 'First name is required'
    })
  }

  if (!checkout.buyer?.last_name) {
    messages.push({
      type: 'error',
      code: 'required',
      path: '$.buyer.last_name',
      content: 'Last name is required'
    })
  }

  // ── Required: shipping address ─────────────
  const addr = checkout.shippingAddress
  if (!addr) {
    messages.push({
      type: 'error',
      code: 'required',
      path: '$.fulfillment.destinations[0]',
      content: 'A shipping address is required'
    })
  } else {
    // If address is present, validate each required field
    if (!addr.street_address) {
      messages.push({
        type: 'error',
        code: 'required',
        path: '$.fulfillment.destinations[0].street_address',
        content: 'Street address is required'
      })
    }
    if (!addr.city) {
      messages.push({
        type: 'error',
        code: 'required',
        path: '$.fulfillment.destinations[0].city',
        content: 'City is required'
      })
    }
    if (!addr.postal_code) {
      messages.push({
        type: 'error',
        code: 'required',
        path: '$.fulfillment.destinations[0].postal_code',
        content: 'Postal code is required'
      })
    }
    if (!addr.country_code) {
      messages.push({
        type: 'error',
        code: 'required',
        path: '$.fulfillment.destinations[0].country_code',
        content: 'Country code is required (e.g. US, GB, CA)'
      })
    }
  }

  // ── Required: shipping method selection ────
  // The agent must pick one of the available shipping methods.
  // Until they do, we can't calculate the shipping cost or total.
  let selectedShipping = null
  if (!checkout.selectedShipping) {
    messages.push({
      type: 'error',
      code: 'required',
      path: '$.fulfillment.selected_option_id',
      content: 'A shipping method must be selected',
      // Include available options so agent knows what to send
      options: SHIPPING_METHODS.map(m => ({ id: m.id, title: m.title }))
    })
  } else {
    selectedShipping = checkout.selectedShipping
  }

  // ── Advisory: fraud signal ─────────────────
  // Type "info" = advisory only. Does NOT block completion.
  // The merchant is saying "we'd like this for fraud scoring"
  // but will still process the order without it.
  if (!checkout.signals?.buyer_ip) {
    messages.push({
      type: 'info',
      code: 'signal',
      path: "$.signals['dev.ucp.buyer_ip']",
      content: 'Providing buyer IP improves fraud detection accuracy'
    })
  }

  // ── Is the checkout complete? ──────────────
  // Complete = no blocking errors (type: "error" messages)
  const blockingErrors = messages.filter(m => m.type === 'error')
  const isComplete = blockingErrors.length === 0

  return { messages, isComplete, selectedShipping }
}

// ─────────────────────────────────────────────
// Simple email format check
// Not exhaustive — just catches obvious mistakes
// ─────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

module.exports = { validateCheckout, SHIPPING_METHODS }
