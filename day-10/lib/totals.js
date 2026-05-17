// lib/totals.js
//
// ─── THE RECEIPT PRINTER ANALOGY ──────────────────────────
// The receipt printer prints the full breakdown.
//
// Day 8 update: discount now appears as a line item.
// The receipt now shows:
//   Subtotal:   $265.50
//   Discount:  -$26.55  ← NEW (negative = money off)
//   Tax:        $23.90  ← calculated on DISCOUNTED subtotal
//   Shipping:    $0.00
//   ─────────────────
//   Total:     $262.85
//
// Order matters:
//   1. Subtract discount from subtotal first
//   2. Calculate tax on the REDUCED amount
//   3. Add shipping
//   4. Sum everything for the total
// ───────────────────────────────────────────────────────────

const TAX_RATE = 0.10

function calculateTotals(checkout) {
  const totals = []

  // ── Subtotal ───────────────────────────────
  // Sum of all line items: price × quantity
  const subtotal = checkout.line_items.reduce((sum, li) => {
    return sum + (li.item.price * li.quantity)
  }, 0)
  totals.push({ type:'subtotal', amount:subtotal })

  // ── Discount ───────────────────────────────
  // NEW in Day 8.
  // If a valid discount code has been applied,
  // show it as a NEGATIVE amount (money coming off).
  // Stored in checkout.appliedDiscount by the PATCH route.
  let discountAmount = 0
  if (checkout.appliedDiscount) {
    discountAmount = checkout.appliedDiscount.amount
    totals.push({
      type:   'discount',
      amount: -discountAmount,   // ← negative = reduction
      code:   checkout.appliedDiscount.discount.code,
      description: checkout.appliedDiscount.discount.description
    })
  }

  // ── Tax ────────────────────────────────────
  // Calculated on the DISCOUNTED subtotal.
  // Why? Tax is on the actual amount you pay for goods.
  // If goods cost $239 after discount, tax is on $239.
  // Not on the original $265 price.
  const taxableAmount = subtotal - discountAmount
  const tax = Math.round(taxableAmount * TAX_RATE)
  totals.push({ type:'tax', amount:tax })

  // ── Shipping ───────────────────────────────
  const shippingCost = checkout.selectedShipping?.cost ?? 0
  totals.push({ type:'shipping', amount:shippingCost })

  // ── Total ──────────────────────────────────
  // subtotal - discount + tax + shipping
  // = taxableAmount + tax + shipping
  const total = taxableAmount + tax + shippingCost
  totals.push({ type:'total', amount:total })

  return totals
}

module.exports = { calculateTotals }
