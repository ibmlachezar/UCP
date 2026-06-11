// lib/http-signatures.js
//
// ─── THE ROYAL RING ANALOGY ───────────────────────────────
// Day 11: HMAC = a code word both sides know.
//   Anyone who knows "sesame" can say "sesame."
//   Problem: agents needed the secret to verify,
//   but that means they could also FORGE messages.
//
// Day 12: Asymmetric keys = a king's unique ring.
//   Only the king has the ring (private key).
//   Anyone can check if the wax impression matches
//   the ring (public key in profile).
//   But nobody except the king can produce new stamps.
//
// This is what RFC 9421 (HTTP Message Signatures) requires.
// The spec says: sign with your private key.
// Agents verify using your public key from /.well-known/ucp.
//
// KEY DIFFERENCE FROM DAY 11:
//   Day 11: crypto.createHmac(SECRET, body) → shared secret
//   Day 12: crypto.sign(PRIVATE_KEY, body)  → asymmetric
//           crypto.verify(PUBLIC_KEY, body, sig) → anyone can verify
// ─────────────────────────────────────────────────────────

const crypto = require('crypto')

// ─────────────────────────────────────────────
// The merchant's ECDSA P-256 keypair
//
// Generated once. In production:
//   - Store private key in a secrets manager (AWS Secrets, GCP KMS)
//   - Put public key in signing_keys in merchant.json
//   - NEVER commit private key to git
//
// Private key → only the merchant server touches this
// Public key  → in /.well-known/ucp, publicly readable
// ─────────────────────────────────────────────

// The private key — the king's ring
// Kept secret on the merchant server
const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg2wbw7fv4uOLITBlz
cRJmtMG/6b/VbCa57D01pYKTgwyhRANCAARpfkFE7mBBEuw+krk6xEUi1sIlwqa8
uAj0P/8q0DdyCSfekXWTgTttp9IAc67lSKY6v6uPnKRTQTLuCTmAy6J5
-----END PRIVATE KEY-----`

// The public key — the wax impression everyone can check
// This goes in profiles/merchant.json signing_keys
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEaX5BRO5gQRLsPpK5OsRFItbCJcKm
vLgI9D//KtA3cgkn3pF1k4E7bafSAHOu5UimOr+rj5ykU0Ey7gk5gMuieQ==
-----END PUBLIC KEY-----`

// Public key as JWK (JSON Web Key) — the format signing_keys uses
const PUBLIC_KEY_JWK = {
  kid: 'day12-key-1',    // Key ID — how agents find the right key
  kty: 'EC',             // Key type: Elliptic Curve
  crv: 'P-256',          // Curve: P-256 (same as ES256 algorithm)
  alg: 'ES256',          // Algorithm: ECDSA with SHA-256
  use: 'sig',            // Use: signing only (not encryption)
  x:   'aX5BRO5gQRLsPpK5OsRFItbCJcKmvLgI9D__KtA3cgk',  // Public key x coordinate
  y:   'J96RdZOBO22n0gBzruVIpjq_q4-cpFNBMu4JOYDLonk'   // Public key y coordinate
}

// ─────────────────────────────────────────────
// signMessage
//
// Signs a message body using the private key.
// Like pressing the king's ring into hot wax.
//
// Parameters:
//   body     → the string to sign (JSON.stringify'd payload)
//   headers  → optional headers to include in signature
//
// Returns:
//   signature → base64url-encoded signature
//   signatureInput → describes what was signed (RFC 9421 format)
//   headers → object to attach to the HTTP request
//
// In full RFC 9421:
//   - signature covers method, path, headers, body digest
//   - signature-input header lists what was covered
// For learning: we sign the body + timestamp + key ID
// ─────────────────────────────────────────────
function signMessage(body, extraHeaders = {}) {
  const timestamp = Math.floor(Date.now() / 1000)  // Unix seconds
  const keyId = PUBLIC_KEY_JWK.kid

  // Build the "signing string" — what actually gets signed
  // RFC 9421 format: list of (name: value) pairs for covered fields
  const signingString = [
    `"@method": POST`,
    `"content-type": application/json`,
    `"x-ucp-timestamp": ${timestamp}`,
    `"x-ucp-key-id": ${keyId}`,
    `"content-digest": sha-256=${sha256(body)}`
  ].join('\n')

  // Sign using ECDSA with SHA-256 (ES256)
  // createSign sets up the signing algorithm
  // .update() feeds in what to sign
  // .sign() produces the signature using our private key
  const signature = crypto
    .createSign('SHA256')
    .update(signingString)
    .sign(PRIVATE_KEY_PEM, 'base64url')  // base64url = URL-safe base64

  // RFC 9421 Signature-Input header
  // Tells agents WHAT was covered in the signature
  // Without this, they don't know what to reconstruct for verification
  const signatureInput =
    `sig1=("@method" "content-type" "x-ucp-timestamp" "x-ucp-key-id" "content-digest")` +
    `;created=${timestamp};keyid="${keyId}";alg="ecdsa-p256-sha256"`

  return {
    signature,
    signatureInput,
    timestamp,
    // HTTP headers to attach to the webhook request
    httpHeaders: {
      'Signature':        `sig1=:${signature}:`,
      'Signature-Input':  signatureInput,
      'X-UCP-Timestamp':  String(timestamp),
      'X-UCP-Key-ID':     keyId,
      'Content-Digest':   `sha-256=:${sha256(body)}:`
    }
  }
}

// ─────────────────────────────────────────────
// verifyMessage
//
// Verifies a signed message using the PUBLIC key.
// Like checking that the wax impression matches
// the known shape of the king's ring.
//
// This is what AGENTS run when they receive a webhook.
// They only need the public key — which is in the profile.
// They DO NOT need the private key.
//
// Returns: { valid: boolean, reason: string }
// ─────────────────────────────────────────────
function verifyMessage(body, signature, timestamp, keyId) {

  // Step 1: Check the timestamp — reject old messages
  // This prevents "replay attacks" where someone captures
  // a valid signed message and resends it later
  const now = Math.floor(Date.now() / 1000)
  const age = now - parseInt(timestamp)
  if (age > 300) {  // More than 5 minutes old
    return {
      valid:  false,
      reason: `Message too old: ${age} seconds. Possible replay attack.`
    }
  }

  // Step 2: Reconstruct the signing string
  // Must be IDENTICAL to what was signed — same field names, same values
  const signingString = [
    `"@method": POST`,
    `"content-type": application/json`,
    `"x-ucp-timestamp": ${timestamp}`,
    `"x-ucp-key-id": ${keyId || PUBLIC_KEY_JWK.kid}`,
    `"content-digest": sha-256=${sha256(body)}`
  ].join('\n')

  // Step 3: Verify the signature using the PUBLIC key
  // createVerify sets up verification
  // .update() feeds in the same signing string
  // .verify() checks the signature against the public key
  try {
    const valid = crypto
      .createVerify('SHA256')
      .update(signingString)
      .verify(PUBLIC_KEY_PEM, signature, 'base64url')

    return {
      valid,
      reason: valid
        ? 'Signature valid — message is authentic'
        : 'Signature invalid — message may be tampered or forged'
    }
  } catch (err) {
    return { valid: false, reason: `Verification error: ${err.message}` }
  }
}

// ─────────────────────────────────────────────
// sha256
//
// Computes SHA-256 hash of a string.
// Used in Content-Digest header — proves the body
// wasn't tampered with in transit.
//
// In RFC 9421: Content-Digest is part of the signed
// fields, so if the body changes, the digest changes,
// which breaks the signature.
// ─────────────────────────────────────────────
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('base64')
}

// ─────────────────────────────────────────────
// getPublicKeyJwk
//
// Returns the public key in JWK format.
// This is what goes in signing_keys in merchant.json
// ─────────────────────────────────────────────
function getPublicKeyJwk() {
  return PUBLIC_KEY_JWK
}

module.exports = {
  signMessage,
  verifyMessage,
  getPublicKeyJwk,
  PUBLIC_KEY_PEM,
  PUBLIC_KEY_JWK,
  sha256
}
