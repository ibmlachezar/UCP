// lib/webhooks.js
//
// ─── THE TEXT MESSAGE ANALOGY ─────────────────────────────
// After you leave the bar, they text you updates:
//   "Your order is being prepared" (processing)
//   "Your order is on the way" (shipped)
//   "Your order has arrived" (delivered)
//
// Each text has an official stamp (HMAC signature).
// You verify it against the bar's public key
// (which you got from their profile on Day 1).
//
// This file builds those texts and stamps them.
//
// THE DAY 1 CONNECTION:
//   signing_keys in merchant.json = the bar's official stamp
//   Agents fetch the public key from /.well-known/ucp
//   They verify every webhook payload against that key
//   If verification fails → ignore the message (it's fake)
// ─────────────────────────────────────────────────────────

const crypto = require('crypto')
const { signMessage } = require('./http-signatures')

// ─────────────────────────────────────────────
// WEBHOOK_SECRET — the private key used to sign
//
// In production: this is your actual private key
// matching the public key in signing_keys.
// For learning: a simple secret string.
// NEVER put this in your profile — only the PUBLIC key.
// ─────────────────────────────────────────────
const WEBHOOK_SECRET = 'ucp-demo-webhook-secret-2026'

// ─────────────────────────────────────────────
// Registered webhook endpoints
//
// Agents call POST /webhooks/register to tell us
// where to send order updates.
//
// Key   = order_id  (send events for this order here)
// Value = { url, registered_at }
// ─────────────────────────────────────────────
const REGISTERED_WEBHOOKS = new Map()

// ─────────────────────────────────────────────
// Order event history
// Tracks all events sent for each order
// ─────────────────────────────────────────────
const EVENT_LOG = new Map()

// ─────────────────────────────────────────────
// ORDER STATUS LIFECYCLE
//
// processing → shipped → out_for_delivery → delivered
//
// Each status has:
//   event_type → what gets sent in the webhook
//   description → human-readable update
//   next → what status comes after (or null if final)
// ─────────────────────────────────────────────
const STATUS_LIFECYCLE = {
  processing: {
    event_type:  'order.processing',
    description: 'Your order is being prepared',
    next:        'shipped'
  },
  shipped: {
    event_type:  'order.shipped',
    description: 'Your order has shipped',
    next:        'out_for_delivery'
  },
  out_for_delivery: {
    event_type:  'order.out_for_delivery',
    description: 'Your order is out for delivery',
    next:        'delivered'
  },
  delivered: {
    event_type:  'order.delivered',
    description: 'Your order has been delivered',
    next:        null  // final state
  }
}

// ─────────────────────────────────────────────
// buildWebhookPayload
//
// Constructs the webhook body — what gets sent
// to the agent when an order status changes.
// ─────────────────────────────────────────────
function buildWebhookPayload(order, eventType, description) {
  return {
    // What happened
    event_type: eventType,
    event_id:   'evt_' + Math.random().toString(36).slice(2, 10),

    // When it happened
    timestamp:  new Date().toISOString(),

    // Which merchant sent this
    merchant_id: 'demo-merchant-01',

    // The order data
    order: {
      id:          order.id,
      status:      order.status,
      checkout_id: order.checkout_id,
      buyer:       order.buyer,
      totals:      order.totals,
      shipping_method: order.shipping_method
    },

    // Human-readable message for the agent to show the user
    message: description,

    // Next steps hint — what the agent should do/show
    next_steps: order.status === 'delivered'
      ? { message: 'Order complete. Ask user to leave a review.' }
      : { message: 'Update user on order progress.' }
  }
}

// ─────────────────────────────────────────────
// signPayload
//
// Day 12 upgrade: now uses HTTP Message Signatures
// (asymmetric ECDSA) instead of HMAC.
//
// Day 11: HMAC(WEBHOOK_SECRET, body)  ← shared secret
// Day 12: sign(PRIVATE_KEY, body)     ← only merchant can sign
//
// Agents verify using PUBLIC key from /.well-known/ucp
// No shared secret needed — no forgery risk
// ─────────────────────────────────────────────
function signPayload(payload) {
  const body = JSON.stringify(payload)
  const result = signMessage(body)

  return {
    body,
    // Keep legacy signature for backwards compat
    signature: result.signature,
    // New: full HTTP Message Signature headers
    header: `sig1=:${result.signature}:`,
    httpHeaders: result.httpHeaders,
    timestamp: result.timestamp
  }
}

// ─────────────────────────────────────────────
// verifySignature
//
// Day 12: Uses HTTP Message Signatures (asymmetric).
// Agents call this with the raw body + signature header.
// ─────────────────────────────────────────────
function verifySignature(body, signatureHeader, timestamp) {
  const { verifyMessage } = require('./http-signatures')
  // Extract signature from "sig1=:xxx:" format
  const match = signatureHeader?.match(/sig1=:([^:]+):/)
  if (!match) {
    // Fall back to legacy HMAC format for backwards compat
    const legacyMatch = signatureHeader?.match(/sha256=(.+)/)
    if (legacyMatch) {
      const expected = 'sha256=' + crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(body)
        .digest('hex')
      return expected === signatureHeader
    }
    return false
  }
  const result = verifyMessage(body, match[1], timestamp)
  return result.valid
}

// ─────────────────────────────────────────────
// registerWebhook
//
// Agent calls this to say "send order updates here"
// Called once after checkout completes.
// ─────────────────────────────────────────────
function registerWebhook(orderId, webhookUrl) {
  REGISTERED_WEBHOOKS.set(orderId, {
    url:             webhookUrl,
    registered_at:   new Date().toISOString(),
    events_sent:     0
  })
  return { registered: true, order_id: orderId, url: webhookUrl }
}

// ─────────────────────────────────────────────
// dispatchWebhook
//
// Sends the webhook to the registered URL.
//
// In production: makes a real HTTP POST to the agent.
// For learning: simulates the dispatch and logs it.
// We can't make real outbound calls in a test server
// but the payload and signature are real.
// ─────────────────────────────────────────────
async function dispatchWebhook(orderId, order, eventType, description) {
  const registration = REGISTERED_WEBHOOKS.get(orderId)
  const payload = buildWebhookPayload(order, eventType, description)
  const signed = signPayload(payload)

  const logEntry = {
    event_type:    eventType,
    dispatched_at: new Date().toISOString(),
    target_url:    registration?.url || '(no url registered)',
    payload,
    signature:     signed.header,
    delivered:     false,
    message:       ''
  }

  if (!registration) {
    logEntry.message = 'No webhook registered for this order'
    addToLog(orderId, logEntry)
    return { dispatched: false, reason: 'no_webhook_registered', payload }
  }

  // Try to send the webhook with RFC 9421 headers
  try {
    const response = await fetch(registration.url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        // Day 12: proper RFC 9421 headers
        ...(signed.httpHeaders || {}),
        'X-UCP-Event':   eventType,
        'X-Merchant-ID': 'demo-merchant-01'
      },
      body:   signed.body,
      signal: AbortSignal.timeout(3000)
    })
    logEntry.delivered = response.ok
    logEntry.message   = `HTTP ${response.status}`
    registration.events_sent++
  } catch (err) {
    // URL unreachable — normal in test environment
    logEntry.message = `Could not reach ${registration.url} — ${err.message}`
    // Still mark as simulated success for learning purposes
    logEntry.simulated = true
  }

  addToLog(orderId, logEntry)
  REGISTERED_WEBHOOKS.set(orderId, registration)

  return {
    dispatched:  true,
    event_type:  eventType,
    target_url:  registration.url,
    signature:   signed.header,
    payload,
    delivered:   logEntry.delivered,
    simulated:   logEntry.simulated || false
  }
}

function addToLog(orderId, entry) {
  if (!EVENT_LOG.has(orderId)) EVENT_LOG.set(orderId, [])
  EVENT_LOG.get(orderId).push(entry)
}

function getEventLog(orderId) {
  return EVENT_LOG.get(orderId) || []
}

function getRegistration(orderId) {
  return REGISTERED_WEBHOOKS.get(orderId) || null
}

module.exports = {
  registerWebhook,
  dispatchWebhook,
  verifySignature,
  buildWebhookPayload,
  signPayload,
  getEventLog,
  getRegistration,
  STATUS_LIFECYCLE,
  WEBHOOK_SECRET
}
