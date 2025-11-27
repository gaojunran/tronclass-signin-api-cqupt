import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema.ts";

const sql = neon(Deno.env.get("DATABASE_URL") || "");
export const db = drizzle(sql, { schema });
