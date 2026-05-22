// lib/identity.js
//
// ─── THE LOYALTY CARD ANALOGY ─────────────────────────────
// A bar has a loyalty card programme.
// Some customers already have cards (known users).
// New customers need to register (unknown users → auth_url).
//
// This file manages that system:
//   KNOWN_ACCOUNTS  = customers who already have loyalty cards
//   LINKED_IDENTITIES = connections between Google accounts
//                       and loyalty card numbers
//   linkRequest()   = "do you have a card with us?"
//   completeLink()  = "thanks for registering, here's your card"
//   getStatus()     = "is this Google account linked to a card?"
//
// What OAuth actually does (simplified):
//   1. Agent sends user's Google ID
//   2. Merchant checks: have we seen this Google ID before?
//   3. YES → return their saved data (address, loyalty points)
//   4. NO  → return an auth_url (registration form)
//   5. User fills in the form → merchant stores the link
//   6. Next time: instant recognition
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────
// KNOWN_ACCOUNTS — existing merchant customers
//
// These are people who already have accounts
// on the merchant's website. Like customers
// who signed up before UCP existed.
//
// In production: stored in your user database.
// For learning: hardcoded with realistic data.
// ─────────────────────────────────────────────
const KNOWN_ACCOUNTS = {
  'merchant_user_001': {
    merchant_id:    'merchant_user_001',
    name:           'Elisa Martinez',
    email:          'elisa@example.com',
    loyalty_points: 1250,
    tier:           'gold',           // bronze / silver / gold
    saved_addresses: [{
      label:          'Home',
      street_address: '123 Main St',
      city:           'San Francisco',
      postal_code:    '94105',
      country_code:   'US'
    }],
    preferences: {
      preferred_shipping: 'express',
      newsletter:         true
    },
    total_orders:   8,
    member_since:   '2023-03-15'
  },
  'merchant_user_002': {
    merchant_id:    'merchant_user_002',
    name:           'James Chen',
    email:          'james@example.com',
    loyalty_points: 340,
    tier:           'silver',
    saved_addresses: [{
      label:          'Office',
      street_address: '456 Market St',
      city:           'San Francisco',
      postal_code:    '94102',
      country_code:   'US'
    }],
    preferences: {
      preferred_shipping: 'free',
      newsletter:         false
    },
    total_orders:   3,
    member_since:   '2024-01-08'
  }
}

// ─────────────────────────────────────────────
// LINKED_IDENTITIES — the loyalty card registry
//
// Maps external platform IDs (Google, etc.)
// to merchant account IDs.
//
// Pre-populated: elisa@example.com is already linked.
// james@example.com is NOT linked (to test the auth flow).
// ─────────────────────────────────────────────
const LINKED_IDENTITIES = new Map([
  // Key = "platform:platform_id"
  // Value = merchant_id
  ['google:google_user_elisa_123', 'merchant_user_001'],
  ['google:elisa@example.com',     'merchant_user_001']
])

// Pending auth sessions — created when user needs to
// go through the OAuth flow to link their account
// Key = session token, Value = { platform_identity, created_at }
const PENDING_SESSIONS = new Map()

// ─────────────────────────────────────────────
// linkRequest
//
// The main function. Called when the agent sends
// an identity hint in the checkout flow.
//
// "Do you have a loyalty card with us?"
//
// Returns one of two things:
//   status: 'linked'     → we know you, here's your data
//   status: 'not_linked' → we don't know you, here's the form
// ─────────────────────────────────────────────
function linkRequest(platformIdentity) {
  const { platform, platform_id, email } = platformIdentity

  // Build lookup keys — try both platform_id and email
  const keyById    = platform && platform_id ? `${platform}:${platform_id}` : null
  const keyByEmail = platform && email ? `${platform}:${email}` : null

  // Check if this identity is already linked
  const merchantId = (keyById && LINKED_IDENTITIES.get(keyById))
    || (keyByEmail && LINKED_IDENTITIES.get(keyByEmail))

  if (merchantId) {
    // 🎉 Known customer — the loyalty card exists!
    // Return their saved data so the checkout can be pre-filled
    const account = KNOWN_ACCOUNTS[merchantId]
    return {
      status: 'linked',
      merchant_id: merchantId,
      // Pre-filled data for the checkout
      // Agent uses this to skip asking for buyer info
      account: {
        name:           account.name,
        email:          account.email,
        loyalty_points: account.loyalty_points,
        tier:           account.tier,
        saved_addresses: account.saved_addresses,
        preferences:    account.preferences,
        total_orders:   account.total_orders,
        member_since:   account.member_since
      },
      // Loyalty discount the agent can apply automatically
      loyalty_discount: loyaltyDiscount(account.tier)
    }
  }

  // Unknown customer — create a pending session
  // and return the auth URL for them to register
  const sessionToken = 'sess_' + Math.random().toString(36).slice(2, 10)
  PENDING_SESSIONS.set(sessionToken, {
    platform_identity: platformIdentity,
    created_at: new Date().toISOString()
  })

  return {
    status: 'not_linked',
    // The URL where the user goes to link their accounts
    // In production: your OAuth authorization endpoint
    auth_url: `http://localhost:3000/auth/link?session=${sessionToken}`,
    // Tell the agent what the user needs to do
    message: 'User needs to authorize account linking. Direct them to auth_url.',
    session_token: sessionToken,
    // Linking is optional — agent can skip this
    optional: true
  }
}

// ─────────────────────────────────────────────
// completeLink
//
// Called after user completes the OAuth flow.
// "Thanks for registering, here's your card number."
//
// In production: called by your OAuth callback endpoint
// after the user authorizes the connection.
// For learning: simulated with a session token.
// ─────────────────────────────────────────────
function completeLink(sessionToken, merchantEmail) {
  const session = PENDING_SESSIONS.get(sessionToken)
  if (!session) {
    return { success: false, error: 'Session not found or expired' }
  }

  // Find the merchant account by email
  const merchantAccount = Object.values(KNOWN_ACCOUNTS)
    .find(a => a.email === merchantEmail)

  if (!merchantAccount) {
    // New customer — create a basic account
    const newId = 'merchant_user_' + Math.random().toString(36).slice(2, 8)
    KNOWN_ACCOUNTS[newId] = {
      merchant_id:    newId,
      name:           session.platform_identity.name || 'New Customer',
      email:          merchantEmail,
      loyalty_points: 100, // welcome bonus
      tier:           'bronze',
      saved_addresses: [],
      preferences:    {},
      total_orders:   0,
      member_since:   new Date().toISOString().split('T')[0]
    }

    const { platform, platform_id } = session.platform_identity
    LINKED_IDENTITIES.set(`${platform}:${platform_id}`, newId)
    PENDING_SESSIONS.delete(sessionToken)

    return { success: true, merchant_id: newId, new_account: true, welcome_points: 100 }
  }

  // Link existing account
  const { platform, platform_id } = session.platform_identity
  LINKED_IDENTITIES.set(`${platform}:${platform_id}`, merchantAccount.merchant_id)
  PENDING_SESSIONS.delete(sessionToken)

  return {
    success:     true,
    merchant_id: merchantAccount.merchant_id,
    new_account: false
  }
}

// ─────────────────────────────────────────────
// getStatus
//
// Check if a platform identity is linked.
// Used by GET /identity/status
// ─────────────────────────────────────────────
function getStatus(platform, platformId) {
  const key = `${platform}:${platformId}`
  const merchantId = LINKED_IDENTITIES.get(key)

  if (!merchantId) {
    return { linked: false }
  }

  const account = KNOWN_ACCOUNTS[merchantId]
  return {
    linked: true,
    merchant_id: merchantId,
    tier:           account?.tier,
    loyalty_points: account?.loyalty_points
  }
}

// ─────────────────────────────────────────────
// loyaltyDiscount — what each tier gets
// ─────────────────────────────────────────────
function loyaltyDiscount(tier) {
  const discounts = {
    bronze: { code:'LOYAL5',  description:'5% loyalty discount',  value:5  },
    silver: { code:'LOYAL10', description:'10% loyalty discount', value:10 },
    gold:   { code:'LOYAL15', description:'15% loyalty discount', value:15 }
  }
  return discounts[tier] || null
}

module.exports = { linkRequest, completeLink, getStatus, KNOWN_ACCOUNTS }
