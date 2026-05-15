# Day 05 — Fulfillment Extension

**What I built:** The `dev.ucp.shopping.fulfillment` extension — the first real UCP extension. Shipping options are now a declared capability in the merchant profile. They only appear in checkout responses if BOTH the merchant AND the platform agent declared the capability. If either side doesn't have it, the fulfillment field is completely absent from the response.

**What I learned:** The `extends` model working in practice. Extensions are conditional on negotiation — the same merchant server behaves differently for different agents based purely on what they declared in their profiles.

---

## The key concept

```
Agent WITH fulfillment declared  → fulfillment section appears in response
Agent WITHOUT fulfillment        → fulfillment field is completely absent
```

This is capability negotiation making commerce adaptive. One server, different responses for different agents.

---

## What changed from Day 4

| Day 4 | Day 5 |
|-------|-------|
| Shipping hardcoded in validate.js | Shipping is a proper UCP capability |
| Always shown in responses | Only shown when both sides declare it |
| Always required for completion | Only required when fulfillment is active |

---

## Files added today

| File | What it does |
|------|-------------|
| `lib/fulfillment.js` | Extension module — methods, response builder, active check |
| Updated `profiles/merchant.json` | Now declares `dev.ucp.shopping.fulfillment` |
| Updated `lib/validate.js` | Conditionally requires shipping based on activeCaps |
| Updated `routes/checkout.js` | Passes activeCaps to validate, conditionally includes fulfillment |

---

## Run it

```bash
npm install && node server.js
```

```powershell
# Create checkout WITH UCP-Agent header to activate fulfillment
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/checkout-sessions" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"; "UCP-Agent"='profile="http://localhost:3000/test-platform-profile"'} `
  -Body '{"line_items":[{"id":"li_1","item":{"id":"p1","title":"Suitcase","price":26550},"quantity":1}]}' `
  | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

Look for `dev.ucp.shopping.fulfillment` in `ucp.capabilities` and the `fulfillment` section with two shipping options.

---

## Connection to Partha's team

The fulfillment extension is exactly how UCP grows — new capabilities are added to the spec and merchants declare them when ready. Agents that support the new capability get the enhanced experience. Agents that don't are unaffected. This backward-compatible extension model is what Partha's team designs and argues about in spec reviews every week.

---

[← Day 04](../day-04/README.md) | [Day 06 →](../day-06/README.md)
