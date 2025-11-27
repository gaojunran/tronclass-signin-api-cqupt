import { pgTable, uuid, text, boolean, timestamp, integer, json } from "drizzle-orm/pg-core";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isAuto: boolean("is_auto").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Cookies table
export const cookies = pgTable("cookies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  expires: timestamp("expires"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Scan History table
export const scanHistory = pgTable("scan_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  result: text("result").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Signin History table
export const signinHistory = pgTable("signin_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cookie: text("cookie"),
  scanHistoryId: uuid("scan_history_id").references(() => scanHistory.id, { onDelete: "set null" }),
  requestData: json("request_data"),
  responseCode: integer("response_code"),
  responseData: json("response_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Log table
export const log = pgTable("log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  data: json("data").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
