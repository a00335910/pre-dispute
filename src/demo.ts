import { db, all, run } from "./db.js";
import { createCapturedCardOrder } from "./paypal.js";

const DEMO_ORDERS: [item: string, amount: string, buyer: string][] = [
  ["Wireless headphones", "45.00", "Aoife"],
  ["Running shoes", "89.00", "Liam"],
  ["Ceramic coffee set", "32.50", "Niamh"],
  ["USB-C dock", "120.00", "Sean"],
  ["Yoga mat", "24.00", "Ciara"],
];

let seeding: Promise<number> | null = null;

// Creates real, fully captured sandbox orders (test card) so the agent has live money to work with.
// One run at a time, so concurrent callers share the same run instead of creating duplicates.
export function seedDemoOrders(): Promise<number> {
  if (seeding) return seeding;
  seeding = doSeed().finally(() => { seeding = null; });
  return seeding;
}

async function doSeed() {
  const batch = Date.now();
  for (const [item, amount, buyer] of DEMO_ORDERS) {
    const { orderId, captureId } = await createCapturedCardOrder(amount, item, `demo-${batch}-${item}`);
    run("INSERT INTO orders (paypal_order_id, capture_id, state, amount, item, buyer_name) VALUES (?,?,?,?,?,?)",
      orderId, captureId, "open", Number(amount), item, buyer);
  }
  return DEMO_ORDERS.length;
}

export function resetDemoData() {
  db.exec("DELETE FROM messages; DELETE FROM decisions; DELETE FROM outcomes; DELETE FROM orders;");
}

// A reset waits for any seeding already in flight, then wipes and seeds a clean set.
export async function resetAndSeed() {
  if (seeding) await seeding.catch(() => undefined);
  resetDemoData();
  return seedDemoOrders();
}

export const hasOrders = () => all("SELECT 1 FROM orders LIMIT 1").length > 0;
