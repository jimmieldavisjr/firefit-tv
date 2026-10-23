// ApiFn behind the API Gateway HTTP API (payload format 2.0).
// CORS is answered by the HTTP API's corsPreflight; do not add CORS headers here.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { WorkoutInput, type ProfileView } from "@firefit/shared";
import { db, T, U } from "./db";

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
    switch (e.routeKey) {
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
        // save, update running metrics, wake the coach asynchronously
        const w = WorkoutInput.parse(parseBody(e));
        const id = randomUUID();
        const completedAt = new Date().toISOString();
        await db.send(
          new PutCommand({ TableName: T, Item: { pk: U, sk: `WORKOUT#${completedAt}#${id}`, id, completedAt, ...w } }),
        );
        await db.send(
          new UpdateCommand({
            TableName: T,
            Key: { pk: U, sk: `METRIC#${w.exercise}` },
            UpdateExpression: "ADD sessions :one, totalReps :r SET lastAt = :at",
            ExpressionAttributeValues: { ":one": 1, ":r": w.reps, ":at": completedAt },
          }),
        );
        await db
          .send(
            new UpdateCommand({
              TableName: T,
              Key: { pk: U, sk: `METRIC#${w.exercise}` },
              UpdateExpression: "SET bestReps = :r",
              ConditionExpression: "attribute_not_exists(bestReps) OR bestReps < :r",
              ExpressionAttributeValues: { ":r": w.reps },
            }),
          )
          .catch(() => {}); // not a new best: fine
        await lambda.send(
          new InvokeCommand({
            FunctionName: process.env.COACH_FN,
            InvocationType: "Event", // async: the TV never waits on a model call
            Payload: Buffer.from(JSON.stringify({ workoutId: id })),
          }),
        );
        return res(201, { id, completedAt });
      }

      case "GET /workouts/{id}/coach": {
        // TV polls until the agent (or the rules fallback) writes the plan
        if (!WorkoutId.safeParse(p.id).success) return res(404, { error: "not found" });
        const { Item } = await db.send(new GetCommand({ TableName: T, Key: { pk: U, sk: `REC#${p.id}` } }));
        if (!Item) return res(202);
        const { pk: _pk, sk: _sk, ...plan } = Item;
        return res(200, plan);
      }

      case "GET /profile": {
        // library screen in one query
        const { Items = [] } = await db.send(
          new QueryCommand({ TableName: T, KeyConditionExpression: "pk = :u", ExpressionAttributeValues: { ":u": U } }),
        );
        const by = (pre: string) => Items.filter((i) => String(i.sk).startsWith(pre));
        const decisions = Object.fromEntries(by("REC#").map((r) => [String(r.sk).slice(4), r.decision]));
        const strip = ({ pk: _pk, sk: _sk, ...rest }: Record<string, unknown>) => rest;
        const stored = by("PROFILE")[0];
        const view: ProfileView = {
          profile: {
            name: "Guest",
            goal: "Strength + form",
            level: "Beginner",
            ...(stored ? strip(stored) : {}),
          } as ProfileView["profile"],
          metrics: Object.fromEntries(by("METRIC#").map((m) => [String(m.sk).slice(7), strip(m)])),
          recent: by("WORKOUT#")
            .reverse()
            .slice(0, 5)
            .map((w) => {
              const { perRep: _perRep, ...rest } = strip(w);
              return { ...rest, decision: decisions[String(w.id)] } as ProfileView["recent"][number];
            }),
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
