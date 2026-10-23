import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../fixtures/squat-3x10.json";

const send = vi.fn();
const lambdaSend = vi.fn();
vi.mock("../src/db", () => ({ db: { send: (...a: unknown[]) => send(...a) }, T: "table", U: "USER#guest" }));
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
    expect(send).toHaveBeenCalledTimes(3); // workout, metrics, best reps
    expect(lambdaSend).toHaveBeenCalledOnce();
    expect(lambdaSend.mock.calls[0][0].input.InvocationType).toBe("Event");
  });

  it("returns 400 for invalid workouts and bad JSON", async () => {
    const invalid = await handler(ev("POST /workouts", { body: JSON.stringify({ ...fixture, sets: 0 }) }));
    const notJson = await handler(ev("POST /workouts", { body: "{" }));
    expect([invalid.statusCode, notJson.statusCode]).toEqual([400, 400]);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 202 until the coach plan exists, then the plan", async () => {
    const id = "6f1c1a2e-1d2b-4c3d-9e8f-0a1b2c3d4e5f";
    send.mockResolvedValueOnce({});
    expect((await handler(ev("GET /workouts/{id}/coach", { pathParameters: { id } }))).statusCode).toBe(202);
    send.mockResolvedValueOnce({ Item: { pk: "USER#guest", sk: `REC#${id}`, decision: "progress", source: "agent" } });
    const r = await handler(ev("GET /workouts/{id}/coach", { pathParameters: { id } }));
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!)).toEqual({ decision: "progress", source: "agent" });
  });
});

describe("profile", () => {
  it("falls back to a guest profile and strips keys and per-rep data", async () => {
    send.mockResolvedValue({
      Items: [
        { pk: "USER#guest", sk: "METRIC#squat", sessions: 2, totalReps: 20, bestReps: 10 },
        { pk: "USER#guest", sk: "REC#w2", decision: "hold" },
        { pk: "USER#guest", sk: "WORKOUT#2026-10-23T01#w2", id: "w2", ...fixture },
      ],
    });
    const r = await handler(ev("GET /profile"));
    const body = JSON.parse(r.body!);
    expect(body.profile.name).toBe("Guest");
    expect(body.metrics.squat).toEqual({ sessions: 2, totalReps: 20, bestReps: 10 });
    expect(body.recent[0].decision).toBe("hold");
    expect(body.recent[0].perRep).toBeUndefined();
    expect(body.recent[0].pk).toBeUndefined();
  });
});
