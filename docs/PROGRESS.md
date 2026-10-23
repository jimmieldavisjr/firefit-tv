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
| ApiFn (6 routes) | Test · Build | 11 handler tests with mocked DynamoDB/Lambda; esbuild bundle loads in Node |
| CoachFn (Strands agent + rules fallback) | Test (fallback/guardrails) · Build | Bundle loads in Node. **Bedrock not yet invoked** |
| CDK stack | Test · Build | Template assertions (6 routes, TTL, throttling, Bedrock IAM, 0 retries). **Not deployed** |

## Target devices

- **Fire TV:** Fire TV Stick 4K 1st gen (2018), model AFTMM, Fire OS 6.7.1.1 (Android 7.1.2, API 25), 32-bit armeabi-v7a, ~1.3 GB RAM, outputs 3840×2160. Amazon WebView Chromium 118. adb at `192.168.12.253:5555`.
- **Network:** TV, phone and laptop (`192.168.12.210`) are on the same Wi-Fi, 192.168.12.x.
- **Phone:** _TBD_

## Gate 0 evidence (Oct 22, 21:40 PT, on the Fire TV)

`RTCPeerConnection: function` · decoders: VP8, rtx, VP9, AV1, H264, … · DataChannel `ok` · framesDecoded 60 → 104, 15 fps, codec VP8 · `GATE 0: PASS. Level L0 is viable.` (loopback 640×360 @ 15). `decoderImplementation` is not exposed, so hardware vs software decode is unknown.
**Decision:** proceed at L0. The TV only decodes in the real app (the phone encodes), but RAM is tight. Start the phone sender at 960×540 @ 24 fps, ≤ 1.5–2.5 Mbps, preferring H.264 (most likely to be hardware-decoded on this SoC). Drop to L1 settings if the TV struggles.

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
- **21:40** Gate 0 passed on the real Fire TV (L0 viable). Fixed the shell's viewport scaling (4K output) and the page focus outline.
- **21:25** Monorepo scaffolded. Shared contract, ApiFn/CoachFn/trends, CDK stack, probe page, rep engine and Kotlin shell all in place. `pnpm check` green; CDK synth bundles both Lambdas; debug APK builds.
