import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

// Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  is_auto: boolean("is_auto").notNull().default(true),
  identity_account: text("identity_account"),
  identity_password: text("identity_password"),
  qq_account: text("qq_account"),
  created_at: timestamp("created_at", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow(),
});

// Cookies table
export const cookies = pgTable("cookies", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  expires: timestamp("expires", { precision: 3, mode: "date" }),
  created_at: timestamp("created_at", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow(),
});

// Scan History table
export const scanHistory = pgTable("scan_history", {
  id: text("id").primaryKey(),
  result: text("result").notNull(),
  user_id: text("user_id").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow(),
});

// Signin History table
export const signinHistory = pgTable("signin_history", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  cookie: text("cookie"),
  scan_history_id: text("scan_history_id").references(() => scanHistory.id, {
    onDelete: "set null",
  }),
  request_data: jsonb("request_data").$type<Record<string, unknown>>(),
  response_code: integer("response_code"),
  response_data: jsonb("response_data").$type<Record<string, unknown>>(),
  created_at: timestamp("created_at", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow(),
});

// Log table
export const log = pgTable("log", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  created_at: timestamp("created_at", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow(),
});
