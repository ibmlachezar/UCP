# Day 08 — Discount Extension

**What I built:** The `dev.ucp.shopping.discount` extension. Agents can apply discount codes to a checkout in the PATCH body. The server validates the code, deducts it from the subtotal, recalculates tax on the reduced amount, and shows a new `discount` line in the totals array.

**What I learned:** Multi-parent extensions use OR logic — discount extends checkout AND cart, but survives if EITHER parent is present. An invalid discount code is `type: "info"` (advisory) not `type: "error"` (blocking) — the checkout can complete without a discount.

---

## The loyalty card analogy

You show your loyalty card (discount code) at the bar. Bartender checks it's real. If valid: money off the bill. If invalid: tells you why — but you can still pay full price.

---

## Multi-parent extends — the key new concept

```
fulfillment extends:  "checkout"           (one parent — AND rule for pruning)
discount extends:    ["checkout", "cart"]  (two parents — OR rule for survival)
```

Discount survives the pruning step if **at least one** parent is in the negotiated set. Since checkout is always active, discount is always available without needing cart.

---

## How totals change with a discount

```
Without SAVE10:               With SAVE10 (10% off):
  subtotal:  26550              subtotal:  26550
  tax:        2655              discount:  -2655   ← NEW
  shipping:      0              tax:        2390   ← lower (on reduced amount)
  total:     29205              shipping:      0
                                total:     26285   ← $26.20 savings
```

**Tax is calculated on the discounted subtotal** — not the original price.

---

## Available discount codes (for testing)

| Code | Type | Value |
|------|------|-------|
| `SAVE10` | percentage | 10% off |
| `SAVE20` | percentage | 20% off |
| `FIXED5` | fixed | $5.00 off |
| `EXPIRED` | — | Invalid (inactive) |

---

## Files added today

| File | What it does |
|------|-------------|
| `lib/discount.js` | Validation, calculation, isDiscountActive (OR rule), response builder |
| Updated `lib/totals.js` | Handles discount line item, tax on discounted subtotal |
| Updated `profiles/merchant.json` | Declares `dev.ucp.shopping.discount` with multi-parent extends |

---

## Run it

```bash
npm install && node server.js
```

```powershell
# Create → PATCH with discount code → complete
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/checkout-sessions/YOUR_ID" `
  -Method PATCH `
  -Headers @{"Content-Type"="application/json"; "UCP-Agent"='profile="http://localhost:3000/test-platform-profile"'} `
  -Body '{"buyer":{"email":"you@example.com","first_name":"Elisa","last_name":"Martinez"},"fulfillment":{"destinations":[{"street_address":"123 Main St","city":"SF","postal_code":"94105","country_code":"US"}],"selected_option_id":"free"},"discounts":{"codes":["SAVE10"]}}' `
  | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

Look for `discount: -2655` in totals and `applied.code: "SAVE10"` in the discounts section.

---

[← Day 07](../day-07/README.md) | [Day 09 →](../day-09/README.md)
