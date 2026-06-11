# Day 15 — Negotiation Visualiser

**What I built:** A single-file web tool that runs the exact negotiation algorithm from `lib/negotiation.js` visually. Paste an agent profile and a merchant profile, click Run, and watch intersect + prune happen step by step — with the reason every capability was kept, dropped, or pruned.

**What I learned:** The negotiation algorithm becomes obvious when you can SEE it. Especially the multi-pass pruning cascade — removing one parent can orphan a grandchild on the NEXT pass, which is why pruning is a while-loop and not a single sweep.

---

## How to use it

Open `ucp-negotiation-visualiser.html` in any browser. No server. No install.

1. Pick a preset scenario (or paste your own profiles)
2. Click **Run negotiation**
3. Read the three result panels

---

## The four preset scenarios

| Preset | What it demonstrates |
|--------|---------------------|
| ✅ Perfect match | Both sides identical → everything survives |
| ⛓️ Chained pruning | Agent lacks `checkout` → `fulfillment` orphaned → `loyalty` orphaned on the next pass. The cascade takes 2 passes. |
| 🎟️ Discount OR rule | Agent lacks `cart`, but `discount` extends `checkout` OR `cart` → survives via the one living parent |
| 🔢 Version mismatch | Agent has checkout at two versions → highest shared picked. Catalog has NO shared version → dropped despite both declaring it |

---

## What the output shows

**The picture** — three columns: what the agent declares, the negotiated intersection, what the merchant declares. Faded + struck-through items didn't survive.

**Step 1: Intersect** — a table of every capability from either side: in agent? in merchant? shared version? KEEP or DROP, and exactly why.

**Step 2: Prune** — every pass of the while-loop, showing what got pruned in each pass and which parents it needed. When a cascade happens you see it take multiple passes.

**Final active set** — what the session can actually do. If it's empty, the agent and merchant cannot transact at all.

---

## The algorithm (mirrored exactly from lib/negotiation.js)

```
1. intersectCapabilities(merchant, agent)
   - keep only capabilities BOTH declare
   - pick the HIGHEST shared version
   - no shared version → drop entirely

2. pruneOrphanedExtensions(result)
   - while (anything changed):
       for each capability with extends:
         parents = extends (string or array)
         if NO parent is alive → delete (multi-parent = OR rule)
```

---

## Why this tool matters

Capability mismatch is the #1 integration debugging problem in UCP. When an agent says "I can't see your discount capability," this tool answers WHY in seconds: was it dropped in intersection (version mismatch? not declared?) or pruned (parent missing?). Paste both profiles, run, read the reason column.

---

[← Day 14](../day-14/README.md) | [Day 16 →](../day-16/README.md)
