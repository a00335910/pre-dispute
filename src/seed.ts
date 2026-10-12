import { resetDemoData, seedDemoOrders } from "./demo.js";

if (process.argv[2] === "reset") resetDemoData();
console.log(`Created ${await seedDemoOrders()} captured sandbox orders.`);
