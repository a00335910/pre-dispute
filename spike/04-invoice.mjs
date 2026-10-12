import { pp } from "./paypal.mjs";

const next = await pp("/v2/invoicing/generate-next-invoice-number", { method: "POST" });
console.log("next number", next.status, next.json?.invoice_number);

const draft = await pp("/v2/invoicing/invoices", {
  method: "POST",
  body: {
    detail: {
      invoice_number: next.json?.invoice_number,
      currency_code: "EUR",
      note: "Pre-Dispute: fee per dispute prevented (spike)",
    },
    primary_recipients: [{ billing_info: { email_address: "merchant-demo@example.com", name: { given_name: "Demo", surname: "Merchant" } } }],
    items: [{
      name: "Dispute prevented",
      quantity: "3",
      unit_amount: { currency_code: "EUR", value: "2.00" },
    }],
  },
});
console.log("create draft", draft.status, "debug", draft.debugId);
if (!draft.ok) { console.log(JSON.stringify(draft.json, null, 2)); process.exit(1); }
const id = draft.json.href.split("/").pop();
console.log("invoice id:", id);

const send = await pp(`/v2/invoicing/invoices/${id}/send`, { method: "POST", body: { send_to_recipient: false, send_to_invoicer: false } });
console.log("send", send.status, JSON.stringify(send.json));

const get = await pp(`/v2/invoicing/invoices/${id}`);
console.log("status:", get.json?.status, "due:", get.json?.amount?.value, get.json?.amount?.currency_code);
console.log("recipient view:", get.json?.links?.find((l) => l.rel === "invoice-ui-url" || l.rel === "recipient-view")?.href);
