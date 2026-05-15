# Day 04 — PATCH /checkout-sessions/:id

**What I built:** The update endpoint. Agents fill in a checkout incrementally — email first, then address, then shipping selection. Each PATCH merges new data onto existing data without wiping what's already there. When all required fields are present, status automatically flips to `ready_for_complete`.

**What I learned:** The UCP messages array pattern — validation errors are returned as structured data inside a 200 response, not as HTTP 400 errors. Partial updates are accepted and stored. The state machine moves forward automatically when all requirements are met.

---

## The key concept

```
Agent sends email only → 200 + messages listing what's still missing
Agent sends everything → 200 + status: ready_for_complete + next_steps
```

No rejection. No starting over. The merchant accepts what it gets, stores it, and tells the agent exactly what's still needed.

---

## Message types

| type | meaning |
|------|---------|
| `error` | Blocking — checkout cannot complete until resolved |
| `info` | Advisory — nice to have, will not block payment |

---

## Status machine

```
incomplete → ready_for_complete → completed
```

Status flips automatically the moment all error-type messages are gone.

---

## Files added today

| File | What it does |
|------|-------------|
| `lib/totals.js` | Calculates subtotal, tax, shipping, total |
| `lib/validate.js` | Produces the messages array |
| Updated `routes/checkout.js` | PATCH route with merge + validation |

---

## Run it

```bash
npm install && node server.js
```

```powershell
# Create checkout first (Day 3)
# Then PATCH with full details:
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/checkout-sessions/YOUR_ID" `
  -Method PATCH `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"buyer":{"email":"you@example.com","first_name":"Elisa","last_name":"Martinez"},"fulfillment":{"destinations":[{"street_address":"123 Main St","city":"San Francisco","postal_code":"94105","country_code":"US"}],"selected_option_id":"free"}}' `
  | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

---

[← Day 03](../day-03/README.md) | [Day 05 →](../day-05/README.md)
