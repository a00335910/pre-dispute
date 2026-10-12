import type { Proposal } from "./llm.js";
import type { Row } from "./db.js";

// Deterministic stand-in used only when every Gemini model is unavailable (quota, outage).
// It is intentionally simple and always labelled as a fallback so nobody mistakes it for the AI.
const THREAT = /\b(dispute|chargeback|charge back|money back|full refund|bad review|lawyer|scam)\b/i;

export function rulesProposal(order: Row, buyerMessages: string[], why: string): Proposal {
  const text = buyerMessages.join(" ");
  const days = Number(order.days_late) || 0;
  const threat = THREAT.test(text);
  const label = `Rules fallback (AI unavailable: ${why.slice(0, 80)}).`;

  if (threat || days >= 8) {
    return {
      action: "full_refund", refund_amount: order.amount, risk: 0.9,
      reason: `${label} Buyer is threatening a dispute or the order is ${days} days late, so a full refund is proposed for the merchant to review.`,
      message_to_buyer: "We are very sorry for the delay. We have prepared a full refund and are checking with the carrier. We will follow up shortly.",
    };
  }
  if (days >= 4) {
    const refund = Math.max(2, Math.round(order.amount * 0.15 * 2) / 2);
    return {
      action: "partial_refund", refund_amount: refund, risk: 0.55,
      reason: `${label} A ${days}-day delay with a worried buyer calls for a small goodwill refund.`,
      message_to_buyer: "We are sorry for the delay. We have issued a small goodwill refund while we check with the carrier, and will update you as soon as we know more.",
    };
  }
  return {
    action: "notify", refund_amount: 0, risk: 0.2,
    reason: `${label} Short delay and a calm buyer, a status update is enough.`,
    message_to_buyer: "Thanks for checking in. Your order is slightly delayed. We are checking with the carrier and will follow up with an update.",
  };
}
