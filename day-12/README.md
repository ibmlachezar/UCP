# Day 12 — HTTP Message Signatures (RFC 9421)

**What I built:** Upgraded webhook signatures from HMAC (shared secret) to proper asymmetric cryptography — ECDSA P-256 (ES256). Private key signs. Public key in the merchant profile verifies. Nobody can forge what only the private key can produce.

**What I learned:** The difference between symmetric (HMAC — shared secret) and asymmetric (RSA/ECDSA — keypair) cryptography, RFC 9421 Signature and Signature-Input headers, Content-Digest for body integrity, and replay attack prevention via timestamp validation.

---

## The wax seal upgrade

| Day 11 (HMAC) | Day 12 (HTTP Message Signatures) |
|---------------|----------------------------------|
| Shared secret — both sides need it | Private key — only merchant has it |
| Anyone with the secret can forge | Only private key can produce valid signatures |
| `sha256=hexstring` | `sig1=:base64url:` (RFC 9421 format) |
| No replay protection | Timestamp validation — rejects messages > 5 minutes old |
| No body integrity check | Content-Digest header proves body wasn't tampered |

---

## What's in a Day 12 webhook

```
POST https://agent.example.com/updates
Content-Type: application/json
Signature: sig1=:abc123...:
Signature-Input: sig1=("@method" "content-type" "x-ucp-timestamp" ...);created=1234567890;keyid="day12-key-1";alg="ecdsa-p256-sha256"
Content-Digest: sha-256=:base64hash:
X-UCP-Timestamp: 1234567890
X-UCP-Key-ID: day12-key-1

{ "event_type": "order.shipped", "order": { ... } }
```

---

## Why the public key lives in /.well-known/ucp

```
Agent receives webhook
    ↓
Agent fetches merchant profile at /.well-known/ucp
    ↓
Reads signing_keys → finds public key with matching kid
    ↓
Verifies Signature header using that public key
    ↓
If valid → process event. If invalid → discard silently.
```

No key exchange needed. No separate API. The key was always in the profile — discoverable by any agent from Day 1.

---

## Files added today

| File | What it does |
|------|-------------|
| `lib/http-signatures.js` | Real ECDSA keypair, signMessage, verifyMessage, Content-Digest |
| Updated `lib/webhooks.js` | Uses HTTP Message Signatures instead of HMAC |
| Updated `profiles/merchant.json` | Real public key in signing_keys |

---

## Run it

```bash
npm install && node server.js
node tests/http-signatures.test.js
```

---

[← Day 11](../day-11/README.md) | [Day 13 →](../day-13/README.md)
