import { pp } from "./paypal.mjs";
const r = await pp(`/v2/checkout/orders/${process.argv[2]}`);
console.log("http", r.status, "order status:", r.json?.status, "payer:", r.json?.payer ? "present" : "none");
