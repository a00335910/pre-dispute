import express from "express";
import { z } from "zod";
import { all, get, run } from "./db.js";
import { cfg } from "./config.js";
import { executeDecision, runAgent } from "./agent.js";
import { hasOrders, resetAndSeed, seedDemoOrders } from "./demo.js";
import { ensureWebhook, handleWebhook, recentEvents } from "./webhooks.js";
import { confirmPrevented, invoiceOutcomes, stats } from "./billing.js";

const app = express();
app.post("/api/webhooks/paypal", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  try {
    const r = await handleWebhook(req.body.toString("utf8"), req.headers);
    res.status(r.status).json(r.body);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.use(express.json());
app.use(express.static(new URL("../public", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));

const wrap = (fn: (req: express.Request) => Promise<unknown> | unknown): express.RequestHandler =>
  async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  };

app.get("/api/orders", wrap(() => all(`
  SELECT o.*, (SELECT action FROM decisions d WHERE d.order_id = o.paypal_order_id ORDER BY id DESC LIMIT 1) last_action,
         (SELECT risk FROM decisions d WHERE d.order_id = o.paypal_order_id ORDER BY id DESC LIMIT 1) risk
  FROM orders o WHERE state != 'awaiting_approval' ORDER BY o.created_at DESC`)));
app.get("/api/decisions", wrap(() => all("SELECT * FROM decisions ORDER BY id DESC LIMIT 50")));
app.get("/api/messages/:id", wrap((r) => all("SELECT * FROM messages WHERE order_id = ? ORDER BY id", r.params.id)));
app.get("/api/events", wrap(() => recentEvents()));
app.get("/api/stats", wrap(() => stats()));

const Delay = z.object({ days: z.number().int().min(1).max(60), message: z.string().min(1).max(500) });
app.post("/api/orders/:id/delay", wrap((r) => {
  const b = Delay.parse(r.body);
  if (!get("SELECT 1 FROM orders WHERE paypal_order_id = ? AND state = 'open'", r.params.id)) throw new Error("Open order not found");
  run("UPDATE orders SET shipping_status = 'delayed', days_late = ? WHERE paypal_order_id = ?", b.days, r.params.id);
  run("INSERT INTO messages (order_id, sender, body) VALUES (?,?,?)", r.params.id, "buyer", b.message);
  return { ok: true };
}));
app.post("/api/orders/:id/run-agent", wrap((r) => limited(() => runAgent(String(r.params.id)))()));
app.post("/api/decisions/:id/approve", wrap((r) => executeDecision(Number(r.params.id))));
app.post("/api/decisions/:id/reject", wrap((r) => {
  run("UPDATE decisions SET status = 'rejected' WHERE id = ? AND status = 'pending'", Number(r.params.id));
  return { ok: true };
}));
// Public demo: cap how often the costly endpoints (LLM + PayPal) can be hit.
const hits: number[] = [];
const limited = (fn: () => Promise<unknown> | unknown) => () => {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 20) throw new Error("Demo rate limit reached, try again in a minute");
  hits.push(now);
  return fn();
};
app.post("/api/demo/reset", wrap(limited(async () => ({ created: await resetAndSeed() }))));
app.post("/api/time-travel", wrap(() => ({ confirmed: confirmPrevented() })));
app.post("/api/billing/invoice", wrap(() => invoiceOutcomes("merchant-demo@example.com")));

app.listen(cfg.port, async () => {
  console.log(`Pre-Dispute running on port ${cfg.port}`);
  const publicUrl = process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (publicUrl) {
    try { const w = await ensureWebhook(publicUrl); console.log(`Webhook ${w.created ? "registered" : "already registered"}: ${w.url}`); }
    catch (e: any) { console.error("Webhook registration failed:", e.message); }
  }
  if (process.env.DEMO_AUTOSEED !== "false" && !hasOrders()) {
    try { console.log(`Seeded ${await seedDemoOrders()} demo orders`); }
    catch (e: any) { console.error("Auto-seed failed:", e.message); }
  }
});
