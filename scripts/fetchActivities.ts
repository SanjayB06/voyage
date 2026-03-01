import dotenv from "dotenv";
import { expand } from "dotenv-expand";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

expand(dotenv.config());

// Usage: npx tsx scripts/fetchActivities.ts CDG
const destination = (process.argv[2] || "CDG").toUpperCase();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/search_activities_amadeus`;

async function main() {
  console.log(`Fetching activities for destination: ${destination}`);
  console.log(`Calling: ${FUNCTION_URL}`);

  const resp = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ destination }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`Edge function error [${resp.status}]: ${errText}`);
    process.exit(1);
  }

  const data = await resp.json();

  if (data.error) {
    console.error("Edge function returned error:", data.error);
    process.exit(1);
  }

  const output = {
    destination,
    fetched_at: new Date().toISOString(),
    activities: data.activities ?? [],
  };

  const outDir = resolve(process.cwd(), "src/data");
  mkdirSync(outDir, { recursive: true });

  const outPath = resolve(outDir, "activities.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\nWrote ${output.activities.length} activities to ${outPath}`);
  console.log("Top activities:");
  for (const a of output.activities) {
    const price = a.price_amount ? `${a.price_amount} ${a.price_currency}` : "free";
    const rating = a.rating ?? "N/A";
    console.log(`  [${rating}] ${a.name} — ${price}`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
