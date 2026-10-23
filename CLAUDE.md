# FireFIT — notes for coding agents

Hackathon project (Amazon Build, Ship, Shape · Fire TV track + AWS Builder). **Deadline: Fri Oct 23, 2026, 12:00 PM PT.**
Read `docs/PROGRESS.md` first (status and verification level of each component), then `docs/BLOCKERS.md`.

- Monorepo: pnpm 11 workspace. `pnpm check` = typecheck + lint + tests + web build. `pnpm synth` bundles the Lambdas.
- Contract: `packages/shared/src/index.ts` (Zod schemas + message types). Change it first, then its consumers.
- Phone is authoritative for reps (`apps/web/src/phone/repEngine.ts`, deterministic). TV is authoritative for workout progress.
- Camera video must never reach AWS. Never present the rules fallback (`source: "rules"`) as AI output.
- Fire TV shell: `apps/tv-shell` (AGP 9.4.1, Gradle 9.8.2, JDK 21 at `C:\Program Files\Android\openjdk\jdk-21.0.8`). adb lives at `%LOCALAPPDATA%\Android\Sdk\platform-tools`.
- `docs/reference/` is private planning material (gitignored). The Ship Plan there is the implementation baseline.
- Report verification honestly: Impl / Build / Test / Device / Prod. Log real snags in `docs/friction-log.md` as they happen.
- The owner may be editing in VS Code at the same time: check `git status` before broad changes; never discard their work.
