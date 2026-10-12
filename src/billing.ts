import { all, get, run } from "./db.js";
import { policy } from "./config.js";
import { createAndSendInvoice } from "./paypal.js";

// Demo "time travel": pretend preventedAfterDays passed with no dispute opened.
// Real deployment would confirm via the PayPal Disputes API / webhooks instead.
export function confirmPrevented() {
  const resolved = all(
    `SELECT o.* FROM orders o
     WHERE o.state = 'resolved' AND NOT EXISTS (SELECT 1 FROM outcomes x WHERE x.order_id = o.paypal_order_id)`,
  );
  for (const o of resolved) {
    const d = get("SELECT * FROM decisions WHERE order_id = ? AND status = 'executed' ORDER BY id DESC LIMIT 1", o.paypal_order_id);
    if (!d || d.risk == null || d.risk < 0.5) continue; // only bill for cases that were genuinely at risk
    run("INSERT INTO outcomes (order_id, fee, loss_avoided) VALUES (?,?,?)", o.paypal_order_id, policy.feePerPreventedEur, o.amount - o.refunded + policy.assumedDisputeCostEur);
  }
  return resolved.length;
}

export async function invoiceOutcomes(recipientEmail: string) {
  const rows = all("SELECT * FROM outcomes WHERE invoice_id IS NULL");
  if (rows.length === 0) throw new Error("Nothing to invoice");
  const inv = await createAndSendInvoice(rows.length, policy.feePerPreventedEur, `Pre-Dispute: ${rows.length} dispute(s) prevented`, recipientEmail);
  run("UPDATE outcomes SET invoice_id = ? WHERE invoice_id IS NULL", inv.id);
  return { ...inv, count: rows.length, total: rows.length * policy.feePerPreventedEur };
}

export function stats() {
  const o = get("SELECT COUNT(*) n, COALESCE(SUM(fee),0) fees, COALESCE(SUM(loss_avoided),0) avoided FROM outcomes")!;
  const r = get("SELECT COALESCE(SUM(refunded),0) refunded FROM orders")!;
  const open = get("SELECT COUNT(*) n, COALESCE(SUM(amount),0) at_risk FROM orders WHERE state = 'open'")!;
  const pending = get("SELECT COUNT(*) n FROM decisions WHERE status = 'pending'")!;
  return { prevented: o.n, fees: o.fees, estLossAvoided: o.avoided, refundedTotal: r.refunded, openOrders: open.n, openValue: open.at_risk, pendingApprovals: pending.n };
}
