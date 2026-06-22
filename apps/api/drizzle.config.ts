import { defineConfig } from "drizzle-kit";
import fs from "fs";
import path from "path";

function getLocalD1Path() {
  try {
    const basePath = path.resolve(
      ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
    );

    if (!fs.existsSync(basePath)) return undefined;

    const files = fs.readdirSync(basePath);
    const dbFile = files.find((file) => file.endsWith(".sqlite"));

    if (dbFile) {
      return path.join(basePath, dbFile);
    }
  } catch (e) {
    console.error("Error finding local D1 database:", e);
  }
  return "file:./local.db"; // Fallback para no romper si no existe
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: getLocalD1Path()!,
  },
});
