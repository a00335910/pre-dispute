import { pp } from "./paypal.mjs";

const r = await pp("/v2/checkout/orders", {
  method: "POST",
  requestId: `spike-${Date.now()}`,
  body: {
    intent: "CAPTURE",
    purchase_units: [{ amount: { currency_code: "EUR", value: "45.00" }, description: "Pre-Dispute spike order" }],
    payment_source: { paypal: { experience_context: {
      return_url: "http://localhost:3000/return", cancel_url: "http://localhost:3000/cancel",
      user_action: "PAY_NOW",
    } } },
  },
});
console.log("status", r.status, "debug", r.debugId);
if (!r.ok) { console.log(JSON.stringify(r.json, null, 2)); process.exit(1); }
console.log("order id:", r.json.id, "state:", r.json.status);
console.log("approve:", r.json.links.find((l) => ["approve", "payer-action"].includes(l.rel))?.href);
