# Friction log

Logged when a snag happens. Only real, observed issues. Format: task, steps, expected vs actual, severity, workaround, suggestion.

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
