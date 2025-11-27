import { pgTable, text, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

// Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isAuto: boolean("is_auto").notNull().default(true),
  identityAccount: text("identity_account"),
  identityPassword: text("identity_password"),
  createdAt: timestamp("created_at", { precision: 3, mode: 'date' }).notNull().defaultNow(),
});

// Cookies table
export const cookies = pgTable("cookies", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  expires: timestamp("expires", { precision: 3, mode: 'date' }),
  createdAt: timestamp("created_at", { precision: 3, mode: 'date' }).notNull().defaultNow(),
});

// Scan History table
export const scanHistory = pgTable("scan_history", {
  id: text("id").primaryKey(),
  result: text("result").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { precision: 3, mode: 'date' }).notNull().defaultNow(),
});

// Signin History table
export const signinHistory = pgTable("signin_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cookie: text("cookie"),
  scanHistoryId: text("scan_history_id").references(() => scanHistory.id, { onDelete: "set null" }),
  requestData: jsonb("request_data").$type<Record<string, unknown>>(),
  responseCode: integer("response_code"),
  responseData: jsonb("response_data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { precision: 3, mode: 'date' }).notNull().defaultNow(),
});

// Log table
export const log = pgTable("log", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: 'date' }).notNull().defaultNow(),
});
