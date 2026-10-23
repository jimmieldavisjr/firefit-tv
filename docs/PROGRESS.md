# FireFIT — engineering status

**Deadline:** Fri Oct 23, 2026, 12:00 PM PT. Devpost locks then.
**Last updated:** Thu Oct 22, 23:30 PT. That leaves ~12.5 h.

Verification levels: **Impl** = code exists · **Build** = compiles/bundles · **Test** = automated tests pass · **Device** = verified on the real Fire TV/phone · **Prod** = verified against the deployed CloudFront + AWS stack.

## Component status

| Component | Level reached | Notes |
| --- | --- | --- |
| Monorepo (pnpm, TS, ESLint, Vitest, CI) | Build · Test | `pnpm check` green: 33 tests |
| Shared contract (`packages/shared`) | Test | Zod schemas + message types |
| Gate 0 probe (`probe.html`) | **Device** | **GATE 0 PASS on the Fire TV** at 640×360 @ 15 loopback (details below). The 1280×720 @ 30 loopback runs the stick out of memory |
| Fire TV shell (`apps/tv-shell`) | **Device** | Installed via adb; loads the dev server; D-pad focus moves; 1920-px layout scaled to the 4K output; ~70 MB PSS |
| Rep engine (squat, push-up) + plank engine | Test (push-up/plank) | 10 unit tests (full and half squats, spikes, low visibility, tracking loss, cues). **Not yet tuned on a real body** |
| Pairing/WebRTC client (`rtc.ts`) | **Device** | **Gate 2 PASS**: S23 → Fire TV over the live API (see evidence). Sender cap lowered 2.5 → 1.5 Mbps after the first run |
| Phone page (camera, pose, canvas, stream) | Impl (skeleton) | Block 1 |
| TV UI (library, pair, HUD, summary) | **Device** (library, pair, live, recommended card) · **Test** (state machine, 7 tests) · desktop-verified (full 2-set flow) | Ready/active/rest/paused/disconnected HUD + summary with coach plan; library "Recommended next" from the agent shown on the TV (docs/evidence/tv-library-recommended.png). **Gate 3 PASS** (owner, remote only on the TV). UI must be restyled to match the reference ([UI_BACKLOG.md](UI_BACKLOG.md)) |
| ApiFn (6 routes) | **Prod** | 11 handler tests; `pnpm smoke` against the live API: rooms, token 403, SDP round-trip, 400 validation, workout save |
| CoachFn (Strands agent + rules fallback) | **Prod** (guardrails v2) | Live run: `source: "agent"`, Nova 2 Lite, all 3 tools called, decision `technique`, plan written to PROFILE in ~3 s (Gate 4 backend evidence below). TV summary/library display not built yet |
| CDK stack | **Prod** | Deployed to the FireFIT account / us-east-1 in 216 s. CloudFront serves the pages, the 9.4 MB model and the wasm (`application/wasm`); the TV loads production `tv.html` over HTTPS |

## Target devices

- **Fire TV:** Fire TV Stick 4K 1st gen (2018), model AFTMM, Fire OS 6.7.1.1 (Android 7.1.2, API 25), 32-bit armeabi-v7a, ~1.3 GB RAM, outputs 3840×2160. Amazon WebView Chromium 118. adb at `192.168.12.253:5555`.
- **Network:** TV, phone and laptop (`192.168.12.210`) are on the same Wi-Fi, 192.168.12.x.
- **Phone:** Samsung Galaxy S23, Google Chrome.
- **AWS:** profile `firefit`, us-east-1, FireFIT member account. Deployed (budget alert $20/month; keep it live until Nov 20).

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

## Gate 2 evidence (Oct 22, ~23:00 PT, real devices)

TV screenshot over adb while paired with the S23: live phone video (portrait 540×960) on the TV, rep ring at 17, last rep "depth 70° · tempo 3.7s", knee cue shown. Debug strip: `link connected · msg #2242 state 0ms ago · angle 106° · phone 39 fps · TV video 14 fps 540×960 H264 · decoded 3336 · lost 228`.
**Result: PASS** (live video decodes on the TV; real reps from the phone update the TV counter). Follow-ups: the TV decoded ~14 fps with ~6% loss at a 2.5 Mbps cap, so it's now 1.5 Mbps (L1); film in landscape; set targets are enforced in Block 3.
**Gate 1 accuracy (10/10 full, 0/5 half) is still unconfirmed:** the owner's report used the pre-filled template both times.

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
- **02:55** Judge install plan (owner-approved via the forked session): README "Install on Fire TV" (Downloader and adb paths, compatibility, troubleshooting, standalone phone.html); release asset renamed to a constant `firefit.apk` so `releases/latest/download/firefit.apk` always serves the newest build (no release cut yet). Pairing never hangs: if the phone joins but the peer link fails or doesn't open within 25 s, or the code expires, the TV shows "Couldn't connect" with network tips and Re-pair (Prod, browser-verified with a simulated phone that drops out). Production stack redeployed **without dev CORS origins** (now CloudFront only).
- **02:20** Audio and store kit: 11 ElevenLabs sound effects (Sound Effects API, generated at dev time) bundled in the APK and verified playing natively on the Fire TV via the `FireFitHost` bridge (SoundPool; music/effects volumes on the home screen). Music is **blocked**: the owner's key lacks the `music_generation` permission (401). Appstore listing kit in docs/store-assets (tile, cover background, icons, screenshots, short/long description); the Fire TV home background and description appear only through an Appstore listing.
- **01:35** Owner-approved summary spec (via the forked session): after-action report sections (what went well / what to fix / next time) from the existing Strands coach (rules fallback fills gaps, labeled Rules); **Amazon Polly read-aloud** via `GET /workouts/{id}/voice` (generative Matthew → neural fallback, ApiFn-only IAM); TV autoplays the voice (music ducked), Play/Pause pauses, Select mutes (remembered), Back stops and returns. Verified on the Fire TV: voice plays, mute/unmute, pause/resume, Back. Also: lifetime stats + streak item, roomier HUD, refined rep card, native audio engine (ExoPlayer/SoundPool) awaiting ElevenLabs assets.
- **01:15** v3 on the Fire TV (adb screenshots docs/evidence/v3-*.png): first-run onboarding (name via the Fire TV keyboard, level, weight, goal) and household profiles (switch/add) backed by new `/profiles` routes and per-profile data; library shows today's workout as one connected session with the owner's exercise photos, plus past sessions that open an after-action report (`GET /workouts/{id}`); animated break screen (FireFIT flame art, countdown ring, next exercise photo, rotating tips); photos in Up next / Then; consistent Web Audio cues (navigation, select, back, reps, set complete, countdown ticks, session complete); new launcher banner/icon from the app-card art; 1920×1080 store background in docs/store-assets. Shoe logos blurred in the app's image copies. TV app reset to first-run so the owner creates their own profile.
- **00:27 (Fri)** Session v2 shipped and verified on the Fire TV with a simulated phone (adb screenshots in docs/evidence/v2-*.png): one session of squats → push-ups → plank with rests and a "move your phone" transition; push-up engine hardened (both arms, forgiving thresholds, torso-horizontal gate, side-correct hip cue); new plank hold engine (sag/pike cues); calories (est.) from MET × 80 kg; glass UI v2 (real backdrop blur, centered top bar with "JD · Jimmie Davis", bottom bar spread across the screen); in-depth summary (time between reps, tempo, depth, holds) with a live AI coach chat that streams the Strands agent's tool calls and analysis, then the three-exercise plan. Smoke 13/13. **Push-up and plank detection are unit-tested only; they still need a real-body test on the S23.**
- **23:50** UI polish pass 1 shipped to CloudFront and checked on the Fire TV: library, pairing, workout HUD over live video (simulated phone), rest and summary with a real Strands plan (Progress → 3 × 7). Fixed a body background that hid the video layer. Screenshots in docs/evidence/.
- **23:27** **Gate 3 PASS** (owner report: "Gate 3 good", the remote-only 2 × 5 workout on the Fire TV). Feedback: the UI works but must match the reference (dark glass, full-screen landscape); remove the Up/Down label; the rep-counter HUD needs more activity. Logged in UI_BACKLOG.md.
- **~23:15** Block 3 built: workout state machine + HUD + summary + recommended card. Desktop rehearsal against the live stack passed (2 sets, pause, skip rest, coach plan in ~5 s). The agent said "progress" without raising reps and gave a squat cue for push-ups, so the guardrails now force targets to match the decision and cues to match the exercise (4 new tests; hotswapped; smoke 10/10). The shell APK now defaults to CloudFront.
- **Data note:** the guest history contains smoke-test fixtures and one simulated push-up session. Clear them before recording the demo (needs owner OK: deletes DynamoDB items).
- **~23:00** **Gate 2 PASS** on real devices (adb screenshot evidence). Phone start-screen bug fixed (`[hidden]` overridden by `display:flex`).
- **22:20** SCPs removed. Stack deployed (216 s); `pnpm smoke` 10/10 with a real Strands → Bedrock run; web app published to CloudFront; production `tv.html` loads on the TV. Repo variable `FIREFIT_URL` set for release APKs.
- **21:50** AWS profile works, but an org SCP denies CloudFormation/Lambda/DynamoDB/API Gateway (B-02), and Bedrock is waiting on account verification (B-03). Local work continues.
- **21:40** Gate 0 passed on the real Fire TV (L0 viable). Fixed the shell's viewport scaling (4K output) and the page focus outline.
- **21:25** Monorepo scaffolded. Shared contract, ApiFn/CoachFn/trends, CDK stack, probe page, rep engine and Kotlin shell all in place. `pnpm check` green; CDK synth bundles both Lambdas; debug APK builds.
