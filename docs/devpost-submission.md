# Devpost submission draft

> **Rule:** before pasting, every claim below must match something verified in [PROGRESS.md](PROGRESS.md) (Device or Prod level). Delete or rewrite anything that isn't.

**Name:** FireFIT
**Tagline:** A form coach for Fire TV, powered by the phone you already have.
**Track:** Fire TV · **Mini challenge:** AWS Builder

## Inspiration
Most Fire TV homes have a phone within arm's reach but no camera on the TV. Home workout apps play a video and hope you're doing it right. We wanted the TV to watch your form using hardware people already own.

## What it does
FireFIT turns a Fire TV and a phone into a form coach. You pick a program with the remote, scan the QR code on the TV, and prop the phone up. The phone tracks 33 body landmarks on device, counts reps only through full range of motion, and flags form problems. The TV shows your live mirrored video with a skeleton overlay, a rep ring, sets and rest, and depth and tempo for every rep. When you finish, the session is saved. An AI coach agent then reviews your history, explains the result, and decides your next workout (progress, hold, deload or technique focus). That plan becomes the recommended workout the next time you open the app.

## How we built it
- **Fire TV (Fire OS):** a Kotlin WebView shell running a React + TypeScript 10-foot UI, D-pad first.
- **Phone:** a web page (no install) using MediaPipe Pose Landmarker for web and a deterministic TypeScript rep engine built on joint angles from world landmarks.
- **Phone to TV:** WebRTC peer-to-peer over the home network. Video goes over it with the skeleton baked in, plus a DataChannel that carries reps and cues one way and remote commands the other.
- **AWS (CDK):** an API Gateway HTTP API in front of two Lambda functions. ApiFn handles pairing and workouts. CoachFn runs a Strands Agents (TypeScript) coach on Amazon Bedrock (Amazon Nova 2 Lite). The coach reads the profile, history and computed trends from DynamoDB, decides how to progress, and sets the next workout. S3 + CloudFront host the apps.
- Camera video never reaches AWS.

## Challenges
_Fill in from docs/friction-log.md._

## Accomplishments
_Fill in with verified facts._

## What we learned
_TBD_

## What's next
More exercises, automatic exercise detection, household profiles with Amazon Cognito, voice control, and the Fire TV Appstore.

## Built during the hackathon
FireFIT is a new project. All code was written during the submission window.

---

## AWS Builder: services and how FireFIT uses them
- **Amazon API Gateway (HTTP API):** the single HTTPS entry point for the Fire TV app and the phone. It has six explicit routes, CORS locked to our CloudFront origin, and stage throttling. Every WebRTC signaling call requires a random per-room token, and rooms expire after 15 minutes.
- **AWS Lambda (Node.js 22, TypeScript):** ApiFn validates and stores each workout (Zod), updates running metrics, and invokes CoachFn asynchronously so the TV never waits on a model call. CoachFn runs the coaching agent (60 s timeout, no automatic retries).
- **Strands Agents SDK (TypeScript):** CoachFn's agent has three tools: get_profile, get_workout_history and analyze_trends. Statistics are computed in code, not by the model. The agent decides progress / hold / deload / technique, writes a recap, and sets the next workout. Output is a Zod-validated structured plan, and code clamps sets, reps and rest before saving.
- **Amazon Bedrock:** Amazon Nova 2 Lite (cross-region inference profile) is the model the agent reasons with. Only structured workout metrics are sent.
- **Amazon DynamoDB:** one table holds the profile, every workout with per-rep depth/tempo/cues, running metrics per exercise, each AI recommendation with its tool trace and latency, and short-lived pairing rooms (TTL).
- **Supporting:** S3 + CloudFront host the TV and phone apps over HTTPS. AWS CDK (TypeScript) defines everything. CloudWatch Logs records one line per agent run (tools called, decision, latency).

The agent's decision changes the product: the next time the TV opens, the library's "Recommended next" card carries the agent's sets, reps and focus cue.
