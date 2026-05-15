# Day 03 — POST /checkout-sessions

**What I built:** The most important endpoint in UCP. When an AI agent wants to buy something, it POSTs to this endpoint. A checkout session is created with a unique ID, the items, calculated totals, and available payment handlers. Status starts as `incomplete` — there's still information needed before payment can happen.

**What I learned:** How HTTP POST works, why amounts are in cents (minor units), how the checkout state machine works, and how app.use() mounts a router at a base path in Express.

---

## The concept

```
Agent sends:                      Server responds:
POST /ucp/v1/checkout-sessions    201 Created
{                                 {
  "line_items": [{                  "id": "chk_abc123",
    "item": {                       "status": "incomplete",
      "title": "Suitcase",          "totals": [{
      "price": 26550                  "type": "subtotal",
    },                                "amount": 26550
    "quantity": 1                   }],
  }]                                "payment": { "handlers": [...] },
}                                   "ucp": { "capabilities": {...} }
                                  }
```

A new checkout ID is created every time. Agent stores this ID and uses it in all subsequent requests (PATCH to update, POST /complete to pay).

---

## Key concepts learned

**Why cents (minor units)?**
`$265.50` is stored as `26550`. Computers can't perfectly represent decimal numbers in binary — `0.1 + 0.2` gives `0.30000000000000004` in JavaScript. Integer cents eliminate this entirely.

**Why status starts as `incomplete`?**
The agent hasn't provided a shipping address or selected a fulfillment method yet. The checkout state machine enforces correct ordering — you cannot attempt payment until all required information is present.

**Why 201 and not 200?**
`201 Created` specifically means "something new was created." `200 OK` means "request succeeded." The distinction matters — an agent seeing 201 knows a new resource exists and can be referenced by ID.

**What is `app.use()`?**
Mounts a router at a base path. `app.use('/ucp/v1/checkout-sessions', checkoutRouter)` means all routes inside `checkoutRouter` are relative to that base path. `router.post('/')` becomes `POST /ucp/v1/checkout-sessions`. Keeps server.js clean.

---

## Checkout state machine

```
incomplete  →  ready_for_complete  →  completed
                                   ↘  requires_escalation (3DS)
```

- `incomplete` — missing shipping address or fulfillment selection (Day 4 fixes this)
- `ready_for_complete` — all info present, ready to pay
- `completed` — payment taken, order created (Day 6)
- `requires_escalation` — bank requires 3DS challenge

---

## File structure added today

```
day-03/
  server.js              ← updated: checkout router mounted
  routes/
    checkout.js          ← NEW: POST + GET /checkout-sessions
  models/
    checkout.js          ← NEW: in-memory store, create/find/save
  tests/
    checkout.test.js     ← NEW: 13 tests for checkout endpoints
    negotiation.test.js  ← carried from Day 2
```

---

## Run it

```bash
npm install
node server.js
```

**Create a checkout (PowerShell):**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/checkout-sessions" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"line_items":[{"id":"li_1","item":{"id":"p1","title":"Suitcase","price":26550},"quantity":1}]}' `
  | Select-Object -ExpandProperty Content
```

**Get the checkout by ID:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/checkout-sessions/chk_YOURID" `
  | Select-Object -ExpandProperty Content
```

---

## Connection to Partha's team

`POST /checkout-sessions` is where every agentic purchase in the world begins. Every time a Google Shopping agent, ChatGPT shopping plugin, or voice assistant buys something, this is the first commerce call. Understanding the checkout state machine — why it starts incomplete, what moves it forward, what each status means — is fundamental to debugging integration failures on Partha's team.

---

[← Day 02](../day-02/README.md) | [Day 04 →](../day-04/README.md)
