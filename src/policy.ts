import { policy } from "./config.js";
import type { Proposal } from "./llm.js";
import type { Row } from "./db.js";

export interface Verdict {
  verdict: "auto" | "needs_approval";
  action: Proposal["action"];
  amount: number;
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Deterministic guardrails. The LLM only proposes; this decides what may run unattended.
export function evaluate(order: Row, p: Proposal): Verdict {
  const refundable = round2(order.amount - order.refunded);
  const notes: string[] = [];
  let action = p.action;
  let amount = action === "full_refund" ? refundable : action === "partial_refund" ? round2(p.refund_amount) : 0;

  if (action === "partial_refund" && amount <= 0) {
    action = "notify";
    notes.push("Refund amount was zero; downgraded to notify.");
  }
  if (amount > refundable) {
    notes.push(`Clamped refund from ${amount} to refundable ${refundable}.`);
    amount = refundable;
  }
  if (action === "full_refund" && refundable <= 0) action = "no_action";

  const cap = round2(order.amount * policy.maxRefundPct);
  const isRefund = action === "partial_refund" || action === "full_refund";
  let verdict: Verdict["verdict"] = "auto";

  if (isRefund && amount > policy.autoApproveMaxEur) {
    verdict = "needs_approval";
    notes.push(`Refund ${amount} exceeds auto-approve limit ${policy.autoApproveMaxEur}.`);
  }
  if (isRefund && amount > cap) {
    verdict = "needs_approval";
    notes.push(`Refund ${amount} exceeds ${policy.maxRefundPct * 100}% of order (${cap}).`);
  }
  if (p.risk >= policy.escalateRisk && action !== "no_action") {
    verdict = "needs_approval";
    notes.push(`Risk ${p.risk} is at or above ${policy.escalateRisk}; merchant must review.`);
  }
  if (action === "reship") {
    verdict = "needs_approval";
    notes.push("Reshipping always needs merchant approval.");
  }
  return { verdict, action, amount, notes };
}
