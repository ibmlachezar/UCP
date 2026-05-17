# Day 09 — Catalog Search

**What I built:** Product discovery before purchase. Agents can now search your product catalogue and get full product details before creating a checkout. The complete flow is now: search → find → create checkout → update → pay.

**What I learned:** GET requests with query parameters (?q=suitcase), pagination (limit + offset), the difference between a standalone capability (catalog) vs an extension (fulfillment/discount), and the `checkout_hint` pattern that bridges catalog → checkout.

---

## The menu analogy

Before Day 9, agents had to know exactly what to buy before talking to your server. After Day 9, they can browse first — like reading a menu before opening a bar tab.

```
Day 9 flow:
  GET /catalog/search?q=suitcase     ← browse the menu
  GET /catalog/products/prod_abc     ← read the full item
  POST /checkout-sessions            ← open a tab with it
  PATCH /checkout-sessions/:id       ← fill in details
  POST /checkout-sessions/:id/complete ← pay
```

---

## Two endpoints

### Search
```
GET /ucp/v1/catalog/search?q=suitcase&in_stock=true&limit=10
```

| Parameter | What it does |
|-----------|-------------|
| `q` | Keyword — searches title, description, tags |
| `category` | Filter by category (luggage, bags, accessories) |
| `in_stock` | `true` = only show available items |
| `limit` | Max results (default 10, max 50) |
| `offset` | Skip N items (for pagination) |

### Product detail
```
GET /ucp/v1/catalog/products/prod_suitcase_carryon
```
Returns full product + `checkout_hint` showing exactly what to send in POST /checkout-sessions.

---

## Products in the catalogue

| ID | Title | Price | In stock |
|----|-------|-------|---------|
| prod_suitcase_carryon | Carry-On Suitcase | $265.50 | ✅ |
| prod_suitcase_large | Large Check-In Suitcase | $389.00 | ✅ |
| prod_backpack_travel | Travel Backpack 40L | $129.00 | ✅ |
| prod_packing_cubes | Packing Cube Set | $34.99 | ✅ |
| prod_luggage_scale | Digital Luggage Scale | $19.99 | ❌ |
| prod_travel_pillow | Memory Foam Travel Pillow | $24.99 | ✅ |

---

## New concept: standalone vs extension capability

| Type | Example | Parent needed? |
|------|---------|---------------|
| Standalone | `catalog` | No — available independently |
| Extension | `fulfillment` | Yes — extends `checkout` |
| Multi-parent extension | `discount` | Yes — extends `checkout` OR `cart` |

Catalog is standalone — no parent capability needed. An agent can search products without declaring checkout support.

---

## Run it

```bash
npm install && node server.js
```

```powershell
# Search for suitcases
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/catalog/search?q=suitcase&in_stock=true" | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 5

# Get product detail with checkout hint
Invoke-WebRequest -Uri "http://localhost:3000/ucp/v1/catalog/products/prod_suitcase_carryon" | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

---

[← Day 08](../day-08/README.md) | [Day 10 →](../day-10/README.md)