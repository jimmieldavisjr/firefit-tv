// CoachFn: a Strands agent, invoked asynchronously by ApiFn after each saved workout.
// It reads the profile, history and computed trends through tools, reasons with Amazon Bedrock,
// and writes a plan that changes what the TV recommends next. On any failure a rules fallback
// writes the same shape, clearly labeled source: "rules".
import { Agent, BedrockModel, tool } from "@strands-agents/sdk";
import { z } from "zod";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Exercise, Plan } from "@firefit/shared";
import { db, T, U } from "./db";
import { guard, rulesPlan, trends, type Workout } from "./trends";

const MODEL = process.env.MODEL_ID ?? "us.amazon.nova-2-lite-v1:0";

export const SYSTEM = `You are FireFIT's strength coach for beginners training at home in front of a TV.
Before deciding, call get_profile, get_workout_history and analyze_trends.
Use only numbers returned by tools. Never invent measurements. No medical advice.
Choose exactly one decision:
- progress: target met, form cue on under 30% of reps
- hold: target missed, or tempo inconsistent (tempoSdSec above 0.8)
- deload: reps down more than 20% versus the previous average
- technique: form cue on 30% or more of reps; keep targets, set focusCue from topCue
Keep the same exercise unless the profile goal says otherwise.`;

async function history(exercise?: Exercise, limit = 5): Promise<Workout[]> {
  const { Items = [] } = await db.send(
    new QueryCommand({
      TableName: T,
      ScanIndexForward: false,
      Limit: 25,
      KeyConditionExpression: "pk = :u AND begins_with(sk, :w)",
      ExpressionAttributeValues: { ":u": U, ":w": "WORKOUT#" },
    }),
  );
  return (Items as Workout[]).filter((w) => !exercise || w.exercise === exercise).slice(0, limit);
}

export const handler = async ({ workoutId }: { workoutId: string }) => {
  const t0 = Date.now();
  const toolCalls: string[] = [];
  const recent = await history(undefined, 10);
  const last = recent.find((w) => w.id === workoutId) ?? recent[0];
  if (!last) throw new Error(`workout ${workoutId} not found`);

  const tools = [
    tool({
      name: "get_profile",
      description: "The user's goal, fitness level and current program targets.",
      inputSchema: z.object({}),
      callback: async () => {
        toolCalls.push("get_profile");
        const { Item } = await db.send(new GetCommand({ TableName: T, Key: { pk: U, sk: "PROFILE" } }));
        return JSON.stringify(Item ?? { goal: "Strength + form", level: "Beginner" });
      },
    }),
    tool({
      name: "get_workout_history",
      description: "Recent sessions, newest first, with per-rep depth (degrees), tempo (seconds) and form cues.",
      inputSchema: z.object({
        exercise: Exercise.optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      callback: async ({ exercise, limit }) => {
        toolCalls.push("get_workout_history");
        return JSON.stringify(await history(exercise, limit ?? 5));
      },
    }),
    tool({
      name: "analyze_trends",
      description:
        "Computed statistics for the latest session of an exercise versus earlier ones: " +
        "target met, rep change %, depth change, tempo consistency, form-cue rate, most common cue.",
      inputSchema: z.object({ exercise: Exercise }),
      callback: async ({ exercise }) => {
        toolCalls.push("analyze_trends");
        const h = await history(exercise, 6);
        return JSON.stringify(h.length ? trends(h) : { error: "no sessions for this exercise" });
      },
    }),
  ];

  let plan: Plan;
  let source: "agent" | "rules" = "agent";
  let error: string | undefined;
  try {
    const agent = new Agent({
      model: new BedrockModel({ modelId: MODEL, region: process.env.AWS_REGION, temperature: 0.3, maxTokens: 1000 }),
      systemPrompt: SYSTEM,
      tools,
      structuredOutputSchema: Plan,
      printer: false,
    });
    const result = await agent.invoke(
      `Session ${workoutId} (${last.exercise}, target ${last.sets} x ${last.targetReps}) just finished. ` +
        `Review it and plan the next session.`,
    );
    plan = guard(Plan.parse(result.structuredOutput), last);
  } catch (err) {
    console.error("agent failed, using rules fallback", err);
    error = (err as Error).name + ": " + (err as Error).message;
    plan = rulesPlan(trends(await history(last.exercise, 6)), last);
    source = "rules";
  }

  const latencyMs = Date.now() - t0;
  await db.send(
    new PutCommand({
      TableName: T,
      Item: {
        pk: U,
        sk: `REC#${workoutId}`,
        ...plan,
        source,
        model: source === "agent" ? MODEL : null,
        toolCalls,
        latencyMs,
        createdAt: new Date().toISOString(),
      },
    }),
  );
  await db.send(
    new UpdateCommand({
      TableName: T,
      Key: { pk: U, sk: "PROFILE" },
      UpdateExpression: "SET nextWorkout = :n, focusCue = :c, lastDecision = :d",
      ExpressionAttributeValues: { ":n": plan.nextWorkout, ":c": plan.focusCue, ":d": plan.decision },
    }),
  );
  // CloudWatch trace: one line per run, used as Gate 4 evidence
  console.log(JSON.stringify({ evt: "coach_run", workoutId, source, model: MODEL, decision: plan.decision, toolCalls, latencyMs, error }));
  return { source, decision: plan.decision };
};
