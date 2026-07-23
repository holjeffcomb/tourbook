# Tour Inheritance / Forking (personal variations of a shared tour)

Status: **Exploratory design — not scheduled.** Captured now so upcoming data-model work
(offline writes, membership) doesn't paint us into a corner. No implementation yet.

Related: [`social-model.md`](./social-model.md) (Tour Membership vs Connections vs Visibility),
[`offline-write-support.md`](./offline-write-support.md).

---

## 1. Problem

A person can be a **member** of a shared tour but need a **personal variation** of its itinerary:

> A support-band tech is on "Big Headliner — 2026 EU Tour". They play the same routing, but they
> fly in a day early, skip two of the headliner's promo days, stay at a different hotel on off
> days, and have one extra club show the headliner isn't part of.

They want to:
- stay a **member** of the original tour (shared identity, roster context, crossing-paths, catalog),
- **inherit** the original routing so they don't re-enter 40 dates by hand,
- **diverge**: add their own shows/off days, and adjust or hide specific shared stops,
- **without mutating the original** or anyone else's view of it.

This is a "fork that keeps a live link to its upstream," not a one-time copy.

## 2. Where we are today

- `tours` — one shared row (`created_by`, act, dates, visibility).
- `tour_members(tour_id, user_id, role)` — participation only (see social model; **not** access).
- `shows` — the itinerary. Every stop has a single `tour_id` and is **shared by all members**.
  There is exactly one itinerary per tour and no notion of a per-member stop.

So today "Join" gives you the *same* single itinerary. There's no place to put a personal
deviation, and editing a shared stop edits it for everyone (RLS currently gates writes to the
owner, so members can't even do that).

## 3. Design options

### Option A — Full fork (deep copy)
On "fork", duplicate the `tours` row and all `shows` into a new tour owned by the forker.

- ✅ Simple mental model; total independence; reuses all existing read/write/offline paths.
- ❌ **Breaks the link**: the fork is a new tour, so the user is no longer a member of the
  original — loses shared identity, roster, and unified crossing-paths/catalog grouping.
- ❌ **No inheritance**: later changes to the original (added show, moved date) never propagate.
- ❌ Duplicates catalog rows / muddies "who was on this tour" and act/venue stats.

Rejected as the primary model — it contradicts "still be considered a member of it" and
"inherit from the original."

### Option B — Personal itinerary layer over a shared base (recommended)
Keep **one** shared tour. Add a per-member **overlay**: personal stops plus per-stop
adjustments, merged at read time into an "effective itinerary" for that user. Membership,
identity, and upstream link are untouched.

Three kinds of stop from a member's perspective:
1. **Inherited** — shared stops from the base tour (unchanged).
2. **Personal** — stops that belong only to this member on this tour.
3. **Overridden / hidden** — a shared stop this member changed for themselves, or removed
   from their own view (never from the base).

- ✅ Preserves membership + shared identity + live inheritance from the base.
- ✅ Divergence is additive and private by default (fits the logbook-first / visibility model).
- ✅ Personal stops are ordinary stops → they reuse the offline write pattern, stats, map, and
   crossing-paths logic with little new surface.
- ❌ Read path becomes a **merge** (base ⊕ overlay) instead of a flat select; needs care in RLS,
   crossing-paths, and stats to pick the right layer.

### Option C — Parent/child tours (`parent_tour_id`)
A personal tour row that points at a parent and lazily copies/inherits stops.

- Effectively Option A's structure with a back-pointer for grouping. More rows/joins than B,
  and still tends toward divergence-by-copy unless we also build the merge logic — at which
  point B is the simpler expression of the same idea. Keep as a fallback if per-member overlays
  prove too complex.

## 4. Recommended model (Option B) — sketch only

> Data model is illustrative; **do not implement from this doc**. Names/columns to be finalized
> when scheduled.

**Base stays as-is.** `shows` rows with `tour_id` and no owner are the **shared base itinerary**
(authored by the tour owner, as today).

**Personal layer**, two possibilities to weigh at design time:

- **(B1) Single table, nullable owner.** Add `shows.member_user_id uuid null`.
  - `null` → shared base stop (current behavior).
  - non-null → a **personal** stop belonging to that member on `tour_id`.
  - Plus a small `tour_stop_overrides(base_show_id, member_user_id, hidden bool, patch…)` for
    "hide/modify a shared stop for just me."
  - ✅ Minimal new tables; personal stops flow through existing `shows` code.
  - ❌ Every `shows` query must now filter by layer; risk of leaking one member's personal stops
    into the shared view if a filter is missed. RLS must be airtight.

- **(B2) Separate tables.** `personal_stops(...)` + `personal_stop_overrides(...)` keyed by
  `(tour_id, member_user_id)`, base `shows` untouched.
  - ✅ Clean separation; base read path unchanged; impossible to accidentally leak personal rows
    via a base query.
  - ❌ Duplicated stop columns + a read path that unions two shapes.

Leaning **B2** for safety (no accidental leakage of personal itinerary — aligns with the
"membership ≠ access" privacy stance), accepting a bit more schema.

**Effective itinerary (per viewer):**
```
effective(tour, viewer) =
    base_stops(tour)
      minus base stops hidden by viewer's overrides
      with viewer's per-stop patches applied
    union viewer's personal_stops(tour)
    ordered by date
```
For the tour **owner** viewing their own tour, effective == base (no overlay). For a member,
it's base ⊕ their overlay. No member ever sees another member's overlay.

## 5. Cross-cutting impact

- **Visibility / RLS.** Personal stops & overrides are the member's **own** data →
  Private-by-default, readable only by them (and their Connections per the visibility model),
  never by other tour members just because they share the tour. Base stops keep the existing
  `can_view_tour` policy. This is the social model's "membership is not access" applied to
  itineraries.
- **Crossing paths.** Should run on each user's **effective** itinerary (a personal extra show is
  a real place they were). The `crossed_paths` RPC would union personal stops into each side's
  stop set. Still Connections-only; overlays never leak.
- **Stats / catalog.** Personal shows/venues count toward *that* user's stats and act/venue
  history. Base membership still groups everyone under the shared tour for discovery.
- **Offline.** Personal stops are just stops → same client-UUID + `upsert` + optimistic pattern.
  No new offline machinery. (Good reason to keep the offline write layer generic now.)
- **UX.** "Join" stays as-is (become a member, see the shared itinerary). A new, explicit
  **"Make a personal copy of a day"** / "Add my own stop" affordance creates overlay rows. Framing:
  *"Your version of this tour"* — you're still on the tour; these tweaks are just yours.
- **Owner edits propagate** to inherited stops automatically (that's the point). A member's
  override on a base stop should record *what* they changed so we can decide, later, whether an
  upstream edit to that same stop re-surfaces ("upstream changed this day you customized").

## 6. Suggested phasing (when scheduled)

1. **Personal stops only** (additive; no overrides). A member can add their own shows/off days to
   a tour they're on; base untouched; effective = base ∪ personal. Covers the most common case
   (support act's extra/own dates) with the least risk.
2. **Hide/skip** base stops per member (`hidden` overrides).
3. **Per-stop patches** (different hotel/venue/time on a shared day).
4. **Upstream-change awareness** (notify/re-surface when a customized base stop changes).

Each phase is independently shippable and backwards-compatible: with an empty overlay, effective
itinerary == today's behavior.

## 7. Open questions (defer)

- B1 vs B2 (nullable-owner column vs separate personal tables) — decide with RLS review.
- Do personal stops appear to Connections viewing your profile, or are they strictly private?
- If a member **leaves** a tour, are their personal stops deleted, or kept as a standalone
  personal log? (Leaning: keep, optionally detachable into their own tour — the one legitimate
  "fork to standalone" path.)
- Interaction with published/public tour pages (§ social model publishing): whose itinerary does
  a published link show — always the base/owner's, presumably.
