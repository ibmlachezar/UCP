// lib/discount.js
//
// ─── THE COUPON ANALOGY ────────────────────────────────────
// You show your loyalty card at the bar (discount code).
// Bartender checks it's real. If valid: money off the bill.
// If invalid: tells you exactly why.
//
// Multi-parent extends:
//   discount extends ["checkout", "cart"]
//   Survives if AT LEAST ONE parent is active.
//   checkout active → discount activates. Done.
// ───────────────────────────────────────────────────────────

const DISCOUNT_CODES = {
  'SAVE10': { code:'SAVE10', description:'10% off your order', type:'percentage', value:10, active:true },
  'SAVE20': { code:'SAVE20', description:'20% off your order', type:'percentage', value:20, active:true },
  'FIXED5': { code:'FIXED5', description:'$5.00 off your order', type:'fixed', value:500, active:true },
  'EXPIRED':{ code:'EXPIRED', description:'Old promotion', type:'percentage', value:15, active:false }
}

// ─────────────────────────────────────────────
// validateDiscountCode
// The bartender checks the loyalty card.
// Returns { valid, discount } or { valid, error }
// ─────────────────────────────────────────────
function validateDiscountCode(code) {
  if (!code || typeof code !== 'string') {
    return { valid:false, error:{ code:'invalid_code', message:'Discount code is required' }}
  }

  // Case-insensitive — SAVE10 and save10 both work
  const discount = DISCOUNT_CODES[code.toUpperCase()]

  if (!discount) {
    return { valid:false, error:{ code:'code_not_found', message:`Discount code '${code}' does not exist` }}
  }

  if (!discount.active) {
    return { valid:false, error:{ code:'code_expired', message:`Discount code '${code}' is no longer active` }}
  }

  return { valid:true, discount }
}

// ─────────────────────────────────────────────
// calculateDiscountAmount
// How many cents come off the subtotal?
//
// percentage: 10% of 26550 = 2655 cents
// fixed:      500 cents = $5.00 off
// ─────────────────────────────────────────────
function calculateDiscountAmount(discount, subtotal) {
  if (discount.type === 'percentage') {
    return Math.round(subtotal * (discount.value / 100))
  }
  if (discount.type === 'fixed') {
    // Can't discount more than the subtotal
    return Math.min(discount.value, subtotal)
  }
  return 0
}

// ─────────────────────────────────────────────
// isDiscountActive
// Multi-parent OR rule:
// active if checkout OR cart is in the negotiated set
// ─────────────────────────────────────────────
function isDiscountActive(activeCaps) {
  return !!activeCaps['dev.ucp.shopping.checkout'] ||
         !!activeCaps['dev.ucp.shopping.cart']
}

// ─────────────────────────────────────────────
// buildDiscountResponse
// What goes in the discount section of the response
// ─────────────────────────────────────────────
function buildDiscountResponse(checkout) {
  if (!checkout.appliedDiscount) {
    return { applied:null, accepts_codes:true }
  }
  const { discount, amount } = checkout.appliedDiscount
  return {
    applied: {
      code:        discount.code,
      description: discount.description,
      type:        discount.type,
      value:       discount.value,
      savings:     amount
    },
    accepts_codes: true
  }
}

// ─────────────────────────────────────────────
// applyDiscountToCheckout
// Called by the PATCH route when agent sends a code.
// Validates the code and stores it on the checkout.
// Returns { success, message }
// ─────────────────────────────────────────────
function applyDiscountToCheckout(checkout, codes) {
  if (!codes || codes.length === 0) {
    return { success:false, message:'No discount codes provided' }
  }

  // UCP supports multiple codes but we apply the first valid one
  const code = codes[0]
  const { valid, discount, error } = validateDiscountCode(code)

  if (!valid) {
    // Clear any previously applied discount
    checkout.appliedDiscount = null
    return { success:false, message:error.message }
  }

  // Calculate how much comes off
  const subtotal = checkout.line_items.reduce(
    (sum, li) => sum + (li.item.price * li.quantity), 0
  )
  const amount = calculateDiscountAmount(discount, subtotal)

  // Store on checkout — totals.js reads this
  checkout.appliedDiscount = { discount, amount }

  return { success:true }
}

module.exports = {
  validateDiscountCode,
  calculateDiscountAmount,
  applyDiscountToCheckout,
  isDiscountActive,
  buildDiscountResponse,
  DISCOUNT_CODES
}
