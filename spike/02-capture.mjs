import { pp } from "./paypal.mjs";
const orderId = process.argv[2];
const r = await pp(`/v2/checkout/orders/${orderId}/capture`, { method: "POST", requestId: `cap-${orderId}` });
console.log("http", r.status, "debug", r.debugId);
if (!r.ok) { console.log(JSON.stringify(r.json, null, 2)); process.exit(1); }
const cap = r.json.purchase_units[0].payments.captures[0];
console.log("order:", r.json.status);
console.log("capture id:", cap.id, "status:", cap.status, cap.amount.value, cap.amount.currency_code);
console.log("fee:", cap.seller_receivable_breakdown?.paypal_fee?.value, "net:", cap.seller_receivable_breakdown?.net_amount?.value);
