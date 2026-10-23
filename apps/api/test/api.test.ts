import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../fixtures/session-full.json";

const send = vi.fn();
const lambdaSend = vi.fn();
vi.mock("../src/db", () => ({
  db: { send: (...a: unknown[]) => send(...a) },
  T: "table",
  U: "USER#guest",
  PROFILES: "PROFILES",
  userKey: (id: string) => `USER#${id}`,
}));
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send = (...a: unknown[]) => lambdaSend(...a);
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}));

const { handler } = await import("../src/api");

const ev = (routeKey: string, opts: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 =>
  ({
    routeKey,
    headers: {},
    pathParameters: {},
    requestContext: { http: { method: routeKey.split(" ")[0] } },
    ...opts,
  }) as unknown as APIGatewayProxyEventV2;

beforeEach(() => {
  send.mockReset();
  lambdaSend.mockReset();
});

describe("rooms", () => {
  it("creates a 6-digit room with a token", async () => {
    send.mockResolvedValue({});
    const r = await handler(ev("POST /rooms"));
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body!);
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.token).toMatch(/[0-9a-f-]{36}/);
  });

  const room = (token = "tok") => ({ Item: { token, ttl: Math.floor(Date.now() / 1000) + 60, offer: "v=0 offer-sdp" } });

  it("rejects a wrong token with 403", async () => {
    send.mockResolvedValue(room("right-token"));
    const r = await handler(
      ev("GET /rooms/{code}/{kind}", { pathParameters: { code: "123456", kind: "offer" }, headers: { "x-room-token": "wrong-token" } }),
    );
    expect(r.statusCode).toBe(403);
  });

  it("returns the offer for the right token", async () => {
    send.mockResolvedValue(room("tok"));
    const r = await handler(
      ev("GET /rooms/{code}/{kind}", { pathParameters: { code: "123456", kind: "offer" }, headers: { "x-room-token": "tok" } }),
    );
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!).sdp).toBe("v=0 offer-sdp");
  });

  it("returns 204 while the answer is not posted yet", async () => {
    send.mockResolvedValue(room("tok"));
    const r = await handler(
      ev("GET /rooms/{code}/{kind}", { pathParameters: { code: "123456", kind: "answer" }, headers: { "x-room-token": "tok" } }),
    );
    expect(r.statusCode).toBe(204);
  });

  it("rejects malformed codes and kinds without touching the table", async () => {
    const bad = await handler(ev("GET /rooms/{code}/{kind}", { pathParameters: { code: "abc", kind: "offer" } }));
    const kind = await handler(ev("GET /rooms/{code}/{kind}", { pathParameters: { code: "123456", kind: "state" } }));
    expect([bad.statusCode, kind.statusCode]).toEqual([404, 404]);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an expired room", async () => {
    send.mockResolvedValue({ Item: { token: "tok", ttl: 1 } });
    const r = await handler(
      ev("PUT /rooms/{code}/{kind}", {
        pathParameters: { code: "123456", kind: "answer" },
        headers: { "x-room-token": "tok" },
        body: JSON.stringify({ sdp: "v=0 answer-sdp" }),
      }),
    );
    expect(r.statusCode).toBe(403);
  });
});

describe("workouts", () => {
  it("saves a valid workout and invokes the coach asynchronously", async () => {
    send.mockResolvedValue({});
    lambdaSend.mockResolvedValue({});
    const r = await handler(ev("POST /workouts", { body: JSON.stringify(fixture) }));
    expect(r.statusCode).toBe(201);
    expect(send).toHaveBeenCalledTimes(7); // workout + (metrics, best) per exercise
    expect(lambdaSend).toHaveBeenCalledOnce();
    expect(lambdaSend.mock.calls[0][0].input.InvocationType).toBe("Event");
  });

  it("returns 400 for invalid workouts and bad JSON", async () => {
    const invalid = await handler(ev("POST /workouts", { body: JSON.stringify({ ...fixture, blocks: [] }) }));
    const notJson = await handler(ev("POST /workouts", { body: "{" }));
    expect([invalid.statusCode, notJson.statusCode]).toEqual([400, 400]);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 202 until the coach plan exists, then the plan", async () => {
    const id = "6f1c1a2e-1d2b-4c3d-9e8f-0a1b2c3d4e5f";
    send.mockResolvedValueOnce({});
    expect((await handler(ev("GET /workouts/{id}/coach", { pathParameters: { id } }))).statusCode).toBe(202);
    send.mockResolvedValueOnce({ Item: { pk: "USER#guest", sk: `REC#${id}`, status: "running", transcript: [{ kind: "tool", text: "get_profile", at: 5 }] } });
    const live = JSON.parse((await handler(ev("GET /workouts/{id}/coach", { pathParameters: { id } }))).body!);
    expect(live).toEqual({ status: "running", transcript: [{ kind: "tool", text: "get_profile", at: 5 }] });
    send.mockResolvedValueOnce({ Item: { pk: "USER#guest", sk: `REC#${id}`, status: "done", decision: "progress", source: "agent", transcript: [] } });
    const r = await handler(ev("GET /workouts/{id}/coach", { pathParameters: { id } }));
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!)).toMatchObject({ status: "done", decision: "progress", source: "agent" });
  });
});

describe("profile", () => {
  it("falls back to a guest profile, strips keys and per-rep data, and reads older records", async () => {
    send.mockResolvedValue({
      Items: [
        { pk: "USER#guest", sk: "METRIC#squat", sessions: 2, totalReps: 20, bestReps: 10 },
        { pk: "USER#guest", sk: "PROFILE", nextWorkout: { exercise: "squat", sets: 3, targetReps: 12, restSec: 60 } },
        { pk: "USER#guest", sk: "REC#w2", decision: "hold" },
        { pk: "USER#guest", sk: "WORKOUT#2026-10-22T01#w1", id: "w1", completedAt: "2026-10-22T01", exercise: "squat", sets: 2, targetReps: 5, reps: 10, durationSec: 60, perRep: [] },
        { pk: "USER#guest", sk: "WORKOUT#2026-10-23T01#w2", id: "w2", completedAt: "2026-10-23T01", ...fixture },
      ],
    });
    const body = JSON.parse((await handler(ev("GET /profile"))).body!);
    expect(body.profile).toMatchObject({ name: "Guest", weightKg: 80 });
    expect(body.profile.next).toBeUndefined(); // the old single-exercise plan is not a valid session plan
    expect(body.metrics.squat).toEqual({ sessions: 2, totalReps: 20, bestReps: 10 });
    expect(body.recent.map((r: { id: string }) => r.id)).toEqual(["w2", "w1"]);
    expect(body.recent[0].decision).toBe("hold");
    expect(body.recent[0].blocks[0].perRep).toBeUndefined();
    expect(body.recent[1].blocks[0]).toMatchObject({ exercise: "squat", perSet: [10] });
  });
});

describe("profiles", () => {
  it("creates a profile with an 8-char id and seeds its PROFILE item", async () => {
    send.mockResolvedValue({});
    const r = await handler(ev("POST /profiles", { body: JSON.stringify({ name: "Jimmie Davis", level: "Beginner", goal: "Strength + form", weightKg: 84 }) }));
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body!);
    expect(body.id).toMatch(/^[a-z0-9]{8}$/);
    expect(send.mock.calls[1][0].input.Item).toMatchObject({ pk: `USER#${body.id}`, sk: "PROFILE", name: "Jimmie Davis", weightKg: 84 });
  });

  it("rejects incomplete profiles and malformed profile ids", async () => {
    const bad = await handler(ev("POST /profiles", { body: JSON.stringify({ name: "", level: "Beginner", goal: "Strength + form", weightKg: 84 }) }));
    const badId = await handler(ev("GET /profile", { headers: { "x-profile-id": "../../etc" } }));
    expect([bad.statusCode, badId.statusCode]).toEqual([400, 400]);
    expect(send).not.toHaveBeenCalled();
  });

  it("scopes data to the requested profile", async () => {
    send.mockResolvedValue({ Items: [] });
    await handler(ev("GET /profile", { headers: { "x-profile-id": "ab12cd34" } }));
    expect(send.mock.calls[0][0].input.ExpressionAttributeValues[":u"]).toBe("USER#ab12cd34");
  });

  it("returns the after-action report: session + coach run", async () => {
    const id = "6f1c1a2e-1d2b-4c3d-9e8f-0a1b2c3d4e5f";
    send.mockResolvedValueOnce({ Items: [{ pk: "USER#guest", sk: `WORKOUT#x#${id}`, id, completedAt: "2026-10-23T01:00:00Z", ...fixture }] });
    send.mockResolvedValueOnce({ Item: { pk: "USER#guest", sk: `REC#${id}`, status: "done", decision: "hold", transcript: [{ kind: "text", text: "Nice work.", at: 1 }] } });
    const body = JSON.parse((await handler(ev("GET /workouts/{id}", { pathParameters: { id } }))).body!);
    expect(body.session.blocks).toHaveLength(3);
    expect(body.coach).toMatchObject({ status: "done", decision: "hold" });
  });
});
