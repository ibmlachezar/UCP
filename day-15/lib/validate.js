// lib/validate.js
//
// Day 5 update: fulfillment validation is now conditional.
//
// Key change from Day 4:
//   Day 4: always asked for shipping address + method
//   Day 5: only asks for shipping if fulfillment capability
//          is active in this session's negotiation
//
// Why this matters:
//   An agent without fulfillment support can still complete
//   a checkout. Shipping is handled separately by the merchant.
// ─────────────────────────────────────────────────────

const {
  getFulfillmentValidationMessages,
  isFulfillmentActive
} = require('./fulfillment')

function validateCheckout(checkout, activeCaps = {}) {
  const messages = []

  // ── Always required: buyer info ────────────
  if (!checkout.buyer?.email) {
    messages.push({
      type: 'error', code: 'required',
      path: '$.buyer.email',
      content: 'Email address is required to proceed'
    })
  } else if (!isValidEmail(checkout.buyer.email)) {
    messages.push({
      type: 'error', code: 'invalid_format',
      path: '$.buyer.email',
      content: 'Email address format is invalid'
    })
  }

  if (!checkout.buyer?.first_name) {
    messages.push({
      type: 'error', code: 'required',
      path: '$.buyer.first_name',
      content: 'First name is required'
    })
  }

  if (!checkout.buyer?.last_name) {
    messages.push({
      type: 'error', code: 'required',
      path: '$.buyer.last_name',
      content: 'Last name is required'
    })
  }

  // ── Conditional: fulfillment fields ────────
  // KEY DAY 5 CHANGE: only validate shipping
  // if fulfillment extension is active in this session
  if (isFulfillmentActive(activeCaps)) {
    const fulfillmentMessages = getFulfillmentValidationMessages(checkout)
    messages.push(...fulfillmentMessages)
  }

  // ── Advisory: fraud signal ─────────────────
  if (!checkout.signals?.buyer_ip) {
    messages.push({
      type: 'info', code: 'signal',
      path: "$.signals['dev.ucp.buyer_ip']",
      content: 'Providing buyer IP improves fraud detection accuracy'
    })
  }

  const blockingErrors = messages.filter(m => m.type === 'error')
  const isComplete = blockingErrors.length === 0

  return { messages, isComplete }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

module.exports = { validateCheckout }
