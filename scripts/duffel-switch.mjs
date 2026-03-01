import { readFileSync } from "fs";
import { execSync } from "child_process";

const mode = process.argv[2];
if (!["test", "live"].includes(mode)) {
  console.error("Usage: node scripts/duffel-switch.mjs [test|live]");
  process.exit(1);
}

const env = readFileSync(".env", "utf-8");
const get = (key) => {
  const line = env.split("\n").find((l) => l.startsWith(key + "="));
  return line ? line.split("=")[1].replace(/['"]/g, "").trim() : null;
};

const key = mode === "test" ? get("DUFFEL_TEST_KEY") : get("DUFFEL_LIVE_KEY");
if (!key) {
  console.error(`DUFFEL_${mode.toUpperCase()}_KEY not found in .env`);
  process.exit(1);
}

console.log(`Switching Duffel → ${mode} mode...`);
execSync(`npx supabase secrets set DUFFEL_API_KEY=${key}`, { stdio: "inherit" });
console.log(`Done — now using Duffel ${mode} key.`);
