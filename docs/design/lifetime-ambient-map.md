# Lifetime ambient cinematic map

Status: **Approved — in implementation.**

Decisions (locked):
1. Crossfade = **Option A** (snapshot-overlay dissolve) with **Option B** (opacity dip) as automatic fallback.
2. Transition = **uniform dissolve** on every cluster change (v1).
3. Sheet expanded = **leave ambient running** behind the sheet.
4. Zoom = **slightly different clamped base zoom per cluster**, held fixed during each pan.

Feature #1 of the frontend/UX batch (order: My Tours → touch targets → **this** → venue suggest-edit).

## 1. Goal

Turn the Lifetime map into a calm, self-playing backdrop while the page is idle:

- Detect meaningful geographic **clusters** of visited places.
- Slowly **pan** across one cluster for ~15–20s with **little or no zoom** (Ken Burns drift).
- **Dissolve directly** into the next cluster — **no black, no dark scrim** — using only a
  subtle opacity crossfade so the camera reposition is hidden.
- Sequence clusters **intentionally** (weighted by most-visited / most-recent, in a logical
  geographic progression), not purely at random.
- Keep today's interaction model: ambient while idle; **touch pauses** it so places stay tappable.
- Movement should feel almost unnoticeable — premium, not a screensaver demo.

## 2. Current state (what we're building on)

- `PassportScreen` derives `places: MapPlace[]` and `routes: RouteLine[]` and hands them to
  `LifetimeMapExperience`, which registers a `MapScene` via `useMapScreen`.
- `MapStage` is the single persistent map. Its camera is set imperatively in one effect keyed on
  `frameKey` / `mapReady` / `mapSize` / `bottomInset`, using `computeFraming` + `fitCamera`.
- Today Lifetime uses `focusMode: 'trimmed'` → a static "keep 80% of points" overview. For a
  US+Europe dataset this centers over mid-Atlantic (the thing we're replacing).
- `MapScene` already exposes `focus`, `focusDurationMs`, `focusAnimationMode`.
- `MapPlace` = `{ id, latitude, longitude, weight, tourCount, firstVisit, lastVisit, ... }`.

## 3. The hard problem: crossfade on a single MapView

There is exactly one `MapView`/`Camera`. We cannot render the old camera and the new camera at
the same time, so a true "dissolve between two live maps" isn't directly possible. Two ways to get
a **no-black** dissolve:

**Option A — Snapshot-overlay dissolve (recommended).**
1. Capture the current rendered frame with `@rnmapbox` `MapView.takeSnap()` → image URI.
2. Draw that snapshot as a full-bleed `Animated.Image` **on top of** the map at opacity 1.
3. Instantly reposition the camera underneath (`moveTo`, duration 0) — fully hidden by the frozen
   image, so the "jump" is never seen.
4. Fade the snapshot opacity 1 → 0 over ~900–1200ms. The live new location **dissolves in beneath**
   the old frame. Never goes through black — it's an image-to-live crossfade.
5. Clear the image and begin the slow drift for the new cluster.

**Option B — Container opacity dip (fallback).**
Animate the map container opacity 1 → ~0.85 → 1 while repositioning. Simpler, but dimming reveals
the app background behind the full-bleed map (a flat tint flash), so it isn't a true crossfade and
can read as a slight "blink." Kept as a fallback only if `takeSnap` proves unreliable on a target
device/style.

**Recommendation:** implement Option A; keep Option B behind the same interface as an automatic
fallback if a snapshot fails/returns empty.

> Note: transitions between *geographically adjacent* clusters could instead be a single continuous
> slow pan (no dissolve at all), reserving the dissolve only for big jumps (e.g. cross-ocean). That
> reads even calmer, but adds a second transition mode. **Proposed v1: one uniform dissolve per
> cluster change** for a simpler, predictable model; revisit continuous-pan-for-near-clusters later.

## 4. Architecture — separate the *plan* (pure) from the *player* (imperative)

The clustering/scoring/framing math is pure and testable; only the camera driving + snapshot is
imperative and lives in `MapStage`.

### 4.1 New pure module: `src/features/stats/lifetime/ambientPlan.ts`

```ts
type AmbientFrame = {
  center: Coord;        // cluster anchor (weighted centroid)
  zoom: number;         // calm regional/city zoom, held ~constant during the dwell
  driftTo: Coord;       // pan end-point; zoom stays equal for "little/no zoom"
  dwellMs: number;      // ~15000–20000
};

type AmbientPlan = { frames: AmbientFrame[] };

function planAmbient(places: MapPlace[], opts?: {...}): AmbientPlan | null;
```

Steps inside (all pure, unit-tested):

1. **Cluster** places by proximity — single-linkage union-find using `haversineMiles`, threshold
   ~`CLUSTER_MILES` (start ~180 mi so a metro/region groups together; tunable). Output per cluster:
   member places, weighted centroid, total visits (Σ weight), most-recent `lastVisit`, bbox.
2. **Score** each cluster = blend of normalized **visit weight** and **recency** (from `lastVisit`).
   Small one-off clusters can be dropped or visited less often.
3. **Order** into an itinerary: greedy **nearest-neighbor path** starting at the highest-score
   cluster, so the camera "travels" logically region-to-region (a big jump, e.g. across an ocean,
   naturally lands on a dissolve). Bias frequency/dwell toward higher-score clusters.
4. **Frame** each cluster: center on weighted centroid; derive a zoom from the cluster bbox
   (reuse `fitCamera`-style math), then **clamp to a calm band** (e.g. z ≈ 4.5–8). Compute a small
   `driftTo` offset within the cluster (start slightly off-center, end slightly off the other way)
   at the **same zoom** → the Ken Burns pan. Add mild per-visit jitter so repeats aren't identical.

### 4.2 New generic player: `src/features/maps/useAmbientCamera.ts` (used by `MapStage`)

`useAmbientCamera({ cameraRef, mapViewRef, plan, paused })`:
- Loop over `plan.frames`: **dissolve-in** (snapshot → `moveTo` to `center/zoom` → fade image out)
  → **drift** (`linearTo` from `center` to `driftTo`, zoom fixed, duration `dwellMs`) → advance,
  wrapping to the start.
- Uses timers + the `Camera` ref; **no per-frame JS/worklet** work (one long `linearTo` per dwell,
  one fade per transition), so cost is trivial.
- Honors `paused`: stops scheduling the next step and abandons any in-flight timer.

### 4.3 `MapScene` addition

Add `ambient?: AmbientPlan` to `MapScene`. `LifetimeMapExperience` sets it (memoized) only when
`status === 'ready'`. When `scene.ambient` is present and active, `MapStage`:
- **skips the static `computeFraming` framing effect** (ambient owns the camera after first paint),
- renders the snapshot `Animated.Image` overlay layer,
- runs `useAmbientCamera`.

This keeps `MapStage` generic (it just "plays a plan"); all Lifetime-specific knowledge stays in
the stats layer.

## 5. Interaction / pause model

Ambient runs only when **all** are true: Lifetime scene focused, `status==='ready'`, a plan exists,
no place is selected, and the user isn't interacting.

Pause triggers:
- **Touch:** attach `onTouchStart` to the map container in `MapStage` → set `interacting=true`,
  restart a ~4–5s idle timer on every touch/`onCameraChanged`. Resume when the timer elapses.
- **Place selected:** while `selectedPlaceId` is set (detail card open), ambient is paused so the
  pin stays put and tappable. Resume on close.
- (Sheet expanded is fine to leave running — it's a background — but we can also pause at the top
  snap since the map is mostly covered. **Proposed: leave running**, revisit if it feels busy.)

On resume, ambient dissolves from the user's *current* view into the next planned cluster (no
snap-back), so manual exploration blends smoothly into the loop.

Distinguishing user vs programmatic camera moves is unreliable via `onCameraChanged` alone, so we
key pause off **touch**, not camera deltas — robust and simple.

## 6. Performance

- Snapshot every ~15–20s is negligible; drift is a single native `linearTo`, not JS-animated.
- No new subscriptions per frame; the plan is recomputed only when `places`/year change (memoized).
- Reanimated already present for the fade; the snapshot image is one `Animated.Image`.

## 7. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| `takeSnap()` latency/empty on some styles/platforms | Await the URI before `moveTo`; if it fails, fall back to Option B (opacity dip) for that transition. |
| Ambient fighting the existing `frameKey` framing effect | Gate: when `scene.ambient` active, skip the static framing effect entirely. |
| Camera drift interrupted by style reload (Dusk/Night/Earth) | `MapStage` already restores `lastCameraRef` after style reload; ambient re-arms on next tick. |
| Motion feels too strong | All magnitudes (drift distance, zoom band, dwellMs, fade ms) are constants in `ambientPlan.ts`/player — tune in one place. |
| Battery/warmth from continuous animation | Long `linearTo` + sparse snapshots are cheap; pause when app backgrounded (screen not focused → scene released). |

## 8. Files

**New**
- `src/features/stats/lifetime/ambientPlan.ts` — clustering + scoring + itinerary + frames (pure).
- `src/features/stats/lifetime/ambientPlan.test.ts` — unit tests.
- `src/features/maps/useAmbientCamera.ts` — the imperative player (dissolve + drift loop).

**Changed**
- `src/features/maps/mapScene.tsx` — add `ambient?: AmbientPlan` to `MapScene`.
- `src/features/maps/MapStage.tsx` — snapshot overlay `Animated.Image`, `onTouchStart` pause,
  run `useAmbientCamera`, skip static framing when ambient active, expose `MapView` ref for snaps.
- `src/features/stats/lifetime/LifetimeMapExperience.tsx` — build & pass `scene.ambient` when ready;
  pause coordination for selected place.
- (maybe) `src/features/maps/mapCamera.ts` — small shared helper for cluster bbox → clamped zoom.

## 9. Phased checklist

- [ ] **P1 — Plan (pure).** `ambientPlan.ts`: clustering (union-find + haversine), scoring,
      nearest-neighbor itinerary, per-cluster frame + drift + jitter. Unit tests for clustering
      boundaries, ordering bias, and frame/zoom clamping. *No UI yet.*
- [ ] **P2 — Player.** `useAmbientCamera.ts` with the snapshot-dissolve + `linearTo` drift loop and
      `paused` handling. `MapScene.ambient` field. Wire into `MapStage` (skip static framing when
      active). Snapshot fallback (Option B).
- [ ] **P3 — Interaction.** `onTouchStart` pause + idle-resume timer; pause on selected place;
      resume-from-current-view dissolve.
- [ ] **P4 — Tuning pass.** Dial in `CLUSTER_MILES`, zoom band, drift distance, `dwellMs`, fade
      duration on a real device; confirm "almost unnoticeable / no black" feel.
- [ ] **P5 — Edge cases.** 1 place / 1 cluster (gentle in-place drift, no dissolves); year-filter
      replan; empty/loading no-op.

## 10. Open questions for sign-off

1. **Crossfade mechanism:** approve **Option A (snapshot dissolve)** as primary with Option B as
   automatic fallback?
2. **Transition model:** uniform dissolve per cluster change (v1) vs. continuous-pan-for-near +
   dissolve-for-far (later)?
3. **Sheet-expanded:** leave ambient running behind the sheet, or pause at the top snap?
4. **Zoom variety:** OK that different clusters use slightly different (clamped) base zooms for
   gentle variety, while zoom stays fixed *during* each pan?
