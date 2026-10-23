import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
export const T = process.env.TABLE ?? "";
export const U = "USER#guest"; // one demo profile; Cognito is the post-hackathon step

/* Single-table layout (pk = USER#guest unless noted)
   sk PROFILE                      name, goal, level, nextWorkout, focusCue, lastDecision
   sk WORKOUT#<iso>#<id>           WorkoutInput + id, completedAt   (per-rep depth/tempo/cue)
   sk METRIC#<exercise>            sessions, totalReps, bestReps, lastAt
   sk REC#<workoutId>              CoachPlan: decision, recap, nextWorkout, toolCalls, latencyMs
   pk ROOM#<code>, sk META         token, offer, answer, ttl (15 min)                          */
