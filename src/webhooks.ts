import { cfg } from "./config.js";
import { all, get, run } from "./db.js";
import { pp } from "./paypal.js";

const EVENT_TYPES = ["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.COMPLETED", "CUSTOMER.DISPUTE.CREATED", "INVOICING.INVOICE.PAID"];
let webhookId: string | null = null;

// Registers this server's URL with PayPal (idempotent: reuses an existing webhook for the same URL).
export async function ensureWebhook(baseUrl: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/webhooks/paypal`;
  const list = await pp("/v1/notifications/webhooks");
  const existing = (list.webhooks ?? []).find((w: any) => w.url === url);
  if (existing) { webhookId = existing.id; return { id: existing.id, url, created: false }; }
  const w = await pp("/v1/notifications/webhooks", { method: "POST", body: { url, event_types: EVENT_TYPES.map((name) => ({ name })) } });
  webhookId = w.id;
  return { id: w.id, url, created: true };
}

async function verified(raw: string, h: Record<string, string | string[] | undefined>) {
  if (process.env.WEBHOOK_SKIP_VERIFY === "true") return true; // local testing only
  if (!webhookId) return false;
  const g = (k: string) => String(h[k] ?? "");
  // Embed the raw body untouched; re-serializing it can break the signature.
  const body = `{"auth_algo":${JSON.stringify(g("paypal-auth-algo"))},"cert_url":${JSON.stringify(g("paypal-cert-url"))},"transmission_id":${JSON.stringify(g("paypal-transmission-id"))},"transmission_sig":${JSON.stringify(g("paypal-transmission-sig"))},"transmission_time":${JSON.stringify(g("paypal-transmission-time"))},"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${raw}}`;
  const res = await fetch(`${cfg.paypalBase}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenForVerify()}`, "Content-Type": "application/json" },
    body,
  });
  const j: any = await res.json().catch(() => ({}));
  return j.verification_status === "SUCCESS";
}

async function tokenForVerify() {
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const r = await fetch(`${cfg.paypalBase}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  return ((await r.json()) as any).access_token as string;
}

export async function handleWebhook(raw: string, headers: Record<string, string | string[] | undefined>) {
  const ok = await verified(raw, headers);
  if (!ok) return { status: 401, body: { error: "signature verification failed" } };
  const ev = JSON.parse(raw);
  if (get("SELECT 1 FROM events WHERE id = ?", ev.id)) return { status: 200, body: { duplicate: true } };

  let orderId: string | null = null;
  let summary = ev.summary ?? ev.event_type;

  if (ev.event_type === "PAYMENT.CAPTURE.REFUNDED") {
    const refundId = ev.resource?.id;
    const d = get("SELECT * FROM decisions WHERE paypal_ref = ?", refundId);
    if (d) { run("UPDATE decisions SET confirmed = 1 WHERE id = ?", d.id); orderId = d.order_id; summary = `Refund ${refundId} confirmed by PayPal`; }
  } else if (ev.event_type === "CUSTOMER.DISPUTE.CREATED") {
    const capId = ev.resource?.disputed_transactions?.[0]?.seller_transaction_id;
    const o = capId ? get("SELECT * FROM orders WHERE capture_id = ?", capId) : undefined;
    if (o) {
      run("UPDATE orders SET disputed = 1 WHERE paypal_order_id = ?", o.paypal_order_id);
      run("DELETE FROM outcomes WHERE order_id = ? AND invoice_id IS NULL", o.paypal_order_id); // never bill a dispute that happened
      orderId = o.paypal_order_id; summary = `Dispute opened on ${o.item}: not counted as prevented`;
    }
  }
  run("INSERT INTO events (id, type, summary, verified, order_id) VALUES (?,?,?,?,?)", ev.id, ev.event_type, summary, 1, orderId);
  return { status: 200, body: { ok: true } };
}

export const recentEvents = () => all("SELECT * FROM events ORDER BY ts DESC, rowid DESC LIMIT 20");
