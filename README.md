# Pre-Dispute

An AI agent that fixes problems **before** a buyer opens a PayPal dispute, and bills the merchant only when it works.

Built for the PayPal AI Hackathon. Everything runs against the PayPal **sandbox** with fake data.

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

## Limits and honesty
- "Prevented" is simulated by the fast-forward button. A production version would confirm with the PayPal Disputes API and webhooks.
- Shipping and buyer messages are simulated; there is no carrier integration.
- "Estimated loss avoided" is an illustrative figure (remaining order value plus an assumed 15 EUR dispute cost).
- Sandbox only. Do not point this at live credentials.

## License
MIT

## Repo layout
- `src/` - server, agent, policy engine, PayPal client, billing
- `public/` - dashboard (AG Grid)
- `spike/` and `SPIKE.md` - early sandbox experiments and what worked, kept for reference
