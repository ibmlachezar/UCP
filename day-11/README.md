# Day 11 — Order Webhooks

**What I built:** Real-time order updates pushed from merchant to agent. After a purchase completes, the merchant fires signed webhook events as the order progresses: processing → shipped → out_for_delivery → delivered.

**The Day 1 connection:** The `signing_keys` declared in the merchant profile on Day 1 are what agents use to verify webhook authenticity. Today those keys finally get used.

---

## The text message analogy

After you leave the bar, they text you updates:
- "Your order is being prepared" → `order.processing`
- "Your order has shipped" → `order.shipped`
- "Your order is out for delivery" → `order.out_for_delivery`
- "Your order has arrived" → `order.delivered`

Each text has an official stamp (HMAC signature). You verify it against the merchant's public key from their profile.

---

## Why webhooks instead of polling

| Polling (old way) | Webhooks (Day 11) |
|-------------------|-------------------|
| Agent calls GET /orders/:id every 30 seconds | Merchant calls agent's URL when status changes |
| Hundreds of wasted requests | Zero wasted requests |
| Delays between status change and agent knowing | Instant notification |
| Agent drives the conversation | Merchant drives the update |

---

## The full order lifecycle

```
Purchase complete (Day 6) → order.processing
     ↓
POST /orders/:id/advance  → order.shipped + tracking number
     ↓
POST /orders/:id/advance  → order.out_for_delivery
     ↓
POST /orders/:id/advance  → order.delivered (final state)
```

---

## Webhook signature verification

Every webhook payload includes a signature in the `X-UCP-Signature` header:
```
X-UCP-Signature: sha256=abc123...
```

Agents verify it by:
1. Taking the raw webhook body
2. Computing HMAC-SHA256 using the merchant's public key (from signing_keys in profile)
3. Comparing against the header value

If they don't match → webhook is fake, discard it.

---

## New endpoints

| Endpoint | What it does |
|----------|-------------|
| `POST /ucp/v1/webhooks/register` | Agent registers callback URL for order updates |
| `POST /ucp/v1/orders/:id/advance` | Advance order to next status, fires webhook |
| `GET /ucp/v1/orders/:id` | Get order status + event history |
| `GET /ucp/v1/webhooks/log/:orderId` | Full webhook event log |
| `POST /ucp/v1/webhooks/verify` | Test signature verification |

---

## Files added today

| File | What it does |
|------|-------------|
| `lib/webhooks.js` | Build, sign, dispatch webhook payloads. Status lifecycle. |
| `routes/webhooks.js` | All webhook + order status endpoints |

---

## Run it

```bash
npm install && node server.js
```

```powershell
# 1. Create a checkout and complete it (get order_id from response)
# 2. Register a webhook URL
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/webhooks/register" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"order_id":"YOUR_ORDER_ID","webhook_url":"http://localhost:3001/updates"}' | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 3

# 3. Advance the order (fires webhook)
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/orders/YOUR_ORDER_ID/advance" -Method POST | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 5

# 4. Check order status and event history
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/orders/YOUR_ORDER_ID" | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

---

[← Day 10](../day-10/README.md) | [Day 12 →](../day-12/README.md)
