// Minimal PayPal REST helper for the sandbox spike
const BASE = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";

export async function token() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token ${res.status}: ${JSON.stringify(body)}`);
  return body.access_token;
}

export async function pp(path, { method = "GET", body, requestId } = {}) {
  const t = await token();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, ok: res.ok, json, debugId: res.headers.get("paypal-debug-id") };
}
