// End-to-end smoke test against the deployed API (reads ApiUrl from cdk-outputs.json, or API_URL).
// Saves fixtures/squat-3x10.json as a real workout, so the coach agent runs once (one small Bedrock call).
//   pnpm smoke
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API_URL ?? JSON.parse(readFileSync(join(root, "cdk-outputs.json"), "utf8")).FireFit.ApiUrl;
const fixture = readFileSync(join(root, "fixtures/squat-3x10.json"), "utf8");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failed++;
};
const call = async (path, init = {}) => {
  const r = await fetch(API + path, { ...init, headers: { "content-type": "application/json", ...init.headers } });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

console.log("API", API);

const room = await call("/rooms", { method: "POST" });
check("POST /rooms -> 201 with code + token", room.status === 201 && /^\d{6}$/.test(room.body?.code), `code=${room.body?.code}`);
const wrong = await call(`/rooms/${room.body.code}/offer`, { headers: { "x-room-token": "wrong" } });
check("GET offer with wrong token -> 403", wrong.status === 403);
const put = await call(`/rooms/${room.body.code}/offer`, {
  method: "PUT",
  headers: { "x-room-token": room.body.token },
  body: JSON.stringify({ sdp: "v=0 smoke-test-offer" }),
});
const got = await call(`/rooms/${room.body.code}/offer`, { headers: { "x-room-token": room.body.token } });
check("PUT/GET offer with token round-trips", put.status === 204 && got.body?.sdp === "v=0 smoke-test-offer");

const bad = await call("/workouts", { method: "POST", body: JSON.stringify({ exercise: "burpee" }) });
check("POST /workouts invalid -> 400", bad.status === 400);
const saved = await call("/workouts", { method: "POST", body: fixture });
check("POST /workouts fixture -> 201", saved.status === 201, `id=${saved.body?.id}`);

const t0 = Date.now();
let plan = null;
while (Date.now() - t0 < 45_000) {
  const r = await call(`/workouts/${saved.body.id}/coach`);
  if (r.status === 200) {
    plan = r.body;
    break;
  }
  await new Promise((res) => setTimeout(res, 1500));
}
check("GET /workouts/{id}/coach -> plan", !!plan, plan ? `after ${((Date.now() - t0) / 1000).toFixed(1)} s` : "timed out");
if (plan) {
  check('coach source is "agent" (Bedrock), not the rules fallback', plan.source === "agent", `source=${plan.source} model=${plan.model}`);
  check("agent called all three tools", ["get_profile", "get_workout_history", "analyze_trends"].every((t) => plan.toolCalls?.includes(t)), JSON.stringify(plan.toolCalls));
  console.log("      decision:", plan.decision, "| next:", JSON.stringify(plan.nextWorkout), "| cue:", plan.focusCue);
  console.log("      recap:", plan.recap);
}

const profile = await call("/profile");
check(
  "GET /profile shows the agent's next workout",
  profile.status === 200 && JSON.stringify(profile.body?.profile?.nextWorkout) === JSON.stringify(plan?.nextWorkout),
  JSON.stringify(profile.body?.profile?.nextWorkout),
);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
