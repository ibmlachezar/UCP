# Day 01 — UCP Discovery Endpoint

**What I built:** A Node.js server that serves a valid UCP merchant profile at `/.well-known/ucp`.

**What I learned:** How UCP's permissionless discovery works. Before an AI agent can do anything with a merchant — search products, create a checkout, take payment — it first asks: *"What can you do?"* That answer lives at `/.well-known/ucp`. The path is fixed by the spec so any agent discovers any merchant without prior registration.

---

## The concept

```
AI Agent  →  GET /.well-known/ucp  →  Your server
                                    ←  Profile JSON
```

The agent now knows: which UCP version you speak, where your API lives, what you can do (capabilities), which payment methods you accept, your public key for verifying your messages.

All from one endpoint. No registration. No API keys. No setup calls.

---

## Run it

```bash
npm install
node server.js

# Test the discovery endpoint
curl http://localhost:3000/.well-known/ucp
```

## What the profile declares

| Field | What it tells agents |
|---|---|
| `ucp.version` | Which spec version this merchant speaks |
| `ucp.services` | Where the API lives and which transport (REST/MCP) |
| `ucp.capabilities` | What the merchant can DO — checkout only for now |
| `payment_handlers` | Which payment methods are accepted |
| `signing_keys` | Public key to verify signed messages from this merchant |

## Why Cache-Control matters

`Cache-Control: public, max-age=60` is required by the spec. Without it, every API call an agent makes triggers a fresh profile fetch. At Google Shopping scale that's millions of wasted requests per minute.

---

## What's next

[Day 02 →](../day-02/README.md) — The capability negotiation engine: the algorithm that decides what each agent can do based on what both sides support.
