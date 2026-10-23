# Development guide

## One-time setup

```bash
corepack enable            # pnpm 11 (pinned in package.json "packageManager")
pnpm install
pnpm assets                # MediaPipe wasm -> apps/web/public/mediapipe/wasm, models -> apps/web/public/models
cp .env.example apps/web/.env.local   # then fill VITE_API_URL from cdk-outputs.json
```

The Android SDK lives at `%LOCALAPPDATA%\Android\Sdk` on this machine. `adb` is in `platform-tools`, so add it to PATH or call it by full path:

```powershell
$env:Path += ";$env:LOCALAPPDATA\Android\Sdk\platform-tools"
```

The Gradle build needs JDK 17–21: set `JAVA_HOME` to Android Studio's bundled JBR or `C:\Program Files\Android\openjdk\jdk-21.0.8`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm check` | typecheck + lint + all unit tests + production web build |
| `pnpm test` | Vitest across `packages/shared`, `apps/api`, `apps/web`, `infra` |
| `pnpm dev` | TV dev server, plain HTTP: `http://<laptop-ip>:5173/tv.html` |
| `pnpm --filter @firefit/web dev:phone` | Phone dev server, HTTPS (camera needs a secure context): `https://<laptop-ip>:5174/phone.html` |
| `pnpm synth` | CDK synth, which also bundles both Lambdas with esbuild |
| `pnpm deploy:infra` | Deploys the stack and writes `cdk-outputs.json` |
| `pnpm --filter @firefit/infra hotswap` | Pushes Lambda code changes in seconds |
| `pnpm deploy:web` | Builds against the deployed API and publishes to S3 + CloudFront |

### Why two dev servers

The Fire TV WebView won't accept the self-signed certificate that the HTTPS dev server uses, and the phone camera refuses to run without HTTPS. So during development the TV loads `http://…:5173` and the phone loads `https://…:5174`. Set `VITE_PHONE_ORIGIN=https://<laptop-ip>:5174` in `apps/web/.env.local` so the pairing QR on the TV points at the HTTPS server. Deploy the stack with `DEV_ORIGINS=http://<laptop-ip>:5173,https://<laptop-ip>:5174` so API Gateway CORS allows both. In production, both pages come from CloudFront over HTTPS, and none of this applies.

## Fire TV

```bash
# On the TV: Settings > My Fire TV > About: click the device name 7x (developer mode)
#            Settings > My Fire TV > Developer Options > ADB Debugging: ON
#            Settings > My Fire TV > About > Network: note the IP
adb connect <tv-ip>:5555          # accept the prompt on the TV
adb devices

cd apps/tv-shell
./gradlew installDebug
# point the shell at the laptop dev server (the probe answers Gate 0 in ~10 s)
adb shell am start -n app.firefit.tv/.MainActivity --es url "http://<laptop-ip>:5173/probe.html"
adb shell am start -n app.firefit.tv/.MainActivity --es url "http://<laptop-ip>:5173/tv.html"
adb shell am force-stop app.firefit.tv

# Inspect the WebView from desktop Chrome: chrome://inspect/#devices
# Record the TV screen for the demo (max 180 s on most devices):
adb shell screenrecord --bit-rate 8000000 /sdcard/firefit.mp4
adb pull /sdcard/firefit.mp4
```

## API smoke tests

```bash
API=$(node -p "require('./cdk-outputs.json').FireFit.ApiUrl")
curl -s -X POST $API/rooms
curl -s $API/profile
curl -s -X POST $API/workouts -H 'content-type: application/json' -d @fixtures/squat-3x10.json
curl -s $API/workouts/<id>/coach      # 202 until the agent finishes, then the plan
aws logs tail /aws/lambda/<CoachFnName> --follow --format short   # one coach_run line per run
```

## Conventions

- `packages/shared` holds the contract. Change a message or payload there first, and the phone, TV and Lambdas all get the new type.
- Never commit secrets, `.env*` (apart from `.env.example`), `cdk-outputs.json`, or keystores. `.gitignore` covers all of them.
- `docs/reference/` holds private planning material. It is gitignored and never published.
