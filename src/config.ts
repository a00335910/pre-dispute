export const cfg = {
  paypalBase: process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com",
  clientId: process.env.PAYPAL_CLIENT_ID ?? "",
  clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
  llmKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gemini-3.8-flash",
  llmFallbackModel: process.env.LLM_FALLBACK_MODEL ?? "gemini-3.5-flash",
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? "pre-dispute.db",
  currency: "EUR",
};

// Merchant policy: hard limits the LLM can never override.
export const policy = {
  autoApproveMaxEur: 10,       // refunds up to this are executed without asking the merchant
  maxRefundPct: 0.3,           // never refund more than 30% of the order without approval
  escalateRisk: 0.8,           // cases at or above this risk always go to the merchant
  feePerPreventedEur: 2.0,     // outcome-based fee per dispute prevented
  assumedDisputeCostEur: 15,   // illustrative: chargeback fee + handling, used only for ROI estimate
  preventedAfterDays: 14,      // no dispute for this long after resolution => counted as prevented
};
