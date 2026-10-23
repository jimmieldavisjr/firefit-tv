// Builds the web app against the deployed API and publishes it to S3 + CloudFront.
// Reads ApiUrl, Bucket and DistributionId from cdk-outputs.json (written by `pnpm deploy:infra`).
// Requires the AWS CLI with credentials for the target account (AWS_PROFILE).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = JSON.parse(readFileSync(join(root, "cdk-outputs.json"), "utf8")).FireFit;
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

run("node scripts/fetch-assets.mjs");
run("pnpm --filter @firefit/web build", { VITE_API_URL: out.ApiUrl, VITE_PHONE_ORIGIN: "" });
run(`aws s3 sync apps/web/dist s3://${out.Bucket} --delete`);
run(`aws cloudfront create-invalidation --distribution-id ${out.DistributionId} --paths "/*"`);
console.log(`\nPublished: ${out.SiteUrl}/tv.html  ·  ${out.SiteUrl}/phone.html  ·  ${out.SiteUrl}/probe.html`);
