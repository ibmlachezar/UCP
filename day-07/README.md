# Day 07 — End-to-End Test Suite

**What I built:** One test file that drives the complete purchase flow automatically — discover → negotiate → create → update → pay → verify order. Like a restaurant health inspector who runs through the entire customer experience from start to finish.

**What I learned:** The difference between unit tests (testing one function in isolation) and E2E tests (testing the whole system as one connected piece). E2E tests prove that everything works together — not just individually.

---

## The health inspector analogy

A health inspector doesn't just check the kitchen in isolation. They run the full customer experience:

1. Read the menu sign — `GET /.well-known/ucp`
2. Agree on what's available — capability negotiation via UCP-Agent header
3. Place an order — `POST /checkout-sessions`
4. Fill in delivery details — `PATCH /checkout-sessions/:id`
5. Pay the bill — `POST /checkout-sessions/:id/complete`
6. Get the receipt — verify `order_id` returned

If any step fails, the whole experience is broken.

---

## What the tests cover

| Group | Tests |
|-------|-------|
| Happy path | Full journey completes, order has correct data, express shipping adds 999, two purchases get unique IDs |
| Payment paths | tok_3ds triggers requires_escalation + continue_url, tok_decline is unrecoverable |
| Capability negotiation | Fulfillment appears with UCP-Agent, checkout works without UCP-Agent |
| Spec compliance | Cache-Control headers, Content-Type, ucp.capabilities always present, double payment blocked, 404 for unknown IDs |

**13 tests. All passing.**

---

## Run it

```bash
npm install
node server.js
# In a second terminal:
node tests/e2e.test.js
```

---

## Files in this folder

Every file from Day 6 is carried forward, plus:

| File | What's new |
|------|-----------|
| `tests/e2e.test.js` | **NEW** — the full end-to-end test suite |

---

## Connection to Partha's team

E2E tests are what Partha's team runs against every merchant integration before it goes live. If your implementation passes the full flow — discovery, negotiation, checkout lifecycle, payment — you're spec-compliant. This test suite is the foundation of the Day 30 conformance checker that can validate any merchant domain.

---

[← Day 06](../day-06/README.md) | [Day 08 →](../day-08/README.md)
