import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const loadEnvFile = (fileName) => {
  try {
    const file = readFileSync(resolve(process.cwd(), fileName), "utf8");
    for (const line of file.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      process.env[key] ??= valueParts.join("=");
    }
  } catch {
    // Environment variables may already be supplied by the shell or host.
  }
};

loadEnvFile(".env.local");
loadEnvFile(".env.example");

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.");
}

const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
  },
});

const checks = [
  ["houses", () => supabase.from("houses").select("id, name").limit(3)],
  ["discussion_topics", () => supabase.from("discussion_topics").select("id, title").limit(3)],
  ["posts", () => supabase.from("posts").select("id").limit(1)],
  ["prayer_feed", () => supabase.from("prayer_feed").select("id").limit(1)],
];

for (const [name, runCheck] of checks) {
  const { error } = await runCheck();

  if (error) {
    throw new Error(`${name} check failed: ${error.message}`);
  }

  console.log(`ok ${name}`);
}

console.log("Supabase smoke check passed.");
