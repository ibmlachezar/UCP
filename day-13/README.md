# Day 13 — UCP Health Check CLI

**What I built:** A standalone CLI tool that diagnoses any merchant's UCP implementation. Point it at any domain and get a full pass/fail report across 6 categories: discovery, profile structure, capabilities, payment handlers, security, and negotiation simulation.

**What I learned:** How to bring together everything from Days 1–12 into a single diagnostic tool. This is what turns 12 days of protocol knowledge into something demonstrable.

---

## Usage

```bash
# Check your local server
node ucp-check.js localhost:3000

# Check any live merchant
node ucp-check.js nike.com

# Verbose output (shows fix hints for each failure)
node ucp-check.js example.com --verbose

# Machine-readable JSON output
node ucp-check.js example.com --json
```

---

## What it checks

| Section | Checks |
|---------|--------|
| 1. Discovery | /.well-known/ucp returns 200, Content-Type, Cache-Control |
| 2. Structure | version format, services declared, endpoint present, capabilities |
| 3. Capabilities | checkout is required, all others shown as info |
| 4. Payment Handlers | handler exists, has required id field |
| 5. Security | signing_keys present, private key (d) NOT exposed |
| 6. Negotiation | Live checkout endpoint test |

---

## Output example (your server)

```
UCP Health Check
Inspecting: http://localhost:3000

1. Profile Discovery
  ✅  Profile accessible — GET /.well-known/ucp returned 200
  ✅  Content-Type is application/json
  ✅  Cache-Control is correct — public, max-age=60
  ✅  Profile is valid JSON

2. Profile Structure
  ✅  Version format is correct — 2026-04-08
  ✅  Services declared — dev.ucp.shopping
  ✅  Shopping service has endpoint
  ✅  5 capabilities declared

3. Capabilities
  ✅  dev.ucp.shopping.checkout declared
  ℹ️   fulfillment, discount, catalog, identity_linking (optional)

4. Payment Handlers
  ✅  com.google.pay — id: gpay_handler_1

5. Security
  ✅  Key declared: kid=day12-key-1 (ES256)
  ✅  Private key NOT exposed — public key only ✓

Result: 12 passed, 0 failed, 1 warning
🎉 MOSTLY COMPLIANT
```

---

## The critical security check

The tool specifically checks that `signing_keys` does NOT contain the `d` parameter (the private key). A merchant accidentally exposing their private key in a public profile is a critical security failure — anyone who reads the profile can forge their webhooks. This check alone makes the tool valuable.

---

## Files added today

| File | What it does |
|------|-------------|
| `ucp-check.js` | Standalone CLI — no server required, works against any domain |

---

[← Day 12](../day-12/README.md) | [Day 14 →](../day-14/README.md)
