# FireFIT — engineering status

**Deadline:** Fri Oct 23, 2026, 12:00 PM PT. Devpost locks then.
**Last updated:** Thu Oct 22, 21:25 PT. That leaves ~14.5 h.

Verification levels: **Impl** = code exists · **Build** = compiles/bundles · **Test** = automated tests pass · **Device** = verified on the real Fire TV/phone · **Prod** = verified against the deployed CloudFront + AWS stack.

## Component status

| Component | Level reached | Notes |
| --- | --- | --- |
| Monorepo (pnpm, TS, ESLint, Vitest, CI) | Build · Test | `pnpm check` green: 33 tests |
| Shared contract (`packages/shared`) | Test | Zod schemas + message types |
| Gate 0 probe (`probe.html`) | Build | Loopback encode→decode, DataChannel, framesDecoded verdict. **Not yet run on the TV** |
| Fire TV shell (`apps/tv-shell`) | Build | AGP 9.4.1 / Gradle 9.8.2; debug APK 885 KB; Leanback + banner confirmed with aapt2. **Not yet installed on the TV** |
| Rep engine | Test | 10 unit tests (full and half squats, spikes, low visibility, tracking loss, cues). **Not yet tuned on a real body** |
| Pairing/WebRTC client (`rtc.ts`) | Build | Non-trickle ICE, bitrate cap. Not yet exercised |
| Phone page (camera, pose, canvas, stream) | Impl (skeleton) | Block 1 |
| TV UI (library, pair, HUD, summary) | Impl (skeleton) | Block 3; only the library cards and D-pad focus so far |
| ApiFn (6 routes) | Test · Build | 11 handler tests with mocked DynamoDB/Lambda; esbuild bundle loads in Node |
| CoachFn (Strands agent + rules fallback) | Test (fallback/guardrails) · Build | Bundle loads in Node. **Bedrock not yet invoked** |
| CDK stack | Test · Build | Template assertions (6 routes, TTL, throttling, Bedrock IAM, 0 retries). **Not deployed** |

## Schedule (recalculated from 21:25 PT)

| Block | Target (PT) | Gate | Owner involvement |
| --- | --- | --- | --- |
| 0 Setup + device truth | 21:00–22:00 | Probe passes on the TV | Fire TV OS check, ADB, AWS credentials |
| 1 Phone sensing | 22:00–23:00 | 10 real squats = 10; half squats = 0 | Perform squats |
| 2 Phone→TV link | 23:00–23:50 | **Hard gate:** live video + rep counter on the TV | Phone + TV on the same Wi-Fi |
| 3 TV experience | 23:50–00:40 | Remote-only 2×5 workout | Remote test |
| 4 Coach agent | 00:40–01:40 | Plan with `source: "agent"`; library shows it | Bedrock model access |
| 5 Freeze | 01:40–02:10 | 3 cold-start runs on CloudFront; release v1.0 | Runs |
| 6 Demo video | Fri 07:30–08:45 | Public YouTube, under 3:00 | Record (owner) |
| 7 Submit | Fri 08:45–10:45 | Devpost submitted; checked logged-out | Submit (owner) |
| Buffer | 10:45–12:00 | — | — |

## Log

- **21:00** Repo empty except `docs/reference`. Read the Ship Plan and the directive.
- **21:25** Monorepo scaffolded. Shared contract, ApiFn/CoachFn/trends, CDK stack, probe page, rep engine and Kotlin shell all in place. `pnpm check` green; CDK synth bundles both Lambdas; debug APK builds.
