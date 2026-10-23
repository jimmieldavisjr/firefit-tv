// ApiFn behind the API Gateway HTTP API (payload format 2.0).
// CORS is answered by the HTTP API's corsPreflight; do not add CORS headers here.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { NewProfile, ProfileId, SessionPlan, WorkoutInput, type LifetimeStats, type ProfileSummary, type ProfileView, type SessionReport } from "@firefit/shared";
import { db, PROFILES, T, userKey } from "./db";
import { deriveStats, EMPTY_STATS, nextStats } from "./stats";
import { composeScript, speak } from "./voice";
import { normalize, type Session } from "./trends";

const lambda = new LambdaClient({});
const ROOM_TTL_SEC = 900;
const now = () => Math.floor(Date.now() / 1000);

const res = (statusCode: number, body?: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: body === undefined ? "" : JSON.stringify(body),
});
const same = (a?: string, b?: string) =>
  !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const RoomCode = z.string().regex(/^\d{6}$/);
const SdpBody = z.object({ sdp: z.string().min(10).max(20000) });
const WorkoutId = z.string().uuid();

class BadRequest extends Error {}
function parseBody(e: APIGatewayProxyEventV2): unknown {
  if (!e.body) return {};
  try {
    return JSON.parse(e.isBase64Encoded ? Buffer.from(e.body, "base64").toString() : e.body);
  } catch {
    throw new BadRequest("body is not JSON");
  }
}

export const handler = async (e: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const p = e.pathParameters ?? {};
  try {
    // Which household profile this request is for (no passwords; defaults to the original guest profile)
    // <audio src> requests can't send headers, so the voice route also accepts ?p=<profileId>
    const profileId = ProfileId.parse(e.headers["x-profile-id"] ?? e.queryStringParameters?.p ?? "guest");
    const U = userKey(profileId);
    switch (e.routeKey) {
      case "GET /profiles": {
        const { Items = [] } = await db.send(
          new QueryCommand({ TableName: T, KeyConditionExpression: "pk = :p", ExpressionAttributeValues: { ":p": PROFILES } }),
        );
        const profiles = Items.map(({ pk: _pk, sk: _sk, ...rest }) => rest as ProfileSummary);
        return res(200, { profiles: profiles.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
      }

      case "POST /profiles": {
        // first-run account creation: name, level, goal and weight give the coach something to reason with
        const input = NewProfile.parse(parseBody(e));
        const profile: ProfileSummary = { id: randomBytes(4).toString("hex"), createdAt: new Date().toISOString(), ...input };
        await db.send(new PutCommand({ TableName: T, Item: { pk: PROFILES, sk: `P#${profile.id}`, ...profile } }));
        await db.send(new PutCommand({ TableName: T, Item: { pk: userKey(profile.id), sk: "PROFILE", ...input } }));
        return res(201, profile);
      }

      case "GET /workouts/{id}/voice": {
        // Amazon Polly reads the after-action report aloud; 202 until the coach run exists
        if (!WorkoutId.safeParse(p.id).success) return res(404, { error: "not found" });
        const { Item } = await db.send(new GetCommand({ TableName: T, Key: { pk: U, sk: `REC#${p.id}` } }));
        if (!Item || Item.status === "running") return res(202);
        const audio = await speak(composeScript(Item));
        return {
          statusCode: 200,
          headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" },
          body: audio.toString("base64"),
          isBase64Encoded: true,
        };
      }

      case "GET /workouts/{id}": {
        // after-action report: the saved session plus its coach run
        if (!WorkoutId.safeParse(p.id).success) return res(404, { error: "not found" });
        const { Items = [] } = await db.send(
          new QueryCommand({
            TableName: T,
            KeyConditionExpression: "pk = :u AND begins_with(sk, :w)",
            FilterExpression: "id = :id",
            ExpressionAttributeValues: { ":u": U, ":w": "WORKOUT#", ":id": p.id },
          }),
        );
        const session = Items[0] ? normalize(Items[0]) : null;
        if (!session) return res(404, { error: "not found" });
        const { Item } = await db.send(new GetCommand({ TableName: T, Key: { pk: U, sk: `REC#${p.id}` } }));
        const { pk: _pk, sk: _sk, ...coach } = Item ?? {};
        const report: SessionReport = { session, coach: Item ? ({ status: "done", transcript: [], ...coach } as unknown as SessionReport["coach"]) : null };
        return res(200, report);
      }

      case "POST /rooms": {
        // TV opens a pairing room; the QR carries code + token to the phone
        const code = String(randomInt(100000, 1000000));
        const token = randomUUID();
        const expiresAt = now() + ROOM_TTL_SEC;
        await db.send(
          new PutCommand({
            TableName: T,
            ConditionExpression: "attribute_not_exists(pk)",
            Item: { pk: `ROOM#${code}`, sk: "META", token, ttl: expiresAt },
          }),
        );
        return res(201, { code, token, expiresAt });
      }

      case "GET /rooms/{code}/{kind}":
      case "PUT /rooms/{code}/{kind}": {
        // SDP exchange; the per-room token is required in both directions
        if (p.kind !== "offer" && p.kind !== "answer") return res(404, { error: "not found" });
        if (!RoomCode.safeParse(p.code).success) return res(404, { error: "not found" });
        const Key = { pk: `ROOM#${p.code}`, sk: "META" };
        const { Item } = await db.send(new GetCommand({ TableName: T, Key }));
        if (!Item || Item.ttl < now() || !same(Item.token, e.headers["x-room-token"]))
          return res(403, { error: "room expired or wrong token" });
        if (e.requestContext.http.method === "GET")
          return Item[p.kind] ? res(200, { sdp: Item[p.kind] }) : res(204);
        const { sdp } = SdpBody.parse(parseBody(e));
        await db.send(
          new UpdateCommand({
            TableName: T,
            Key,
            UpdateExpression: "SET #k = :v",
            ExpressionAttributeNames: { "#k": p.kind },
            ExpressionAttributeValues: { ":v": sdp },
          }),
        );
        return res(204);
      }

      case "POST /workouts": {
        // save the session, update running metrics per exercise, wake the coach asynchronously
        const w = WorkoutInput.parse(parseBody(e));
        const id = randomUUID();
        const completedAt = new Date().toISOString();
        await db.send(
          new PutCommand({ TableName: T, Item: { pk: U, sk: `WORKOUT#${completedAt}#${id}`, id, completedAt, ...w } }),
        );
        // lifetime totals + day streak (sk STATS)
        const { Item: prevStats } = await db.send(new GetCommand({ TableName: T, Key: { pk: U, sk: "STATS" } }));
        const stats = nextStats((prevStats as LifetimeStats | undefined) ?? EMPTY_STATS, {
          durationSec: w.durationSec,
          caloriesEst: w.caloriesEst,
          date: w.localDate ?? completedAt.slice(0, 10),
        });
        await db.send(new PutCommand({ TableName: T, Item: { pk: U, sk: "STATS", ...stats } }));
        for (const b of w.blocks) {
          const total = b.perSet.reduce((a, n) => a + n, 0);
          const Key = { pk: U, sk: `METRIC#${b.exercise}` };
          await db.send(
            new UpdateCommand({
              TableName: T,
              Key,
              UpdateExpression: "ADD sessions :one, totalReps :r SET lastAt = :at",
              ExpressionAttributeValues: { ":one": 1, ":r": total, ":at": completedAt },
            }),
          );
          await db
            .send(
              new UpdateCommand({
                TableName: T,
                Key,
                UpdateExpression: "SET bestReps = :r",
                ConditionExpression: "attribute_not_exists(bestReps) OR bestReps < :r",
                ExpressionAttributeValues: { ":r": total },
              }),
            )
            .catch(() => {}); // not a new best: fine
        }
        await lambda.send(
          new InvokeCommand({
            FunctionName: process.env.COACH_FN,
            InvocationType: "Event", // async: the TV never waits on a model call
            Payload: Buffer.from(JSON.stringify({ workoutId: id, profileId })),
          }),
        );
        return res(201, { id, completedAt });
      }

      case "GET /workouts/{id}/coach": {
        // TV polls: 202 until the coach starts, then the live transcript (status "running"), then the plan ("done")
        if (!WorkoutId.safeParse(p.id).success) return res(404, { error: "not found" });
        const { Item } = await db.send(new GetCommand({ TableName: T, Key: { pk: U, sk: `REC#${p.id}` } }));
        if (!Item) return res(202);
        const { pk: _pk, sk: _sk, ...run } = Item;
        return res(200, { status: "done", transcript: [], ...run });
      }

      case "GET /profile": {
        // library screen in one query
        const { Items = [] } = await db.send(
          new QueryCommand({ TableName: T, KeyConditionExpression: "pk = :u", ExpressionAttributeValues: { ":u": U } }),
        );
        const by = (pre: string) => Items.filter((i) => String(i.sk).startsWith(pre));
        const decisions = Object.fromEntries(by("REC#").map((r) => [String(r.sk).slice(4), r.decision]));
        const strip = ({ pk: _pk, sk: _sk, ...rest }: Record<string, unknown>) => rest;
        const stored = (by("PROFILE")[0] ? strip(by("PROFILE")[0]) : {}) as Record<string, unknown>;
        const next = SessionPlan.safeParse(stored.next);
        const view: ProfileView = {
          profile: {
            name: (stored.name as string) ?? process.env.PROFILE_NAME ?? "Guest",
            goal: (stored.goal as string) ?? "Strength + form",
            level: (stored.level as string) ?? "Beginner",
            weightKg: Number(stored.weightKg ?? process.env.PROFILE_WEIGHT_KG ?? 80),
            ...(next.success ? { next: next.data } : {}),
            ...(next.success && stored.focusCue ? { focusCue: stored.focusCue as string } : {}),
            ...(stored.lastDecision ? { lastDecision: stored.lastDecision as ProfileView["profile"]["lastDecision"] } : {}),
          },
          metrics: Object.fromEntries(by("METRIC#").map((m) => [String(m.sk).slice(7), strip(m)])),
          stats: by("STATS")[0]
            ? ({ ...EMPTY_STATS, ...strip(by("STATS")[0]) } as LifetimeStats)
            : deriveStats(
                by("WORKOUT#")
                  .map((i) => normalize(i))
                  .filter((x): x is Session => !!x)
                  .map((x) => ({ durationSec: x.durationSec, caloriesEst: x.caloriesEst, date: x.localDate ?? x.completedAt.slice(0, 10) })),
              ),
          recent: by("WORKOUT#")
            .reverse()
            .slice(0, 5)
            .map((w) => normalize(w))
            .filter((w): w is Session => !!w)
            .map((w) => ({
              id: w.id,
              completedAt: w.completedAt,
              durationSec: w.durationSec,
              caloriesEst: w.caloriesEst,
              blocks: w.blocks.map(({ perRep: _perRep, ...b }) => b),
              decision: decisions[w.id],
            })),
        };
        return res(200, view);
      }
    }
    return res(404, { error: "not found" });
  } catch (err) {
    if (err instanceof z.ZodError) return res(400, { error: "invalid request", issues: err.issues });
    if (err instanceof BadRequest) return res(400, { error: err.message });
    if ((err as Error).name === "ConditionalCheckFailedException") return res(409, { error: "conflict, retry" });
    console.error(err);
    return res(500, { error: "server error" });
  }
};
