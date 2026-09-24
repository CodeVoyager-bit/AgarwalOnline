// Runs before `next build`. On a Vercel production build it fails fast when the
// environment is invalid, instead of every page failing after deploy.
import { parseEnv } from "../src/lib/env";
if (process.env.VERCEL_ENV !== "production" && process.env.CHECK_ENV !== "true") {
  console.log("check-env: skipped (not a Vercel production build)");
  process.exit(0);
}
const problems: string[] = [];
try {
  parseEnv({ ...process.env, NODE_ENV: "production" });
} catch (error) {
  const issues = (error as { issues?: { path: unknown[]; message: string }[] }).issues ?? [];
  for (const issue of issues) problems.push(`${issue.path.join(".") || "env"}: ${issue.message}`);
  if (!issues.length) problems.push(String(error));
}
for (const key of ["BETTER_AUTH_SECRET", "CRON_SECRET", "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"])
  if (!process.env[key]) problems.push(`${key}: required for a production deployment`);
if (problems.length) {
  console.error("Production environment is not ready:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log("check-env: production environment OK");
