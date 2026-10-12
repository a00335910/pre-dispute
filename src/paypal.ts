import { cfg } from "./config.js";

let cached: { token: string; exp: number } | null = null;

async function token() {
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch(`${cfg.paypalBase}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(`PayPal auth ${res.status}: ${j.error_description ?? j.error}`);
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

export async function pp(path: string, opts: { method?: string; body?: unknown; requestId?: string } = {}) {
  const res = await fetch(`${cfg.paypalBase}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      ...(opts.requestId ? { "PayPal-Request-Id": opts.requestId } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const json: any = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`PayPal ${res.status} (debug ${res.headers.get("paypal-debug-id")}): ${JSON.stringify(json?.details ?? json?.message ?? json)}`);
  return json;
}

export const createOrder = (amount: string, description: string, requestId: string) =>
  pp("/v2/checkout/orders", {
    method: "POST", requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: cfg.currency, value: amount }, description }],
      payment_source: { paypal: { experience_context: {
        return_url: `http://localhost:${cfg.port}/return`, cancel_url: `http://localhost:${cfg.port}/cancel`, user_action: "PAY_NOW",
      } } },
    },
  });

export const getOrder = (id: string) => pp(`/v2/checkout/orders/${id}`);
export const captureOrder = (id: string) => pp(`/v2/checkout/orders/${id}/capture`, { method: "POST", requestId: `cap-${id}` });

export const refundCapture = (captureId: string, amount: string, note: string, requestId: string) =>
  pp(`/v2/payments/captures/${captureId}/refund`, {
    method: "POST", requestId,
    body: { amount: { value: amount, currency_code: cfg.currency }, note_to_payer: note.slice(0, 255) },
  });

export async function createAndSendInvoice(quantity: number, unitFee: number, note: string, recipientEmail: string) {
  const next = await pp("/v2/invoicing/generate-next-invoice-number", { method: "POST" });
  const draft = await pp("/v2/invoicing/invoices", {
    method: "POST",
    body: {
      detail: { invoice_number: next.invoice_number, currency_code: cfg.currency, note },
      primary_recipients: [{ billing_info: { email_address: recipientEmail } }],
      items: [{ name: "Dispute prevented", quantity: String(quantity), unit_amount: { currency_code: cfg.currency, value: unitFee.toFixed(2) } }],
    },
  });
  const id = String(draft.href).split("/").pop()!;
  const sent = await pp(`/v2/invoicing/invoices/${id}/send`, { method: "POST", body: { send_to_recipient: false, send_to_invoicer: false } });
  return { id, payerView: sent.href as string };
}

// Sandbox only: pays with PayPal's generic test card so the server can seed captured orders without a browser approval.
export async function createCapturedCardOrder(amount: string, description: string, requestId: string) {
  const o = await pp("/v2/checkout/orders", {
    method: "POST", requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: cfg.currency, value: amount }, description }],
      payment_source: { card: {
        number: "4111111111111111", expiry: "2030-12", security_code: "123", name: "Demo Buyer",
        billing_address: { address_line_1: "1 Main St", admin_area_2: "Dublin", postal_code: "D01 F5P2", country_code: "IE" },
      } },
    },
  });
  const captureId = o.purchase_units?.[0]?.payments?.captures?.[0]?.id as string | undefined;
  if (o.status !== "COMPLETED" || !captureId) throw new Error(`Card order not captured (status ${o.status})`);
  return { orderId: o.id as string, captureId };
}
