import "dotenv/config";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Missing DATABASE_URL. Add it to app/server/.env before starting the server.",
  );
}

export const databasePool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

databasePool.on("error", (error: Error) => {
  console.error("Unexpected PostgreSQL connection error:", error);
});
