# Product feedback

One entry per tool, API and SDK, filled in from real experience during the build (pasted into Devpost). Placeholders marked _TBD_ are filled in as each part is exercised. Nothing here is written in advance.

### Fire TV / Fire OS (Amazon WebView, ADB, Leanback launcher)
- Used for: the TV app (Kotlin WebView shell + React 10-foot UI), sideloading, on-device debugging via chrome://inspect
- Worked well: _TBD (after Gate 0)_
- Needs work: _TBD_
- Onboarding (zero to hello world): _TBD_
- Build again? _TBD_

### Strands Agents SDK (TypeScript) + Amazon Bedrock (Amazon Nova 2 Lite)
- Used for: the coach agent in CoachFn: 3 tools, Zod structured output, running on Lambda
- Worked well: the TypeScript API (`Agent`, `tool` with a Zod `inputSchema`, `BedrockModel`, `structuredOutputSchema`) matched the documented quickstart in v1.22.0. The ESM-only package bundled cleanly for Lambda with esbuild (ESM output + `createRequire` banner); the 3.2 MB bundle imports without errors in Node 24.
- First live run (Lambda, Node 22, arm64, 1024 MB): the agent called all three tools in the order the system prompt asked and returned a structured plan that passed Zod validation. The decision matched our deterministic rules. 3.0 s end to end, including DynamoDB writes. Nova 2 Lite worked with tool use + structured output, so we didn't need the Claude Haiku fallback.
- Needs work: _TBD_
- Bedrock onboarding: a new account first returned AccessDeniedException "Your account is currently being verified" for a while (under an hour in our case), even though model access already showed AUTHORIZED. The status page could say this up front.
- Build again? _TBD_

### Amazon API Gateway (HTTP API) · AWS Lambda · Amazon DynamoDB
- Used for: HTTPS routes with CORS + throttling; ApiFn + async CoachFn; single-table storage with TTL for pairing rooms
- Worked well: the whole stack deployed in 216 s on the first try. HTTP API `corsPreflight` plus per-route Lambda integration needed no handler-side CORS. Payload 2.0 `routeKey` made routing a simple switch. Async `InvocationType: "Event"` keeps the TV's save call to milliseconds while the agent runs.
- Needs work: _TBD_

### S3 + CloudFront · AWS CDK · CloudWatch Logs
- Used for: hosting the TV and phone pages over HTTPS, infrastructure as code, agent run traces
- Worked well: CDK `NodejsFunction` + `aws-cdk-lib/assertions` let us unit-test the template (routes, TTL, IAM, retries) before any deploy.
- Needs work: _TBD_

### MediaPipe Tasks Vision (third party) · WebRTC (browser)
- Used for: on-device pose landmarks on the phone; phone-to-TV video + DataChannel
- _TBD_
