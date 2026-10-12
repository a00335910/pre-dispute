# Sandbox spike results (2026-10-08)

Account: Business sandbox (IE), currency EUR. Scripts in `spike/`, run with
`node --env-file=.env spike/<script>.mjs`.

| Step | Endpoint | Result |
|---|---|---|
| Token | `POST /v1/oauth2/token` | OK |
| Create order | `POST /v2/checkout/orders` (intent CAPTURE, payment_source.paypal) | OK, `PAYER_ACTION_REQUIRED` until buyer approves |
| Buyer approval | manual, Personal sandbox account at `checkoutnow?token=` | OK. Using the Business (payee) account gives "logging in to the account of the seller" |
| Capture | `POST /v2/checkout/orders/{id}/capture` | OK, 45.00 EUR, fee 1.88 |
| Partial refund | `POST /v2/payments/captures/{id}/refund` | OK, 5.00 EUR, COMPLETED (no 500 seen) |
| Invoice | `POST /v2/invoicing/invoices` then `/send` | OK, status UNPAID, payer-view link returned |
| List disputes | `GET /v1/customer/disputes` | OK, empty list |

## Not yet verified
- Webhooks (needs a public URL)
- Creating a dispute (needs a second Business sandbox account as buyer)

## Gotchas
- Use `PayPal-Request-Id` for idempotency on create/capture/refund.
- Hosted sandbox MCP (`mcp.sandbox.paypal.com/sse`) is reported broken; call REST directly.
