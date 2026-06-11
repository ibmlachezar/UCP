# Day 14 — Profile Generator UI

**What I built:** A single-file web app where any merchant fills in a form and downloads a valid `merchant.json`. No JSON knowledge required. No spec reading required. Just fill in the fields and click download.

**What I learned:** How to make the UCP spec accessible to non-technical users. The generator validates in real-time, shows a compliance score, and prevents common mistakes (like accidentally putting a private key in the profile).

---

## How to use it

Open `ucp-profile-generator.html` in any browser. No server needed. No npm install. Just double-click.

Fill in 5 sections:
1. **Merchant basics** — name, domain, API endpoint
2. **Capabilities** — toggle which features you support
3. **Payment handlers** — Google Pay, Apple Pay, Stripe
4. **Signing keys** — your public key coordinates for webhook verification
5. **Caching** — how long agents should cache the profile

Click **Download merchant.json** → save the file → serve it at `/.well-known/ucp`.

---

## What it generates

A fully spec-compliant `merchant.json` with:
- `ucp.version` — the version you selected
- `ucp.services` — your API endpoint
- `ucp.capabilities` — everything you toggled on, with correct `extends` relationships
- `ucp.payment_handlers` — configured payment methods
- `signing_keys` — your public key in JWK format

---

## The security warning

The generator includes a warning: **never put your private key in the profile**. The `d` parameter in a JWK is the private key. It must never appear in `signing_keys`. The generator only asks for `x` and `y` (public coordinates) and shows a warning explaining why.

This is the same check the Day 13 health check CLI performs — if it finds a `d` parameter in signing_keys, it flags it as a critical security failure.

---

## Connection to the full build

The profile generator is the onboarding tool for everything Days 1–13 built. A merchant fills in this form once. The downloaded `merchant.json` is what agents discover at `/.well-known/ucp`. The capabilities declared here determine what the negotiation engine (Day 2) can activate. The signing_keys here are what agents use to verify webhooks (Days 11–12).

---

[← Day 13](../day-13/README.md) | [Day 15 →](../day-15/README.md)
