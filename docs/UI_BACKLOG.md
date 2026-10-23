# TV UI backlog: match the reference design

Owner feedback after Gate 3 (Oct 22, 23:27 PT): the flow works; the look must move as close as possible to the reference mockups during the polish phase. References are the three images in `docs/reference/` (private, gitignored): the library screen and the workout HUD (two near-identical variants).

## Hard requirements

- **Full-screen landscape** at 1920×1080 design size (the shell already scales it to the 4K output).
- **Dark, glassy, Apple-like theme:** translucent frosted panels (rgba backgrounds, a subtle 1 px light border, soft shadows, large radii), with blurred room/video showing through. `backdrop-filter` needs checking on Amazon WebView 118 at acceptable cost on the 1.3 GB stick; fall back to flat translucent panels if it drops frames.
- Remove the **Up / Down** stage label. **Done**: only "Step into frame" shows, when tracking is lost.

## Workout HUD (reference: workout screen)

| Reference element | Plan for FireFIT | Data source |
| --- | --- | --- |
| Top nav (Workout · History · Programs · Challenges · Settings), user, clock | Slim top bar: logo, current screen title, clock. Nav tabs only if they lead somewhere real (History could reuse recent sessions) | — |
| Left glass card: exercise icon + name, "Set 2 of 4", big gradient rep ring "7 / 10 reps" | Restyle the current ring as a gradient arc (blue→orange) inside a glass card with exercise name + icon and set label | `w.setReps`, `plan` |
| "0:18 Time Remaining" | Workout clock (no time cap exists, so show elapsed or the rest countdown, honestly labeled) | `elapsedSec` |
| Depth 92° ✓ · Tempo 2.6 s | Last-rep depth with a check when ≤ target depth; tempo | `rep` messages |
| Form callout bubble anchored to the knee ("Watch left knee") | Cue callout card next to the video; joint highlight already drawn red on the phone | `rep.cue`, `flagged` |
| Form Score 87/100 ring + checklist (Depth, Back, Knee, Balance, Tempo) | Checklist only for what we measure (Depth, Knee alignment, Tempo consistency). A score only as a **labeled heuristic** (Ship Plan rule) | per-rep log |
| Depth progress bar under the video + "Good depth!" | Live depth meter from the streamed knee angle (state messages at 10 Hz): fill as the angle goes from 160° to 95° | `state.angle` |
| Up Next / Then cards with exercise photos | Up Next: next set or rest. No stock photos (rights); use icons/illustrations we make | `plan` |
| Rest After Set ring 0:45 | Rest ring card (already a countdown; restyle) | `restEndsAt` |
| Bottom bar: Calories, Heart rate, Workout time, Sets complete, **End Set** button | **Keep:** workout time, sets complete, End Set (Select). **Drop:** calories and heart rate (the camera can't measure them; Ship Plan rule) | — |
| Logo with the orange curved arrow | Keep the wordmark; **no smile-style arrow** (third-party trademark risk in the video) | — |

### Rep-counter HUD: more activity (owner request)

- Pulse/scale animation and ring fill sweep on each counted rep; brief green flash for good depth, amber for a rep with a cue.
- Live "descent" feedback during the rep: the ring or depth meter tracks the knee angle in real time, so the user sees the counter respond before the rep completes.
- Rep tick marks around the ring (one per target rep) that fill in order.
- Set-complete celebration (short animation + chime) before rest.
- Keep animations CSS-transform/opacity only (cheap on the stick); verify frame rate on the device.

## Library (reference: library screen)

- Left glass profile card: avatar, name, goal, fitness level, camera setup status, readiness checks (full body visible, lighting, phone connected).
- Program cards with icon badge and imagery (our own illustrations); focused card with an orange glow.
- Selected-program panel: description, plan list (exercise rows with sets × reps), last-session score, best, workouts this week.
- Bottom action row: Preview · Switch profile · Camera test · **Start Workout** (primary, orange).
- The "Recommended next · by your AI coach" card stays first (AWS Builder story).

## Order of work in the polish phase

1. Theme tokens + glass panel component; apply to library, pair and summary (cheap, high visual impact).
2. Workout HUD layout per the table above (left card, right cards, bottom bar).
3. Rep-counter activity animations.
4. Device check on the Fire TV: frame rate with video playing, legibility from 3 m.
