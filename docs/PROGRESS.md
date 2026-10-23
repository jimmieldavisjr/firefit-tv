# FireFIT — engineering status

**Deadline:** Fri Oct 23, 2026, 12:00 PM PT. Devpost locks then.
**Last updated:** Thu Oct 22, 21:25 PT. That leaves ~14.5 h.

Verification levels: **Impl** = code exists · **Build** = compiles/bundles · **Test** = automated tests pass · **Device** = verified on the real Fire TV/phone · **Prod** = verified against the deployed CloudFront + AWS stack.

## Component status

| Component | Level reached | Notes |
| --- | --- | --- |
| Monorepo (pnpm, TS, ESLint, Vitest, CI) | Build · Test | `pnpm check` green: 33 tests |
| Shared contract (`packages/shared`) | Test | Zod schemas + message types |
| Gate 0 probe (`probe.html`) | **Device** | **GATE 0 PASS on the Fire TV** at 640×360 @ 15 loopback (details below). The 1280×720 @ 30 loopback runs the stick out of memory (F-03) |
| Fire TV shell (`apps/tv-shell`) | **Device** | Installed via adb; loads the dev server; D-pad focus moves; 1920-px layout scaled to the 4K output; ~70 MB PSS |
| Rep engine | Test | 10 unit tests (full and half squats, spikes, low visibility, tracking loss, cues). **Not yet tuned on a real body** |
| Pairing/WebRTC client (`rtc.ts`) | Build | Non-trickle ICE, bitrate cap. Not yet exercised |
| Phone page (camera, pose, canvas, stream) | Impl (skeleton) | Block 1 |
| TV UI (library, pair, HUD, summary) | Impl (skeleton) | Block 3; only the library cards and D-pad focus so far |
| ApiFn (6 routes) | **Prod** | 11 handler tests; `pnpm smoke` against the live API: rooms, token 403, SDP round-trip, 400 validation, workout save |
| CoachFn (Strands agent + rules fallback) | **Prod** | Live run: `source: "agent"`, Nova 2 Lite, all 3 tools called, decision `technique`, plan written to PROFILE in ~3 s (Gate 4 backend evidence below). TV summary/library display not built yet |
| CDK stack | **Prod** | Deployed to 720022410355 / us-east-1 in 216 s. CloudFront serves the pages, the 9.4 MB model and the wasm (`application/wasm`); the TV loads production `tv.html` over HTTPS |

## Target devices

- **Fire TV:** Fire TV Stick 4K 1st gen (2018), model AFTMM, Fire OS 6.7.1.1 (Android 7.1.2, API 25), 32-bit armeabi-v7a, ~1.3 GB RAM, outputs 3840×2160. Amazon WebView Chromium 118. adb at `192.168.12.253:5555`.
- **Network:** TV, phone and laptop (`192.168.12.210`) are on the same Wi-Fi, 192.168.12.x.
- **Phone:** Samsung Galaxy S23, Google Chrome.
- **AWS:** profile `firefit`, us-east-1, account 720022410355. Deployed (budget alert $20/month; keep it live until Nov 20).

## Gate 0 evidence (Oct 22, 21:40 PT, on the Fire TV)

`RTCPeerConnection: function` · decoders: VP8, rtx, VP9, AV1, H264, … · DataChannel `ok` · framesDecoded 60 → 104, 15 fps, codec VP8 · `GATE 0: PASS. Level L0 is viable.` (loopback 640×360 @ 15). `decoderImplementation` is not exposed, so hardware vs software decode is unknown.
**Decision:** proceed at L0. The TV only decodes in the real app (the phone encodes), but RAM is tight. Start the phone sender at 960×540 @ 24 fps, ≤ 1.5–2.5 Mbps, preferring H.264 (most likely to be hardware-decoded on this SoC). Drop to L1 settings if the TV struggles.

## Production endpoints

- API: `https://mb1x9zyfw0.execute-api.us-east-1.amazonaws.com`
- Site: `https://dctlk09e4uy0d.cloudfront.net` (`/tv.html`, `/phone.html`, `/probe.html`)
- CoachFn: `FireFit-CoachFn396BAB2D-02ReZQsmqFtG` · Table: `FireFit-TableCD117FA1-BPOZRVISUNFJ` · Distribution: `E3C1Z0QHZ3DCRL`
- CORS dev origins deployed: `http://192.168.12.210:5173`, `https://192.168.12.210:5174`, `http://localhost:5173` (remove at the Gate 5 freeze)

## Gate 4 backend evidence (Oct 22, 22:18 PT)

`pnpm smoke`: 10/10 checks pass. CloudWatch:
`{"evt":"coach_run","workoutId":"d8668abe-…","source":"agent","model":"us.amazon.nova-2-lite-v1:0","decision":"technique","toolCalls":["get_profile","get_workout_history","analyze_trends"],"latencyMs":3020}`
Agent recap: "Session met target with 30 reps in 3 sets. Tempo SD was 0.1 seconds. Form cue appeared on 30% of reps." The decision matches the rules (cue rate 0.3 ≥ 0.3 → technique).

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
- **21:20** Public repo created: https://github.com/jimmieldavisjr/firefit-tv (MIT). CI and the APK release workflow are configured.
- **22:20** SCPs removed. Stack deployed (216 s); `pnpm smoke` 10/10 with a real Strands → Bedrock run; web app published to CloudFront; production `tv.html` loads on the TV. Repo variable `FIREFIT_URL` set for release APKs.
- **21:50** AWS profile works, but an org SCP denies CloudFormation/Lambda/DynamoDB/API Gateway (B-02), and Bedrock is waiting on account verification (B-03). Local work continues.
- **21:40** Gate 0 passed on the real Fire TV (L0 viable). Fixed the shell's viewport scaling (4K output) and the page focus outline.
- **21:25** Monorepo scaffolded. Shared contract, ApiFn/CoachFn/trends, CDK stack, probe page, rep engine and Kotlin shell all in place. `pnpm check` green; CDK synth bundles both Lambdas; debug APK builds.
