// lib/totals.js
//
// Recalculates the totals array whenever a checkout changes.
// Called after every PATCH — address added, shipping selected,
// discount applied (Day 8), etc.
//
// Totals are always an ARRAY of objects, never a single number.
// Why? Because totals grow as the checkout fills in:
//   subtotal → + tax → + shipping → - discount → = total
// Each step adds a new entry. The array captures the full breakdown.
// ─────────────────────────────────────────────────────────────────

const TAX_RATE = 0.10 // 10% tax — simplified for learning

// ─────────────────────────────────────────────
// Calculate all totals for a checkout
//
// Parameters:
//   checkout - the full checkout object
//
// Returns: array of total objects, e.g:
//   [
//     { type: 'subtotal', amount: 26550 },
//     { type: 'tax',      amount: 2655  },
//     { type: 'shipping', amount: 0     },
//     { type: 'total',    amount: 29205 }
//   ]
// ─────────────────────────────────────────────
function calculateTotals(checkout) {
  const totals = []

  // ── Subtotal ───────────────────────────────
  // Sum of all line items: price × quantity for each
  const subtotal = checkout.line_items.reduce((sum, li) => {
    return sum + (li.item.price * li.quantity)
  }, 0)
  totals.push({ type: 'subtotal', amount: subtotal })

  // ── Tax ────────────────────────────────────
  // Always applied on subtotal.
  // Math.round() keeps it as an integer (cents).
  // Without rounding: 10% of $26.55 = 2.655 → not valid cents
  const tax = Math.round(subtotal * TAX_RATE)
  totals.push({ type: 'tax', amount: tax })

  // ── Shipping ───────────────────────────────
  // Only added if the agent has selected a shipping method.
  // Until then it's 0 — agent still needs to choose.
  //
  // checkout.selectedShipping is set when the agent
  // sends fulfillment.selected_option_id in the PATCH body.
  const shippingCost = checkout.selectedShipping?.cost ?? 0
  totals.push({ type: 'shipping', amount: shippingCost })

  // ── Total ──────────────────────────────────
  // The final number the agent shows the user before payment.
  // subtotal + tax + shipping (discounts come in Day 8)
  const total = subtotal + tax + shippingCost
  totals.push({ type: 'total', amount: total })

  return totals
}

module.exports = { calculateTotals }
