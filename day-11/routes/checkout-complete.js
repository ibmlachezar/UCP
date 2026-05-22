// routes/checkout-complete.js
//
// ─── BAR TAB ANALOGY ───────────────────────────────────────
// This is the moment you close your tab and pay.
//
// You tap your card on the reader (payment token arrives).
// The bartender checks it's a card they accept — Visa,
// Mastercard — not a library card (handler_id validation).
// The card reader talks to your bank (Google Pay / PSP).
// Your bank sends back an encrypted approval code (token).
// The bar gets "approved" — not your card number.
// Tab closes. Receipt printed. Order created. Done.
//
// POST /ucp/v1/checkout-sessions/:id/complete
// ───────────────────────────────────────────────────────────

const express = require('express')
const router = express.Router()
const { findById, save } = require('../models/checkout')
const { createOrder } = require('../models/order')

// ─────────────────────────────────────────────
// POST /ucp/v1/checkout-sessions/:id/complete
//
// What the agent sends:
// {
//   "payment": {
//     "instruments": [{
//       "handler_id": "gpay_handler_1",   ← which payment method
//       "type": "card",
//       "credential": {
//         "type": "PAYMENT_GATEWAY",
//         "token": "tok_abc123"            ← encrypted token from Google Pay
//       }
//     }]
//   },
//   "signals": {
//     "dev.ucp.buyer_ip": "1.2.3.4"      ← fraud signal
//   }
// }
// ─────────────────────────────────────────────
router.post('/:id/complete', async (req, res) => {

  // ── Step 1: Find the tab ────────────────────
  // The bartender looks up your tab number.
  // If the tab doesn't exist: 404.
  const checkout = findById(req.params.id)
  if (!checkout) {
    return res.status(404).json({
      code:    'not_found',
      message: `Checkout ${req.params.id} does not exist`
    })
  }

  // ── Step 2: Is the tab ready to close? ─────
  // You can't pay a tab that hasn't been fully filled in.
  // Like trying to pay before the bartender has
  // written down your full order and address.
  //
  // Allowed states: ready_for_complete (can pay now)
  // Blocked states: incomplete (still filling in form)
  //                 completed (already paid — don't charge twice!)
  if (checkout.status === 'completed') {
    return res.status(400).json({
      code:    'already_completed',
      message: 'This checkout has already been completed'
    })
  }

  if (checkout.status === 'incomplete') {
    return res.status(400).json({
      code:    'checkout_incomplete',
      message: 'Checkout must be in ready_for_complete status before payment',
      hint:    'PATCH this checkout with buyer info, address and shipping method first'
    })
  }

  // ── Step 3: Get the payment instrument ─────
  // The agent sends an array of payment instruments.
  // We use the first one (UCP supports multiple for
  // fallback scenarios, but today we use one).
  const instruments = req.body?.payment?.instruments
  if (!instruments || instruments.length === 0) {
    return res.status(400).json({
      code:    'missing_payment',
      message: 'payment.instruments is required',
      path:    '$.payment.instruments'
    })
  }

  const instrument = instruments[0]
  const { handler_id, credential } = instrument

  // ── Step 4: Validate the handler_id ────────
  // THE SECURITY STEP.
  //
  // The bartender checks it's a card they accept.
  // "We take Visa and Mastercard. Not Discover."
  //
  // handler_id must match one of the payment handlers
  // the merchant ADVERTISED in their checkout response.
  //
  // Why does this matter?
  // If you skip this check, an attacker could send a
  // token from a completely different payment provider.
  // You'd try to decrypt it with the wrong key.
  // At worst: security breach. At best: failed charges.
  //
  // Get the advertised handlers from the checkout
  const advertisedHandlers = checkout.payment?.handlers || []
  const matchedHandler = advertisedHandlers.find(h => h.id === handler_id)

  if (!matchedHandler) {
    return res.status(400).json({
      code:    'invalid_handler',
      message: `Payment handler '${handler_id}' was not advertised for this checkout`,
      valid_handlers: advertisedHandlers.map(h => h.id)
    })
  }

  // ── Step 5: Get the payment token ──────────
  // The encrypted approval code from Google Pay.
  //
  // In real life: this token is verified with the PSP
  // (Stripe, Adyen) who decrypts it and charges the card.
  //
  // In our learning server: we simulate three outcomes
  // based on the token value:
  //   "tok_decline" → payment declined
  //   "tok_3ds"     → bank needs extra verification
  //   anything else → payment approved ✓
  const token = credential?.token

  if (!token) {
    return res.status(400).json({
      code:    'missing_token',
      message: 'credential.token is required',
      path:    '$.payment.instruments[0].credential.token'
    })
  }

  // ── Step 6a: Simulate payment declined ─────
  // Sometimes the bank says no.
  // Like a card being declined at the bar.
  // The agent must tell the user and ask for
  // a different payment method.
  if (token === 'tok_decline') {
    return res.json({
      ucp: {
        version:      '2026-04-08',
        capabilities: checkout.active_capabilities
      },
      id:     checkout.id,
      status: 'requires_escalation',
      messages: [{
        type:     'error',
        code:     'payment_declined',
        severity: 'unrecoverable',
        content:  'Payment was declined. Please try a different payment method.'
      }],
      // continue_url = where to send the user if all else fails
      // Like the bartender pointing you to the ATM
      continue_url: 'http://localhost:3000/checkout-help'
    })
  }

  // ── Step 6b: Simulate 3DS challenge ────────
  // Sometimes the bank says "wait — verify it's really you."
  // Like the card reader saying "please enter your PIN."
  //
  // The agent must open the continue_url (a bank page)
  // where the user completes the verification.
  // Then the agent can retry the complete call.
  //
  // This is "requires_escalation" — not a failure,
  // just a detour through the bank's security check.
  if (token === 'tok_3ds') {
    return res.json({
      ucp: {
        version:      '2026-04-08',
        capabilities: checkout.active_capabilities
      },
      id:     checkout.id,
      status: 'requires_escalation',
      messages: [{
        type:     'error',
        code:     'requires_3ds',
        severity: 'requires_buyer_input',
        content:  'Your bank requires additional verification to complete this payment.'
      }],
      // The bank's verification page
      // Agent opens this URL for the user to complete
      continue_url: 'https://bank.example.com/3ds/verify?session=chk_' + checkout.id
    })
  }

  // ── Step 7: Payment approved — close the tab ─
  // Any other token = payment approved.
  // In production: PSP returns success/fail.
  // Here: anything not 'tok_decline' or 'tok_3ds' = success.
  //
  // This is the moment everything has been building toward.
  // Days 1–5 were setup. This is the payoff.

  // Update checkout status to completed
  checkout.status = 'completed'
  checkout.completed_at = new Date().toISOString()
  save(checkout)

  // Create the order — tear off the receipt
  const order = createOrder(checkout)

  // Return the completed response
  // Status: completed = tab closed, receipt filed, done
  res.json({
    ucp: {
      version:      '2026-04-08',
      capabilities: checkout.active_capabilities
    },
    id:           checkout.id,
    status:       'completed',       // 🎉 The money moment
    order_id:     order.id,          // The receipt number
    order: {
      id:         order.id,
      status:     order.status,      // 'processing' → Day 11 adds shipping updates
      created_at: order.created_at,
      buyer:      order.buyer,
      totals:     order.totals,
      shipping_method: order.shipping_method
    },
    // What happens next — Day 11 you build this
    next_steps: {
      track: `GET /orders/${order.id}`,
      hint:  'Your order is being processed. Webhook updates will be sent as it ships.'
    }
  })
})

module.exports = router
