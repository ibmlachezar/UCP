# UCP Merchant — 90 Days of Building

Learning the [Universal Commerce Protocol](https://ucp.dev) by building something real every day. One feature per day. Every day's code works standalone. By Day 30 this is a fully working, tested, UCP-compliant merchant server.

**Goal:** Become a UCP expert by building a real merchant server from scratch.

---

## What is UCP?

The open standard that lets AI agents (Google Shopping, ChatGPT, voice assistants) complete purchases at any retailer — without custom integrations for every connection.

Before UCP: every agent needs a custom integration with every merchant. Thousands of bespoke connections. Impossible to scale.

After UCP: one standard. Any agent, any merchant. Like HTTP for commerce.

**Co-developed by:** Google, Shopify, Etsy, Wayfair, Target, Walmart  
**Endorsed by:** Stripe, Visa, Mastercard, PayPal, Adyen, Best Buy, Sephora, and 20+ others

---

## Progress

| Day | Feature built | What it teaches | Status |
|-----|--------------|-----------------|--------|
| [01](day-01/README.md) | `/.well-known/ucp` discovery endpoint | How agents find merchants without registration | ✅ |
| [02](day-02/README.md) | Capability negotiation engine | How both sides agree on what features are active | ✅ |
| [03](day-03/README.md) | `POST /checkout-sessions` | How an agent starts a purchase | ✅ |
| [04](day-04/README.md) | `PATCH /checkout-sessions/:id` | How agents fill in shipping + buyer info | ✅ |
| [05](day-05/README.md) | Fulfillment extension | How shipping options work in UCP | ✅ |
| [06](day-06/README.md) | `POST /complete` — take payment | The Trust Triangle and payment tokens | ✅ |
| [07](day-07/README.md) | End-to-end test suite | Spec compliance testing | ✅ |
| [08](day-08/README.md) | Discount extension | Multi-parent extensions | ✅ |
| [09](day-09/README.md) | Catalog search | Product discovery before purchase | ✅ |
| [10](day-10/README.md) | OAuth identity linking | Personalisation and loyalty groundwork | ✅ |
| [11](day-11/README.md) | Order webhooks | Real-time post-purchase updates | ✅ |
| 12 | HTTP Message Signatures | Cryptographic webhook verification | 🔜 |
| 10 | OAuth identity linking | Personalisation and loyalty groundwork | — |
| 11 | Order webhooks | Real-time post-purchase updates | — |
| 12 | HTTP Message Signatures | Cryptographic webhook verification | — |
| 13 | UCP health check CLI | Diagnose any merchant domain | — |
| 14 | Profile generator UI | Self-service merchant onboarding | — |
| 15 | Negotiation visualiser | Debug capability mismatches visually | — |
| ... | | | |
| 30 | Full conformance test suite | Validate any merchant domain | — |
| ... | | | |
| 60 | Working autonomous shopping agent | AI agent that buys things end-to-end | — |
| ... | | | |
| 90 | Portfolio complete | Full UCP merchant server with conformance suite | — |

---

## How this repo works

Each day is a **self-contained folder**. You can run any day independently:

```bash
cd day-01
npm install
node server.js
```

Every day builds on the concepts of the previous days — but the code is standalone so you can see exactly what was added each day without running a cumulative server.

---

## The learning structure

Each day has:
- Working code you can run immediately
- Comments explaining every decision
- A `README.md` explaining what was built and why it matters
- Tests where applicable

---

## Why this project

