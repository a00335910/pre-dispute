import { all, get, run, type Row } from "./db.js";
import { askGemini } from "./llm.js";
import { evaluate } from "./policy.js";
import { policy } from "./config.js";
import { refundCapture } from "./paypal.js";

function buildPrompt(order: Row, msgs: Row[]) {
  const thread = msgs.map((m) => `${m.sender}: ${m.body}`).join("\n") || "(no messages)";
  return `You are a dispute-prevention agent for a small online merchant. A buyer may open a PayPal dispute if this goes badly.
Pick the cheapest action that keeps the buyer happy. Respond ONLY with JSON:
{"action": "notify|partial_refund|reship|full_refund|no_action", "refund_amount": number (EUR, 0 unless refunding), "risk": number 0-1 (chance of a dispute if we do nothing), "reason": string, "message_to_buyer": string (short, polite)}

Order: ${order.item}, ${order.amount} EUR, already refunded ${order.refunded} EUR, buyer ${order.buyer_name}.
Shipping: ${order.shipping_status}, ${order.days_late} day(s) late.
Guidance: for a short delay with a calm buyer, a status message is enough. Moderate delays or an upset buyer justify a goodwill refund sized to the order value. Severe cases (long delay, dispute threat) justify a larger refund or a full refund. Propose what is genuinely best for keeping this buyer; the merchant has separate rules that decide what runs without approval, so do not limit yourself.
IMPORTANT: you only know the facts above. Never invent delivery dates, carrier names, tracking results or actions you cannot verify. If you need to say something about timing, say you are checking with the carrier and will follow up.
Conversation:
${thread}`;
}

export async function runAgent(orderId: string) {
  const order = get("SELECT * FROM orders WHERE paypal_order_id = ?", orderId);
  if (!order) throw new Error("Order not found");
  if (order.state !== "open") throw new Error(`Order is ${order.state}, not open`);

  const msgs = all("SELECT * FROM messages WHERE order_id = ? ORDER BY id", orderId);
  const proposal = await askGemini(buildPrompt(order, msgs));
  const v = evaluate(order, proposal);

  const reason = [proposal.reason, ...v.notes].join(" | ");
  const res = run(
    `INSERT INTO decisions (order_id, action, amount, risk, reason, message_to_buyer, verdict, status) VALUES (?,?,?,?,?,?,?,?)`,
    orderId, v.action, v.amount, proposal.risk, reason, proposal.message_to_buyer, v.verdict, "pending",
  );
  const decisionId = Number(res.lastInsertRowid);
  if (v.verdict === "auto") await executeDecision(decisionId);
  return get("SELECT * FROM decisions WHERE id = ?", decisionId)!;
}

export async function executeDecision(decisionId: number) {
  const d = get("SELECT * FROM decisions WHERE id = ?", decisionId);
  if (!d || d.status !== "pending") throw new Error("Decision is not pending");
  const order = get("SELECT * FROM orders WHERE paypal_order_id = ?", d.order_id)!;

  try {
    let ref: string | null = null;
    if (d.amount > 0 && (d.action === "partial_refund" || d.action === "full_refund")) {
      const r = await refundCapture(order.capture_id, d.amount.toFixed(2), d.message_to_buyer ?? "Refund", `pd-${order.capture_id}-${d.id}-${d.amount.toFixed(2)}`);
      ref = r.id;
      run("UPDATE orders SET refunded = refunded + ? WHERE paypal_order_id = ?", d.amount, order.paypal_order_id);
    }
    if (d.message_to_buyer && d.action !== "no_action") {
      run("INSERT INTO messages (order_id, sender, body) VALUES (?,?,?)", d.order_id, "agent", d.message_to_buyer);
    }
    run("UPDATE decisions SET status = 'executed', paypal_ref = ? WHERE id = ?", ref, decisionId);
    if (d.action !== "no_action") run("UPDATE orders SET state = 'resolved' WHERE paypal_order_id = ?", d.order_id);
  } catch (e: any) {
    run("UPDATE decisions SET status = 'failed', reason = reason || ' | ' || ? WHERE id = ?", String(e.message).slice(0, 300), decisionId);
    throw e;
  }
  return get("SELECT * FROM decisions WHERE id = ?", decisionId)!;
}
