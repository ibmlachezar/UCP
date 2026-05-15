# Day 02 — Capability Negotiation Engine

**What I built:** The algorithm that runs on every UCP API call — it reads which agent is calling, fetches their capability list, computes the overlap with the merchant's capabilities, and responds with only what both sides support.

**What I learned:** The "server-selects" negotiation model — how UCP lets merchants add new features without breaking old agents, and how agents can support advanced features without requiring every merchant to have them.

---

## The concept

Every agent sends a `UCP-Agent` header pointing to its own profile. The merchant fetches that profile and computes the intersection:

```
Agent declares:    checkout, fulfillment, discount
Merchant declares: checkout

→ Active this session: checkout only
  (fulfillment + discount silently excluded — merchant doesn't have them yet)
```

No errors. No crashes. Clean, safe overlap. Old agents keep working when you add new capabilities tomorrow.

---

## The 4-step algorithm

```
1. Read UCP-Agent header  →  get platform profile URL
2. Fetch platform profile →  get their capability list
3. Intersect by name      →  keep only what both sides declare
   + version select       →  pick highest shared version
4. Prune extensions       →  remove any child whose parent didn't survive
   (repeat until stable)
```

**Key rule for extensions:** `fulfillment` extends `checkout`. If checkout gets removed, fulfillment gets removed too — automatically, in the pruning step. You can't have a child without its parent.

---

## Run it

```bash
npm install

# Run the tests first — 14 tests, all should pass
npm test

# Start the server
node server.js

# Test 1: no agent header — returns all merchant capabilities
curl http://localhost:3000/negotiate

# Test 2: with agent header — runs the real intersection
# PowerShell:
Invoke-WebRequest -Uri "http://localhost:3000/negotiate" `
  -Headers @{"UCP-Agent" = 'profile="http://localhost:3000/test-platform-profile"'} `
  | Select-Object -ExpandProperty Content
```

## Files added today

| File | What it does |
|---|---|
| `lib/negotiation.js` | The negotiation engine — 4-step intersection algorithm |
| `profiles/platform-test.json` | A mock agent profile to test against locally |
| `tests/negotiation.test.js` | 14 unit tests covering all edge cases |

## Test cases covered

- Both sides have the same capability → survives
- Merchant has it, agent doesn't → removed
- Agent has it, merchant doesn't → removed
- Both have it but different versions → removed (no shared version)
- Both have it, multiple versions → highest shared version wins
- Extension with parent present → survives
- Extension with parent missing → pruned
- Multi-parent extension (extends A + B), one parent survives → extension survives
- Chain pruning: grandparent missing → parent pruned → grandchild pruned

---

## Connection to Partha's team

This algorithm runs on every single API call for every UCP merchant in the world. Partha's team debugs it when merchants report "I added a capability but agents aren't using it." Understanding why capabilities get pruned — version mismatch vs missing declaration vs orphaned extension — is how you diagnose those integration failures.

---

[← Day 01](../day-01/README.md) | [Day 03 →](../day-03/README.md)
