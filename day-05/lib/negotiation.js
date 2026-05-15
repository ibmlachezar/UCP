// ─────────────────────────────────────────────────────────────
// lib/negotiation.js
//
// The core algorithm of UCP. Runs on every single API call.
//
// What it does:
//   1. Read the UCP-Agent header to find the platform's profile URL
//   2. Fetch and cache that profile
//   3. Intersect capabilities (keep only what BOTH sides declare)
//   4. Prune orphaned extensions (no child without its parent)
//   5. Return the active capability set for this session
// ─────────────────────────────────────────────────────────────

// Simple in-memory cache for platform profiles.
// In production this would be Redis or similar.
// Key = profile URL, Value = { profile, fetchedAt }
const profileCache = new Map()
const CACHE_TTL_MS = 60 * 1000 // 60 seconds — matches the spec minimum

// ─────────────────────────────────────────────
// Step 1: Parse the UCP-Agent header
//
// The header looks like this:
//   UCP-Agent: profile="https://agent.example.com/profile.json"
//
// We need to extract just the URL from inside the quotes.
// ─────────────────────────────────────────────
function extractProfileUrl(ucpAgentHeader) {
  if (!ucpAgentHeader) return null

  // Match the URL inside profile="..."
  const match = ucpAgentHeader.match(/profile="([^"]+)"/)
  return match ? match[1] : null
}

// ─────────────────────────────────────────────
// Step 2: Fetch the platform profile
//
// This is the mirror of what agents do to us —
// they fetch /.well-known/ucp, we fetch their profile.
//
// We cache the result to avoid re-fetching on every request.
// The spec requires we cache for at least 60 seconds.
// ─────────────────────────────────────────────
async function fetchProfile(profileUrl) {
  // Check the cache first
  const cached = profileCache.get(profileUrl)
  if (cached) {
    const age = Date.now() - cached.fetchedAt
    if (age < CACHE_TTL_MS) {
      return cached.profile // Cache hit — no network request needed
    }
  }

  // Cache miss or expired — fetch from the network
  try {
    const response = await fetch(profileUrl)

    if (!response.ok) {
      throw new Error(`Profile fetch failed: ${response.status} ${response.statusText}`)
    }

    const profile = await response.json()

    // Store in cache with timestamp
    profileCache.set(profileUrl, {
      profile,
      fetchedAt: Date.now()
    })

    return profile

  } catch (err) {
    throw new Error(`Could not fetch platform profile from ${profileUrl}: ${err.message}`)
  }
}

// ─────────────────────────────────────────────
// Step 3: Intersect capabilities
//
// Rules:
//   - Only keep capabilities that BOTH sides declare
//   - For each match, pick the HIGHEST version both share
//   - If no shared version exists, exclude that capability
//
// Example:
//   Merchant has: checkout v2026-04-08
//   Agent has:    checkout v2026-04-08, checkout v2025-10-01
//   Result:       checkout v2026-04-08  (highest shared version)
//
//   Merchant has: catalog v2026-04-08
//   Agent has:    (no catalog)
//   Result:       catalog excluded
// ─────────────────────────────────────────────
function intersectCapabilities(merchantCaps, platformCaps) {
  const result = {}

  for (const [capName, merchantVersions] of Object.entries(merchantCaps)) {
    // Does the platform also declare this capability?
    const platformVersions = platformCaps[capName]
    if (!platformVersions) continue // Platform doesn't have it — skip

    // Find versions that both sides declare
    const platformVersionSet = new Set(platformVersions.map(v => v.version))
    const sharedVersions = merchantVersions.filter(v => platformVersionSet.has(v.version))

    if (sharedVersions.length === 0) continue // No shared version — skip

    // Pick the highest (latest date string) shared version
    // Date strings like "2026-04-08" sort correctly as strings
    sharedVersions.sort((a, b) => b.version.localeCompare(a.version))
    result[capName] = [sharedVersions[0]]
  }

  return result
}

// ─────────────────────────────────────────────
// Step 4: Prune orphaned extensions
//
// Extensions depend on parent capabilities.
// If a parent was removed in step 3, the extension must go too.
//
// Example:
//   fulfillment extends checkout
//   If checkout was pruned → fulfillment must also be pruned
//
// This runs in a loop because extensions can chain:
//   loyalty extends fulfillment extends checkout
//   Remove checkout → fulfillment orphaned → loyalty orphaned
//
// We keep looping until nothing changes (stable state).
// ─────────────────────────────────────────────
function pruneOrphanedExtensions(capabilities) {
  let changed = true

  while (changed) {
    changed = false

    for (const [capName, versions] of Object.entries(capabilities)) {
      const extendsValue = versions[0].extends
      if (!extendsValue) continue // Not an extension — skip

      // Handle both single parent (string) and multiple parents (array)
      const parents = Array.isArray(extendsValue) ? extendsValue : [extendsValue]

      // Check if AT LEAST ONE parent survived
      const hasParent = parents.some(parent => capabilities[parent])

      if (!hasParent) {
        // No parent in the intersection — prune this extension
        delete capabilities[capName]
        changed = true // Something changed — need another pass
      }
    }
  }

  return capabilities
}

// ─────────────────────────────────────────────
// The main function — call this in your routes
//
// Usage:
//   const activeCaps = await negotiate(req, merchantProfile)
//
// Returns the active capability set for this session.
// If the agent has no UCP-Agent header, returns all merchant
// capabilities (fallback for simple testing).
// ─────────────────────────────────────────────
async function negotiate(req, merchantProfile) {
  const merchantCaps = merchantProfile.ucp.capabilities || {}

  // Read the UCP-Agent header
  const ucpAgentHeader = req.headers['ucp-agent']
  const profileUrl = extractProfileUrl(ucpAgentHeader)

  // No UCP-Agent header — return all merchant capabilities
  // (useful for health checks and testing)
  if (!profileUrl) {
    return {
      activeCaps: merchantCaps,
      platformProfile: null,
      note: 'No UCP-Agent header — returning all merchant capabilities'
    }
  }

  // Fetch the platform's profile
  let platformProfile
  try {
    platformProfile = await fetchProfile(profileUrl)
  } catch (err) {
    // Cannot fetch the platform profile — return error info
    return {
      activeCaps: {},
      error: 'profile_unreachable',
      message: err.message
    }
  }

  const platformCaps = platformProfile.ucp?.capabilities || {}

  // Step 3: Intersect
  let activeCaps = intersectCapabilities(merchantCaps, platformCaps)

  // Step 4: Prune orphaned extensions
  activeCaps = pruneOrphanedExtensions(activeCaps)

  return {
    activeCaps,
    platformProfile
  }
}

module.exports = {
  negotiate,
  // Export individual functions too — makes testing easy
  extractProfileUrl,
  intersectCapabilities,
  pruneOrphanedExtensions
}
