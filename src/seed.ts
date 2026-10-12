import { all, get, run } from "./db.js";
import { captureOrder, createOrder, getOrder } from "./paypal.js";

const items = [
  ["Wireless headphones", "45.00", "Aoife"],
  ["Running shoes", "89.00", "Liam"],
  ["Ceramic coffee set", "32.50", "Niamh"],
  ["USB-C dock", "120.00", "Sean"],
  ["Yoga mat", "24.00", "Ciara"],
];

const cmd = process.argv[2];

if (cmd === "new") {
  for (const [item, amount, buyer] of items) {
    const o = await createOrder(amount, item, `seed-${item}-${Date.now()}`);
    const url = o.links.find((l: any) => ["approve", "payer-action"].includes(l.rel)).href;
    run("INSERT INTO orders (paypal_order_id, state, approve_url, amount, item, buyer_name) VALUES (?,?,?,?,?,?)",
      o.id, "awaiting_approval", url, Number(amount), item, buyer);
    console.log(`${item} (${amount} EUR)\n  approve as the Personal sandbox buyer: ${url}`);
  }
  console.log("\nAfter approving each, run: npm run seed:capture");
} else if (cmd === "capture") {
  for (const o of all("SELECT * FROM orders WHERE state = 'awaiting_approval'")) {
    try {
      const status = (await getOrder(o.paypal_order_id)).status;
      if (status !== "APPROVED" && status !== "COMPLETED") { console.log(`${o.item}: not approved yet (${status})`); continue; }
      const c = status === "COMPLETED" ? await getOrder(o.paypal_order_id) : await captureOrder(o.paypal_order_id);
      const capId = c.purchase_units[0].payments.captures[0].id;
      run("UPDATE orders SET state = 'open', capture_id = ? WHERE paypal_order_id = ?", capId, o.paypal_order_id);
      console.log(`${o.item}: captured ${capId}`);
    } catch (e: any) { console.log(`${o.item}: ${e.message}`); }
  }
} else console.log("usage: seed.ts new|capture");
