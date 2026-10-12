import { DatabaseSync } from "node:sqlite";
import { cfg } from "./config.js";

export const db = new DatabaseSync(cfg.dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  paypal_order_id TEXT PRIMARY KEY,
  capture_id TEXT,
  state TEXT NOT NULL DEFAULT 'awaiting_approval',   -- awaiting_approval | open | resolved
  approve_url TEXT,
  amount REAL NOT NULL,
  refunded REAL NOT NULL DEFAULT 0,
  item TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  shipping_status TEXT NOT NULL DEFAULT 'in_transit', -- in_transit | delayed | delivered
  days_late INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, sender TEXT NOT NULL,
  body TEXT NOT NULL, ts TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL,
  action TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, risk REAL, reason TEXT, message_to_buyer TEXT,
  verdict TEXT NOT NULL,            -- auto | needs_approval
  status TEXT NOT NULL,             -- executed | pending | rejected | failed
  paypal_ref TEXT, ts TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL UNIQUE,
  fee REAL NOT NULL, loss_avoided REAL NOT NULL, invoice_id TEXT, ts TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export type Row = Record<string, any>;
export const all = (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
export const get = (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
export const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);
