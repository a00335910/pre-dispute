import { pp } from "./paypal.mjs";
const [captureId, amount = "5.00"] = process.argv.slice(2);
const r = await pp(`/v2/payments/captures/${captureId}/refund`, {
  method: "POST",
  requestId: `refund-${captureId}-${amount}`,
  body: {
    amount: { value: amount, currency_code: "EUR" },
    note_to_payer: "Goodwill refund for the delayed delivery",
    invoice_id: `PD-${captureId}-${amount}`,
  },
});
console.log("http", r.status, "debug", r.debugId);
console.log(JSON.stringify(r.json, null, 2));
