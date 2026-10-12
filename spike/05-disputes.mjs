import { pp } from "./paypal.mjs";
const r = await pp("/v1/customer/disputes?page_size=5");
console.log("list disputes", r.status, "debug", r.debugId);
console.log(JSON.stringify(r.json?.items ?? r.json, null, 2).slice(0, 800));
