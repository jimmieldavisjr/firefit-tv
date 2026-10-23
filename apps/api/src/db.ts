import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
export const T = process.env.TABLE ?? "";
export const U = "USER#guest"; // the original single demo profile; older data lives here
/** Partition key for one profile's data. Profiles have no passwords; Cognito is the post-hackathon step. */
export const userKey = (profileId: string) => `USER#${profileId}`;
export const PROFILES = "PROFILES"; // pk of the profile registry: sk P#<id>

/* Single-table layout (pk = USER#<profileId> unless noted)
   sk PROFILE                      name, goal, level, nextWorkout, focusCue, lastDecision
   sk WORKOUT#<iso>#<id>           WorkoutInput + id, completedAt   (per-rep depth/tempo/cue)
   sk METRIC#<exercise>            sessions, totalReps, bestReps, lastAt
   sk REC#<workoutId>              CoachPlan: decision, recap, nextWorkout, toolCalls, latencyMs
   pk PROFILES, sk P#<id>          id, name, level, goal, weightKg, createdAt
   pk ROOM#<code>, sk META         token, offer, answer, ttl (15 min)                          */
