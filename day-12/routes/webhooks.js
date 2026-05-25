// routes/webhooks.js
//
// ─── THE TEXT MESSAGE ANALOGY ─────────────────────────────
// Three endpoints on this desk:
//
// POST /webhooks/register
//   = "Text me at this number when anything changes"
//   = Agent gives the merchant their callback URL
//
// POST /orders/:id/advance
//   = The bar moves your order to the next stage
//   = Triggers a webhook dispatch automatically
//   = (In production: triggered by real fulfilment events)
//
// GET /orders/:id
//   = "What's the current status of my order?"
//   = Returns order + full event history
//
// GET /webhooks/log/:orderId
//   = "Show me all the texts that were sent"
//   = Returns every webhook event dispatched for this order
// ─────────────────────────────────────────────────────────

const express = require('express')
const router  = express.Router()
const {
  registerWebhook,
  dispatchWebhook,
  verifySignature,
  getEventLog,
  getRegistration,
  STATUS_LIFECYCLE
} = require('../lib/webhooks')
const { findOrderById } = require('../models/order')

// ─────────────────────────────────────────────
// POST /ucp/v1/webhooks/register
//
// Agent registers where to receive order updates.
// Called once after POST /complete creates the order.
//
// Request:
// {
//   "order_id": "order_xhk6oz2h",
//   "webhook_url": "https://agent.example.com/order-updates"
// }
// ─────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { order_id, webhook_url } = req.body

  if (!order_id || !webhook_url) {
    return res.status(400).json({
      code:    'invalid_request',
      message: 'order_id and webhook_url are required'
    })
  }

  // Verify the order actually exists
  const order = findOrderById(order_id)
  if (!order) {
    return res.status(404).json({
      code:    'order_not_found',
      message: `Order ${order_id} does not exist`
    })
  }

  const result = registerWebhook(order_id, webhook_url)

  res.json({
    ucp: { version:'2026-04-08', capabilities:{} },
    ...result,
    message: 'Webhook registered. You will receive POST requests at this URL when order status changes.',
    // The events the agent will receive
    events: Object.values(STATUS_LIFECYCLE).map(s => s.event_type)
  })
})

// ─────────────────────────────────────────────
// POST /ucp/v1/orders/:id/advance
//
// Advances the order to the next status.
// Automatically fires the webhook.
//
// In production: this is triggered by your
// fulfilment system (warehouse, shipping partner).
// For learning: we trigger it manually to see
// the webhook fire.
//
// The lifecycle:
//   processing → shipped → out_for_delivery → delivered
// ─────────────────────────────────────────────
router.post('/orders/:id/advance', async (req, res) => {
  const order = findOrderById(req.params.id)

  if (!order) {
    return res.status(404).json({
      code:'order_not_found',
      message:`Order ${req.params.id} does not exist`
    })
  }

  // Find the current status in the lifecycle
  const currentStatus = STATUS_LIFECYCLE[order.status]

  if (!currentStatus) {
    return res.status(400).json({
      code:    'invalid_status',
      message: `Order status '${order.status}' is not in the lifecycle`
    })
  }

  if (!currentStatus.next) {
    return res.status(400).json({
      code:    'already_final',
      message: `Order is already in final status: ${order.status}`
    })
  }

  // Move to next status
  const nextStatus = currentStatus.next
  const nextLifecycle = STATUS_LIFECYCLE[nextStatus]
  order.status     = nextStatus
  order.updated_at = new Date().toISOString()

  // Add tracking info when shipped
  if (nextStatus === 'shipped') {
    order.tracking = {
      carrier:        'UCP Express',
      tracking_number: 'UCP' + Math.random().toString().slice(2, 12).toUpperCase(),
      estimated_delivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }
  }

  // Fire the webhook — the bar sends you a text
  const dispatch = await dispatchWebhook(
    order.id,
    order,
    nextLifecycle.event_type,
    nextLifecycle.description
  )

  // Build the signed payload so agents can verify
  const { signPayload } = require('../lib/webhooks')
  const webhookPayload = dispatch.payload
  const { body: signedBody, header: sigHeader } = signPayload(webhookPayload)

  res.json({
    ucp: { version:'2026-04-08', capabilities:{} },
    order: {
      id:         order.id,
      status:     order.status,
      updated_at: order.updated_at,
      tracking:   order.tracking || null
    },
    webhook_dispatched: true,  // event was processed by the webhook system
    webhook_delivered:  dispatch.delivered || false, // actually reached a URL
    webhook: {
      event_type:   nextLifecycle.event_type,
      target_url:   dispatch.target_url,
      signature:    sigHeader,
      delivered:    dispatch.delivered,
      simulated:    dispatch.simulated,
      signed_body:  signedBody,           // raw body that was signed
      payload_preview: webhookPayload
    },
    next_status: STATUS_LIFECYCLE[nextStatus]?.next
      ? `Will advance to: ${STATUS_LIFECYCLE[nextStatus].next}`
      : 'Order is now in final status: delivered'
  })
})

// ─────────────────────────────────────────────
// GET /ucp/v1/orders/:id
//
// Get current order status and full event history.
// ─────────────────────────────────────────────
router.get('/orders/:id', (req, res) => {
  const order = findOrderById(req.params.id)

  if (!order) {
    return res.status(404).json({
      code:'order_not_found',
      message:`Order ${req.params.id} does not exist`
    })
  }

  const registration = getRegistration(order.id)
  const eventLog     = getEventLog(order.id)

  res.json({
    ucp: { version:'2026-04-08', capabilities:{} },
    order: {
      id:          order.id,
      status:      order.status,
      checkout_id: order.checkout_id,
      buyer:       order.buyer,
      totals:      order.totals,
      shipping_method: order.shipping_method,
      tracking:    order.tracking || null,
      created_at:  order.created_at,
      updated_at:  order.updated_at
    },
    webhook_registration: registration
      ? { url: registration.url, events_sent: registration.events_sent }
      : null,
    event_history: eventLog.map(e => ({
      event_type:    e.event_type,
      dispatched_at: e.dispatched_at,
      delivered:     e.delivered,
      message:       e.message
    }))
  })
})

// ─────────────────────────────────────────────
// GET /ucp/v1/webhooks/log/:orderId
//
// Full webhook event log for an order.
// Shows every text that was sent.
// ─────────────────────────────────────────────
router.get('/log/:orderId', (req, res) => {
  const log = getEventLog(req.params.orderId)
  res.json({
    order_id:    req.params.orderId,
    event_count: log.length,
    events:      log
  })
})

// ─────────────────────────────────────────────
// POST /ucp/v1/webhooks/verify
//
// Test endpoint — agents can verify a signature.
// Simulates what an agent does when it receives
// a webhook from the merchant.
// ─────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const signature = req.headers['x-ucp-signature']
  const body      = JSON.stringify(req.body)

  if (!signature) {
    return res.status(400).json({ valid:false, reason:'Missing X-UCP-Signature header' })
  }

  const valid = verifySignature(body, signature)

  res.json({
    valid,
    reason: valid
      ? 'Signature matches. This webhook is authentic.'
      : 'Signature does not match. This webhook may be fake or tampered.'
  })
})

module.exports = router
