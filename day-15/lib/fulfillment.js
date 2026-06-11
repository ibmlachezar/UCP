// lib/fulfillment.js
//
// Day 5: The Fulfillment Extension
//
// What changed from Day 4:
//   Day 4: shipping methods were hardcoded in validate.js
//          and always appeared in responses regardless of
//          whether the agent supported fulfillment
//
//   Day 5: shipping methods are a REAL UCP capability
//          dev.ucp.shopping.fulfillment
//          They ONLY appear if both merchant AND platform
//          declared this capability in their profiles
//
// This is the "extends" model working for real.
// fulfillment extends checkout — meaning:
//   1. Both sides must declare fulfillment
//   2. checkout must also survive negotiation
//   3. Only then do shipping options appear
//
// If either condition fails, the fulfillment field
// is completely absent from the response.
// The agent simply doesn't see shipping options.
// ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────
// The shipping methods this merchant offers.
//
// In a real merchant server, these would come
// from a shipping provider API (FedEx, UPS, etc.)
// based on the buyer's address and cart weight.
//
// For learning: two simple hardcoded options.
// ─────────────────────────────────────────────
const SHIPPING_METHODS = [
  {
    id:    'free',
    title: 'Free Standard Shipping',
    cost:  0,      // cents — $0.00
    eta:   '5-7 business days'
  },
  {
    id:    'express',
    title: 'Express 2-Day Shipping',
    cost:  999,    // cents — $9.99
    eta:   '2 business days'
  }
]

// ─────────────────────────────────────────────
// buildFulfillmentResponse
//
// Builds the fulfillment section for checkout responses.
// Only called when fulfillment is in the active caps.
//
// Returns an object showing:
//   - available shipping methods
//   - which one is currently selected
//   - the destination address (if provided)
// ─────────────────────────────────────────────
function buildFulfillmentResponse(checkout) {
  return {
    // All available shipping options
    // Agent shows these to the user to pick from
    available_methods: SHIPPING_METHODS.map(m => ({
      id:    m.id,
      title: m.title,
      cost:  m.cost,
      eta:   m.eta,
      // Show what this would add to the total
      totals: [{ type: 'shipping', amount: m.cost }]
    })),

    // Which method the agent currently has selected
    // null = agent hasn't chosen yet
    selected_option_id: checkout.selectedShipping?.id || null,

    // Destination addresses
    // Empty array until agent provides a shipping address
    destinations: checkout.shippingAddress
      ? [checkout.shippingAddress]
      : []
  }
}

// ─────────────────────────────────────────────
// applyFulfillmentUpdate
//
// Called when an agent sends fulfillment data
// in a PATCH request. Handles:
//   - New shipping address
//   - Shipping method selection
//
// Returns: { selectedShipping, error }
// error is set if the agent picked an invalid method
// ─────────────────────────────────────────────
function applyFulfillmentUpdate(checkout, fulfillmentBody) {
  let selectedShipping = checkout.selectedShipping || null
  let error = null

  // Handle shipping address update
  if (fulfillmentBody.destinations?.[0]) {
    checkout.shippingAddress = {
      ...checkout.shippingAddress,
      ...fulfillmentBody.destinations[0]
    }
  }

  // Handle shipping method selection
  if (fulfillmentBody.selected_option_id) {
    const method = SHIPPING_METHODS.find(
      m => m.id === fulfillmentBody.selected_option_id
    )

    if (!method) {
      // Agent sent an ID we don't recognise
      error = {
        code: 'invalid_shipping_method',
        message: `Shipping method '${fulfillmentBody.selected_option_id}' does not exist`,
        available: SHIPPING_METHODS.map(m => ({ id: m.id, title: m.title }))
      }
    } else {
      selectedShipping = method
      checkout.selectedShipping = method
    }
  }

  return { selectedShipping, error }
}

// ─────────────────────────────────────────────
// isFulfillmentActive
//
// Checks if the fulfillment extension is active
// in the current session's capability set.
//
// This is the key Day 5 check — it's what makes
// fulfillment conditional on negotiation.
// ─────────────────────────────────────────────
function isFulfillmentActive(activeCaps) {
  return !!activeCaps['dev.ucp.shopping.fulfillment']
}

// ─────────────────────────────────────────────
// getFulfillmentValidationMessages
//
// Returns validation messages for fulfillment-
// related required fields.
//
// Only called when fulfillment IS active.
// If fulfillment is not in the negotiated caps,
// we don't ask for shipping info at all.
// ─────────────────────────────────────────────
function getFulfillmentValidationMessages(checkout) {
  const messages = []

  // Shipping address required when fulfillment is active
  const addr = checkout.shippingAddress
  if (!addr) {
    messages.push({
      type: 'error',
      code: 'required',
      path: '$.fulfillment.destinations[0]',
      content: 'A shipping address is required'
    })
  } else {
    if (!addr.street_address) messages.push({
      type: 'error', code: 'required',
      path: '$.fulfillment.destinations[0].street_address',
      content: 'Street address is required'
    })
    if (!addr.city) messages.push({
      type: 'error', code: 'required',
      path: '$.fulfillment.destinations[0].city',
      content: 'City is required'
    })
    if (!addr.postal_code) messages.push({
      type: 'error', code: 'required',
      path: '$.fulfillment.destinations[0].postal_code',
      content: 'Postal code is required'
    })
    if (!addr.country_code) messages.push({
      type: 'error', code: 'required',
      path: '$.fulfillment.destinations[0].country_code',
      content: 'Country code is required (e.g. US, GB, CA)'
    })
  }

  // Shipping method selection required
  if (!checkout.selectedShipping) {
    messages.push({
      type: 'error',
      code: 'required',
      path: '$.fulfillment.selected_option_id',
      content: 'A shipping method must be selected',
      options: SHIPPING_METHODS.map(m => ({ id: m.id, title: m.title }))
    })
  }

  return messages
}

module.exports = {
  SHIPPING_METHODS,
  buildFulfillmentResponse,
  applyFulfillmentUpdate,
  isFulfillmentActive,
  getFulfillmentValidationMessages
}
