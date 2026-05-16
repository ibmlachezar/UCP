# Day 06 — POST /complete — Take Payment

**What I built:** The payment endpoint. The tab finally closes. An agent sends an encrypted payment token, the server validates it, creates an order, and returns `status: completed`. The full purchase loop — discovery → negotiate → create → update → pay — is now working end to end.

**What I learned:** The Trust Triangle (raw card data never touches the merchant), handler_id validation (security against payment confusion attacks), 3DS escalation (when the bank needs extra verification), and how completed is a final, irreversible state.

---

## The bar tab analogy — all 6 days

| Day | What happened |
|-----|--------------|
| 1 | Read the sign above the bar door — merchant profile |
| 2 | Agreed on what both sides support — capability negotiation |
| 3 | Opened a tab — `chk_ik9zmis1` created, status: incomplete |
| 4 | Filled in the form — name, address, shipping — status: ready_for_complete |
| 5 | Shipping options appeared (Premium feature) — fulfillment extension |
| **6** | **Closed the tab and paid — status: completed, order_xhk6oz2h created** |

---

## The Trust Triangle

```
User  ──────────────────→  Google Pay (Card Reader)
                                    │
                           encrypted token only
                                    ↓
Merchant  ←─────────────  "tok_success" (approval code)
    │
    ↓
   PSP (charges the card)
```

Your server **never sees a raw card number**. Only the encrypted token. Like a bar that never sees your PIN — just the card reader's approval.

---

## Three payment outcomes

| Token | What happens | Analogy |
|-------|-------------|---------|
| `tok_success` | `status: completed`, order created | Card approved ✓ |
| `tok_3ds` | `requires_escalation` + `continue_url` | "Please enter your PIN" |
| `tok_decline` | `requires_escalation` + `unrecoverable` | Card declined |

---

## Files added today

| File | What it does |
|------|-------------|
| `routes/checkout-complete.js` | The payment endpoint — validate, process, complete |
| `models/order.js` | The till drawer — stores completed order receipts |

---

## Run it

```bash
npm install && node server.js
```

```powershell
# Step 1: Create checkout
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/checkout-sessions" `
  -Method POST -Headers @{"Content-Type"="application/json"} `
  -Body '{"line_items":[{"id":"li_1","item":{"id":"p1","title":"Suitcase","price":26550},"quantity":1}]}' `
  | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 5

# Step 2: Fill it in (replace YOUR_CHK_ID)
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/checkout-sessions/YOUR_CHK_ID" `
  -Method PATCH -Headers @{"Content-Type"="application/json"} `
  -Body '{"buyer":{"email":"you@example.com","first_name":"Elisa","last_name":"Martinez"},"fulfillment":{"destinations":[{"street_address":"123 Main St","city":"San Francisco","postal_code":"94105","country_code":"US"}],"selected_option_id":"free"}}' `
  | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 5

# Step 3: Pay it (replace YOUR_CHK_ID)
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/checkout-sessions/YOUR_CHK_ID/complete" `
  -Method POST -Headers @{"Content-Type"="application/json"} `
  -Body '{"payment":{"instruments":[{"handler_id":"gpay_handler_1","type":"card","credential":{"type":"PAYMENT_GATEWAY","token":"tok_success"}}]}}' `
  | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 5

# Try 3DS: change token to "tok_3ds"
# Try decline: change token to "tok_decline"
```

---

## Tests: 14 passing

```
PASS  happy path — status becomes completed
PASS  happy path — order_id is returned
PASS  happy path — order contains buyer info
PASS  happy path — order contains totals
PASS  tok_3ds — returns requires_escalation with continue_url
PASS  tok_decline — returns requires_escalation with payment_declined
PASS  wrong handler_id — returns 400 invalid_handler
PASS  incomplete checkout — returns 400
PASS  already completed — returns 400
PASS  unknown checkout id — returns 404
PASS  missing payment instruments — returns 400
PASS  each completed order gets a unique order_id
PASS  response includes ucp.capabilities
PASS  response includes next_steps after completion
```

---

## Connection to Partha's team

The complete endpoint is where UCP's security design is most visible. handler_id validation prevents payment confusion attacks. The Trust Triangle keeps merchants PCI-compliant. The 3DS escalation path handles European SCA requirements gracefully. These are the integration failure modes Partha's team debugs most — knowing them deeply is what separates a PM who understands the protocol from one who just read the spec.

---

[← Day 05](../day-05/README.md) | [Day 07 →](../day-07/README.md)
