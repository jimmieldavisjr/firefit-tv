# Friction log

Logged when a snag happens. Only real, observed issues. Format: task, steps, expected vs actual, severity, workaround, suggestion.

### F-04 AWS Organizations guardrail SCPs blocked the first CDK deploy; finding and removing them was hard
- Task: prepare a fresh AWS account for an agentic deploy (CDK bootstrap, then Lambda, DynamoDB, API Gateway, Bedrock) from the AWS CLI.
- Steps: 1. Created an AWS account and a "FireFIT" project, which turned out to be a member account inside an AWS Organization. 2. Signed in to the CLI and confirmed `aws sts get-caller-identity`. 3. Tested access: CloudFormation, Lambda, DynamoDB, API Gateway, SSM and ECR all failed with "explicit deny in a service control policy". 4. Signed in to the management account, then found and detached SCP #1. 5. Re-tested: the same services were now denied by a second SCP. 6. Detached SCP #2 from the member account's Policies tab. 7. All services worked.
- Expected: the account owner can deploy to their own account. If guardrails block that, the error and the console point straight to what is blocking and how to change it.
- Actual (owner): "The most tedious part was navigating the AWS console to find and change the policies that were blocking my agentic workflow. It wasn't intuitive that I needed a second account and user after already creating one, getting to the policy settings took several hops, and when I finally arrived, the console said I didn't have access, even though I own the entire AWS account."
- Actual (technical): each CLI error named only one SCP ARN, not which account had to change it, so the two deny SCPs had to be found one at a time. The member account can't call `organizations:ListPoliciesForTarget` to see what else applies, and the fix had to be made from the management account.
- Severity: Blocker (no deploy possible until resolved; about an hour lost overnight, close to the deadline).
- Workaround: signed in to the management account, went to AWS Organizations › AWS accounts › FireFIT › Policies, detached both deny SCPs, kept FullAWSAccess, and re-verified with read-only list calls across Lambda, DynamoDB, CloudFormation, API Gateway, SSM and ECR before deploying.
- Suggestion (owner): "An agent-guided onboarding flow would help: at each sign-in, it asks what you're trying to accomplish, then takes you straight to the settings you need, or lets you skip ahead."
- Suggestion (concrete): (1) an access-denied error caused by an SCP should list every denying policy, name the management account, and deep-link to that policy's Targets tab; (2) when the owner opens Organizations from a member account, offer "switch to management account" instead of a bare access denied; (3) project or guardrail setup should list the SCPs it creates and offer a "developer sandbox" preset that allows CloudFormation, Lambda, DynamoDB, API Gateway, SSM and ECR; (4) `cdk bootstrap` could pre-flight the services it needs and name the blocking SCPs up front.
- Related (minor): Bedrock Converse returned "Your account is currently being verified" for roughly the first hour on the new account, even though the model showed AUTHORIZED. It cleared on its own.
- Time: Oct 22, 2026, late evening PT · AWS CLI 2.38.4 · us-east-1

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
