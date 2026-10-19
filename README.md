# Pre-Dispute

An AI agent that fixes problems **before** a buyer opens a PayPal dispute, and bills the merchant only when it works.

Built for the PayPal AI Hackathon. Everything runs against the PayPal **sandbox** with fake data.

**Live demo:** https://pre-dispute.onrender.com (free plan, the first load can take ~30 seconds)

## Try it in 60 seconds
1. Open the live demo and click **Reset demo data** (creates 5 real, captured sandbox orders).
2. Select **Ceramic coffee set**, choose *Worried buyer*, click **1 · Send buyer message**, then **2 · Run AI agent**. A small goodwill refund runs automatically.
3. Select **USB-C dock**, choose *Angry, threatens a dispute*, repeat. The case lands in **Waiting for your approval**. Click **Approve** to run the refund on PayPal.
4. Click **Fast-forward 14 days**, then **Create PayPal invoice**.

No login is needed.

## The problem
When an order goes wrong (late shipment, silence, a worried buyer), merchants usually find out when a dispute or chargeback lands. By then the fix is expensive. Pre-Dispute watches paid orders, spots rising dispute risk, and picks the cheapest fix while the buyer is still reachable.

## How it works
```
Paid PayPal order -> buyer signal (delay, worried message)
        |
        v
Gemini agent proposes: notify | partial_refund | reship | full_refund
        |
        v
Policy engine (deterministic, the LLM cannot override):
  - refunds <= 10 EUR and <= 30% of the order, risk < 0.8  -> runs automatically
  - anything bigger, any reship, any high-risk case        -> merchant approval queue
        |
        v
PayPal Refunds API executes; the decision, reason and buyer message are logged
        |
        v
Outcome billing: after 14 quiet days a case counts as a prevented dispute;
prevented disputes are netted into ONE PayPal Invoice (pay only when it works)
```

The AI proposes; rules and the merchant decide. The agent is never told the approval limits, and it is told not to invent delivery dates or carrier facts.

## PayPal APIs used
- Orders v2: create and capture sandbox orders (seed data)
- Payments v2: refunds, with idempotency keys so retries cannot double-refund
- Invoicing v2: generate-next-invoice-number, create, send (outcome-based fee invoice)

## AI used
- Google Gemini (free tier) via the Gemini API for case reasoning, returning schema-validated JSON (zod). Retries with backoff and a fallback model handle free-tier 429/503s.

## Run it locally
Requirements: Node 24+ (uses the built-in `node:sqlite`), a PayPal developer account, a Google AI Studio API key.

1. In the PayPal Developer Dashboard create a sandbox **Business** account and a REST app for it (Apps & Credentials -> Sandbox).
2. Copy `.env.example` to `.env` and fill in `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `LLM_API_KEY`.
3. Install and start:
   ```
   npm install
   npm run dev            # http://localhost:3000
   ```
   On first start with an empty database the app creates 5 sandbox orders, paid and captured with PayPal's test card, so no browser approval is needed. Use **Reset demo data** in the dashboard to get a fresh set.
4. In the dashboard: select an order, click **Simulate delay + worried buyer**, then **Run agent on selected**. Approve or reject anything in the queue. Click **Fast-forward 14 days**, then **Create PayPal invoice**.

## Deploy on Render
`render.yaml` defines the service. Connect the repo in Render, then set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `LLM_API_KEY` in the dashboard. The free tier has no persistent disk, so the SQLite file lives in `/tmp` and the demo data re-seeds on each restart.

## Webhooks
When the server has a public URL (`PUBLIC_URL`, or Render's `RENDER_EXTERNAL_URL`) it registers `/api/webhooks/paypal` with PayPal at boot for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.CREATED` and `INVOICING.INVOICE.PAID`.
- Every event is checked with PayPal's `verify-webhook-signature` API. Unsigned or forged events get a 401.
- A refund event confirms the matching decision in the dashboard. A dispute event marks the order disputed and removes it from billing, so a dispute that actually happened is never invoiced as "prevented".
- Sandbox webhook delivery can lag by several minutes. Until a refund event arrives the dashboard shows "Awaiting PayPal webhook".
- For local testing without a public URL, set `WEBHOOK_SKIP_VERIFY=true` and post sample events yourself. Never set it in production.

## AI availability
The Gemini free tier has small per-model daily quotas. The agent tries the configured models in order (`LLM_MODEL`, then `LLM_FALLBACK_MODEL`, a comma-separated list), remembers which ones are exhausted, and as a last resort uses a deterministic rules fallback. Fallback decisions are labelled "Rules fallback (AI unavailable)" in the decision reasoning, so they are never mistaken for the AI. A paid Gemini key removes the quota concern.

## Limits and honesty
- "Prevented" is simulated by the fast-forward button. A production version would confirm with the PayPal Disputes API and webhooks.
- Shipping and buyer messages are simulated; there is no carrier integration.
- "Estimated saved vs. losing the dispute" compares the agent outcome to the worst case where the buyer wins a dispute (order value plus an assumed 15 EUR dispute cost, minus any refund we paid). A full refund therefore saves little; a small goodwill refund saves a lot. It is illustrative, not accounting.
- Sandbox only. Do not point this at live credentials.

## License
MIT

## Repo layout
- `src/` - server, agent, policy engine, PayPal client, billing
- `public/` - dashboard (AG Grid)
- `spike/` and `SPIKE.md` - early sandbox experiments and what worked, kept for reference
