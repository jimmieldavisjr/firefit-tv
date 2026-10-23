// CoachFn: a Strands agent, invoked asynchronously by ApiFn after each saved session.
// Phase 1 streams a written analysis (with tool calls) into a transcript the TV shows live, chat style.
// Phase 2 asks the same agent for a Zod-typed plan that code then guards and saves; the TV's library uses it.
// On any failure a rules fallback writes the same shape, clearly labeled source: "rules".
// The agent sees structured metrics measured on the phone, never camera frames.
import { Agent, BedrockModel, tool } from "@strands-agents/sdk";
import { z } from "zod";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Plan, type TranscriptLine } from "@firefit/shared";
import { db, T, userKey } from "./db";
import { guard, normalize, rulesPlan, trends, type Session } from "./trends";

const MODEL = process.env.MODEL_ID ?? "us.amazon.nova-2-lite-v1:0";
/** Partition for the profile being coached; set per invocation (one invocation per Lambda instance at a time). */
let U = userKey("guest");

export const SYSTEM = `You are FireFIT's strength coach for beginners training at home in front of a TV.
A session is squats, then push-ups, then a plank hold. The phone measured every rep (depth in degrees, tempo,
seconds between reps, form cues) and the plank's good-form hold time. You never see video.
Before writing, call get_profile, get_workout_history and analyze_trends.
Use only numbers returned by tools. Never invent measurements. Calories are an estimate; say so. No medical advice.
Decision rules for the whole session:
- technique: any exercise has a form cue on 30% or more of reps (cueRate >= 0.3)
- deload: any exercise's total dropped more than 20% versus earlier sessions
- progress: every exercise met its target
- hold: otherwise
Next session: keep the three exercises in order; for progress raise reps by 1-2 (plank by 5-10 s) only where the
target was met; for deload lower by 2 reps / 10 s; otherwise keep targets.
analyze_trends also returns "suggested": the decision and next session computed by FireFIT's rules from these
numbers. Follow it unless the numbers clearly justify something else, and say why in plain words.
Session length is totalSessionSec (includes rests); timeUnderWorkSec is time spent in sets.`;

const ANALYZE = (id: string) =>
  `Session ${id} just finished. Review it like a coach talking to the user on their TV: ` +
  `first one sentence on the overall session (time, estimated calories), then one short paragraph per exercise ` +
  `(what went well, what to improve, citing the measured numbers such as seconds between reps, depth, tempo, ` +
  `hold time and cue counts), then your decision for next time. Plain sentences, no markdown, under 180 words.`;
const PLAN =
  "Now return the structured plan for the next session, including the after-action report fields wentWell, toFix and nextTime " +
  "(short, plain sentences the TV will read aloud). Keep it consistent with what you just told the user.";

async function history(limit = 6): Promise<Session[]> {
  const { Items = [] } = await db.send(
    new QueryCommand({
      TableName: T,
      ScanIndexForward: false,
      Limit: 25,
      KeyConditionExpression: "pk = :u AND begins_with(sk, :w)",
      ExpressionAttributeValues: { ":u": U, ":w": "WORKOUT#" },
    }),
  );
  return Items.map((i) => normalize(i)).filter((s): s is Session => !!s).slice(0, limit);
}

/** Compact history for the model: per-set totals and summary stats, not every rep. */
const compact = (s: Session) => ({
  completedAt: s.completedAt,
  durationSec: s.durationSec,
  caloriesEst: s.caloriesEst,
  blocks: s.blocks.map((b) => ({ exercise: b.exercise, sets: b.sets, target: b.target, perSet: b.perSet, cues: b.cues.length })),
});

export const handler = async ({ workoutId, profileId = "guest" }: { workoutId: string; profileId?: string }) => {
  U = userKey(profileId);
  const t0 = Date.now();
  const toolCalls: string[] = [];
  const transcript: TranscriptLine[] = [];
  const Key = { pk: U, sk: `REC#${workoutId}` };
  const createdAt = new Date().toISOString();
  const say = (kind: TranscriptLine["kind"], text: string) => transcript.push({ kind, text, at: Date.now() - t0 });

  // Throttled transcript writes so the TV can show the agent working in near real time.
  let lastFlush = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const flush = (force = false) => {
    if (!force && Date.now() - lastFlush < 400) return pending;
    lastFlush = Date.now();
    const snapshot = transcript.map((l) => ({ ...l }));
    pending = pending.then(() =>
      db.send(new UpdateCommand({ TableName: T, Key, UpdateExpression: "SET transcript = :t", ExpressionAttributeValues: { ":t": snapshot } })),
    );
    return pending;
  };

  say("status", "Reviewing your session…");
  await db.send(new PutCommand({ TableName: T, Item: { ...Key, status: "running", transcript, createdAt } }));

  const recent = await history(10);
  const last = recent.find((w) => w.id === workoutId) ?? recent[0];
  if (!last) throw new Error(`workout ${workoutId} not found`);
  const sessionTrends = () => trends([last, ...recent.filter((w) => w.id !== last.id).slice(0, 5)]);

  const tools = [
    tool({
      name: "get_profile",
      description: "The user's goal, fitness level, body weight used for calorie estimates, and current plan.",
      inputSchema: z.object({}),
      callback: async () => {
        toolCalls.push("get_profile");
        const { Item } = await db.send(new GetCommand({ TableName: T, Key: { pk: U, sk: "PROFILE" } }));
        return JSON.stringify(Item ?? { goal: "Strength + form", level: "Beginner" });
      },
    }),
    tool({
      name: "get_workout_history",
      description: "Recent sessions, newest first: per exercise the planned sets x target and what was done per set.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(10).optional() }),
      callback: async ({ limit }) => {
        toolCalls.push("get_workout_history");
        return JSON.stringify(recent.slice(0, limit ?? 5).map(compact));
      },
    }),
    tool({
      name: "analyze_trends",
      description:
        "Computed statistics for the latest session per exercise versus earlier sessions: target met, completion %, " +
        "seconds between reps, depth, tempo and its consistency, form-cue rate and most common cue, plank hold, " +
        "session time, rest time and estimated calories.",
      inputSchema: z.object({}),
      callback: async () => {
        toolCalls.push("analyze_trends");
        const t = sessionTrends();
        const rules = rulesPlan(t, last);
        return JSON.stringify({ ...t, suggested: { decision: rules.decision, next: rules.next } }); // math in code, not in the model
      },
    }),
  ];

  let plan: Plan;
  let source: "agent" | "rules" = "agent";
  let error: string | undefined;
  try {
    const agent = new Agent({
      model: new BedrockModel({ modelId: MODEL, region: process.env.AWS_REGION, temperature: 0.3, maxTokens: 1200 }),
      systemPrompt: SYSTEM,
      tools,
      printer: false,
    });
    let speaking = false;
    for await (const ev of agent.stream(ANALYZE(workoutId))) {
      if (ev.type === "beforeToolCallEvent") {
        say("tool", ev.toolUse.name);
        speaking = false;
        flush();
      } else if (ev.type === "modelStreamUpdateEvent" && ev.event.type === "modelContentBlockDeltaEvent" && ev.event.delta.type === "textDelta") {
        if (!speaking) say("text", "");
        speaking = true;
        transcript[transcript.length - 1].text += ev.event.delta.text;
        flush();
      }
    }
    say("status", "Writing your next session…");
    await flush(true);
    const result = await agent.invoke(PLAN, { structuredOutputSchema: Plan });
    const t = sessionTrends();
    const rules = rulesPlan(t, last);
    const agentPlan = guard(Plan.parse(result.structuredOutput), last, t.blocks.map((b) => b.topCue).find(Boolean));
    // every report has all three sections; fill any the model left empty from the computed rules
    plan = {
      ...agentPlan,
      wentWell: agentPlan.wentWell.length ? agentPlan.wentWell : rules.wentWell,
      toFix: agentPlan.toFix.length ? agentPlan.toFix : rules.toFix,
      nextTime: agentPlan.nextTime || rules.nextTime,
    };
  } catch (err) {
    console.error("agent failed, using rules fallback", err);
    error = (err as Error).name + ": " + (err as Error).message;
    say("status", "The AI coach is unavailable right now, so this plan comes from FireFIT's rules.");
    plan = rulesPlan(sessionTrends(), last);
    source = "rules";
  }
  say("status", "Plan ready.");

  const latencyMs = Date.now() - t0;
  await pending.catch(() => {});
  await db.send(
    new PutCommand({
      TableName: T,
      Item: { ...Key, status: "done", transcript, createdAt, ...plan, source, model: source === "agent" ? MODEL : null, toolCalls, latencyMs },
    }),
  );
  await db.send(
    new UpdateCommand({
      TableName: T,
      Key: { pk: U, sk: "PROFILE" },
      UpdateExpression: "SET #n = :n, focusCue = :c, lastDecision = :d",
      ExpressionAttributeNames: { "#n": "next" },
      ExpressionAttributeValues: { ":n": plan.next, ":c": plan.focusCue, ":d": plan.decision },
    }),
  );
  // CloudWatch trace: one line per run, used as Gate 4 evidence
  console.log(JSON.stringify({ evt: "coach_run", workoutId, profileId, source, model: MODEL, decision: plan.decision, toolCalls, latencyMs, transcriptLines: transcript.length, error }));
  return { source, decision: plan.decision };
};
