# Friction log

Logged when a snag happens. Only real, observed issues. Format: task, steps, expected vs actual, severity, workaround, suggestion.

### F-04 Each SCP denial names only one policy, so fixing a deploy block took two rounds
- Task: run `cdk bootstrap` / `cdk deploy` in a member account of the owner's own AWS Organization
- Steps: 1. `aws lambda list-functions` → `explicit deny in a service control policy: …/p-39p6wt1g` 2. owner deletes that SCP 3. retry
- Expected: access works, or the error lists every policy that denies the action
- Actual: the same denial, now naming a second SCP `p-p10l2788` (attached higher in the org). The member account can't call `organizations:ListPoliciesForTarget` to see what else applies.
- Severity: Major (blocked all deploys for ~30 min)
- Workaround: owner removed both SCPs from the management account. We confirmed with read-only list calls across Lambda, DynamoDB, CloudFormation, API Gateway, SSM and ECR before deploying.
- Suggestion: list all denying policies in the error, or point to a "why can't I…" view such as IAM Access Analyzer's policy check. `cdk bootstrap` could pre-flight the services it needs (CloudFormation, ECR, SSM, S3, IAM) and name the blocking SCPs up front.
- Time: Oct 22 21:50–22:12 PT · AWS CLI 2.38.4

### F-03 A 720p WebRTC loopback in Amazon WebView exhausts memory on the Fire TV Stick 4K (1st gen)
- Task: Gate 0: prove that the Fire OS WebView can decode WebRTC video before building the TV app
- Steps: 1. sideload the WebView shell 2. load a page that streams a 1280×720 @ 30 canvas through two local RTCPeerConnections (encode + decode on the TV) 3. read getStats()
- Expected: framesDecoded rises, or a clear WebRTC error
- Actual: within ~4 s Android's low-memory killer terminated almost every process (Netflix, Hulu, Alexa services, the IME, the WebView service) and then our app. The screen dropped back to Settings with no error shown. Logcat shows only "Process … has died" lines.
- Severity: Major (it looks like a crash and gives no diagnostic)
- Workaround: parameterized the probe; 640×360 @ 15 passes (framesDecoded 60 → 104, DataChannel ok). The real app only decodes on the TV. Cost ~15 min.
- Suggestion: document WebRTC support and per-device media limits for Amazon WebView on each Fire TV model (max decode resolution, whether hardware decode is used, and memory guidance). Surfacing an `onRenderProcessGone`-style reason in logcat would also help.
- Time: Oct 22 21:30 PT · Fire TV Stick 4K (AFTMM), Fire OS 6.7.1.1, Amazon WebView 118

### F-01 Android Gradle Plugin 9.4.1 fails on Gradle 9.4.1 with an opaque error
- Task: create the Fire TV WebView shell build (Gradle wrapper + AGP)
- Steps: 1. `plugins { id("com.android.application") version "9.4.1" }` 2. run `gradle wrapper` with the locally cached Gradle 9.4.1
- Expected: either success, or an error stating the minimum Gradle version for this AGP
- Actual: `java.lang.NoClassDefFoundError: org/gradle/features/binding/ProjectTypeBinding`
- Severity: Minor
- Workaround: generated the wrapper from an empty directory with Gradle 9.8.2 (current); the build then succeeded. Cost ~5 min.
- Suggestion: have AGP check the running Gradle version first and print "AGP 9.4.x requires Gradle ≥ X". The Fire TV "build a hybrid app" docs could also pin a known-good AGP/Gradle pair.
- Time: Oct 22 21:15 PT · Windows 11, JDK 21, AGP 9.4.1

### F-02 pnpm 11 silently ignores `onlyBuiltDependencies`, so esbuild (needed by CDK bundling) is not built
- Task: install workspace dependencies for the CDK app (esbuild bundles the Lambdas)
- Steps: 1. add `onlyBuiltDependencies: [esbuild]` to `pnpm-workspace.yaml` (the pnpm 9/10 setting) 2. `pnpm install`
- Expected: esbuild's postinstall runs
- Actual: `ERR_PNPM_IGNORED_BUILDS`; pnpm inserted `allowBuilds: { esbuild: set this to true or false }` into the file
- Severity: Minor
- Workaround: replaced it with `allowBuilds: { esbuild: true }`. Cost ~3 min.
- Suggestion: the AWS CDK `NodejsFunction` docs could mention that pnpm 11 requires esbuild in `allowBuilds`.
- Time: Oct 22 21:07 PT · pnpm 11.15.0
