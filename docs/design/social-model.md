# Design Proposal: Tourbook Social Model — Connections, Visibility, Publishing

**Status:** Product/UX model **finalized** (design-level); implementation pending.
Revisit only if a major architectural issue is discovered.
**Phase:** 4 (Future Planning)
**Author:** Architecture review follow-up
**Single source of truth:** this document. It **supersedes and folds in** the earlier
Follow-vs-Friend proposal (see Appendix A).

**The four concepts (canonical definitions):**
- **Tour Membership** — "We participated in the same tour/project." (context, not trust)
- **Connections** — "We have a mutual relationship and have chosen to share."
- **Visibility** — "Who can see this person's tour data inside Tourbook."
- **Publishing** — "What content the user intentionally shares externally."

---

## 0. Framing

Tourbook is a **professional touring logbook first**. Social exists to support (a)
trusted industry relationships and (b) optional public storytelling — never an
audience/engagement graph.

The model rests on **four distinct concepts**. Keeping them independent is the whole
design — three are sharing axes; the fourth (Tour Membership) is a professional-context
primitive that is deliberately **not** a permission or trust mechanism.

1. **Tour Membership** — *"We participated in the same tour/project."* Attachment to a
   shared tour (`tour_members`). A **shared professional context, not a trust
   relationship**; by itself it grants **no** access to anyone's personal data (§1.5).
2. **Connections** — *"We have a mutual relationship and have chosen to share."*
   Mutual, consent-based; the trust boundary.
3. **Visibility** — *"Who can see this person's tour data inside Tourbook."* Per-tour
   access control over the **personal** layer (Private / Connections).
4. **Publishing** — *"What content the user intentionally shares externally."* Opt-in
   public artifacts (links, recaps, share images), viewable without an account.

Core principle: **Tour membership = shared professional context, not a trust
relationship.** It never, on its own, reveals a person's personal itinerary, notes,
stats, or history, and it is never a permission mechanism for crossing paths.

**Three decisions frame everything below:**
- **No follower/following graph** (evaluated and rejected — Appendix A). No follower
  counts, one-way subscriptions, or popularity metrics.
- **Visibility = Private / Connections; "public" happens only through Publishing**
  (Option B, §2). There is no ambient "any Tourbook user can browse my history" state.
- **Membership ≠ Connection ≠ Visibility** (§1.5). Being on the same tour never, by
  itself, reveals a person's personal itinerary, notes, stats, or history.

> **Grounding fact from the code:** every Postgres RLS policy is `to authenticated`,
> so today's `public` visibility means "any *signed-in* user can view," and it powers
> the shared catalog (act/venue pages, join-not-duplicate). "Anyone with a link, no
> account" is a *different* capability that isn't built yet. Untangling these is the
> point of §2.

---

## 1. Connections Model

### 1.1 Rename "Friends" → "Connections"
**Yes (UX only).** "Connections" reads professional and matches the product. Keep the
internal table name `friendships` to avoid a churny migration — this is a label/copy
change, not a schema change.

Vocabulary: **Connect · Request sent · Respond · Connected · Remove connection · Block**.

### 1.2 What a connection ALLOWS
- See each other's **Connections**-visibility tours (route, stops, stats).
- **Crossing paths** detection between the two people.
- **Compare histories** (mutual stats, shared tours, mutual venues/cities).
- "Most toured with" / co-touring signals.
- Appear in each other's Connections list and (future) connection-scoped notifications.

### 1.3 What a connection does NOT allow
- Seeing `private` tours or **private personal notes** (never shared, any state).
- Editing each other's tours/shows (creator-only, unchanged).
- Any implicit resharing of the other person's data to third parties.
- A feed of "everything my connections do" (a future, opt-in surface — not a right
  granted by connecting).

### 1.4 Request / accept / remove / block
- **Request → Accept/Decline** (exists): `friendships.status ∈ {pending, accepted,
  declined}`, one row per unordered pair; re-request resets a declined row.
- **Remove**: either party deletes the row (exists as "unfriend").
- **Block (new, later):** a `blocks` table that forces `is_friends` → false, hides both
  users from each other in search/crossings/compare, is one-directional to create, and
  silent to the blocked user. Design now, enforce when abuse becomes real.

### 1.5 Tour membership ≠ Connection ≠ Visibility (professional context is not trust)

Being on the same tour is a **working relationship, not a trust relationship**. Keep the
four concepts strictly independent:

| Concept | What it is | What it grants |
|---|---|---|
| **Tour membership** (`tour_members`) | You're attached to a shared tour/project | The **shared tour skeleton** only (below). *Not* trust; *not* access to any member's personal layer. |
| **Connection** (`friendships`) | Mutual, consented relationship | The trust boundary — the in-app path to another person's personal tour data (subject to that tour's visibility). |
| **Visibility** (per tour) | Private / Connections | Who can see a tour's **personal** data. |
| **Publishing** | Opt-in public artifact | Open-web sharing via link. |

**Principle:** a co-member who is **not** a Connection is treated exactly like any other
non-connected user for personal data. Membership never *implies* a Connection and never
*substitutes* for one in crossings, Compare, or visibility. Neither direction is
auto-created (being added to a tour does not request/accept a connection).

**Shared tour skeleton — visible to tour members (the collective project record):**
- Tour **identity** (act, title) and **date range**
- The tour's **venue / city schedule** (the collective route of the project)

**Roster is NOT part of the member-visible skeleton (decided, most privacy-preserving).**
Tour membership is professional context, not a permission grant, so we do **not** let
members enumerate the roster:
- The **owner** (tour creator) can see the **full roster**.
- Everyone else sees only **their own membership** plus **members who are their
  Connections** ("which of my connections are on this tour"). A non-connected co-member
  cannot enumerate who else is on the tour.
- We deliberately **avoid a public/crew directory.** If broader roster visibility is
  wanted later, it becomes an **intentional feature with its own visibility rules**.

**Personal layer — private unless explicitly shared (Connection + Connections
visibility) or Published:**
- Personal **notes** and annotations
- Personal **stats / analytics** and career **history** (your *other* tours)
- Personal **itinerary details / logistics** layered on top of the shared schedule

So a bandmate on Tour A sees Tour A's schedule, but **cannot** enumerate the roster,
and **cannot** see your notes, your stats, or Tour B — unless you're Connected and
Tour B is shared with Connections (or Published).

**Notes / annotations — audit result (decided).** There is no dedicated personal-notes
field today; the only free-text annotation is `shows.label` (off-day note, e.g. "Travel
day"), which is part of the **shared schedule** and is governed by the `shows` SELECT
policy (owner / creator's Connections / members). It is never world-readable and never
exposed by catalog linkage, so the current model already satisfies the Stage 1 privacy
guarantee — **no new notes column is added.** A note that must stay private *even from
co-members and connections* would require a new owner-only column; that is deferred until
such a feature is actually needed (we don't add unused schema now).

---

## 2. Visibility & Publishing — the core decision

### 2.1 The two concepts, made explicit
- **Public *inside* Tourbook** — any authenticated user can discover/view the content.
- **Published *externally*** — an intentional public artifact shareable by link and
  viewable without an account.

Conflating them (as the enum does today) creates the confusion you flagged: a
portfolio recap you want on Instagram is a very different intent from "let every
Tourbook user browse my entire history."

Note the scope of this axis: **Visibility governs the *personal* layer** (itinerary
detail, notes, stats, history). It is **not** how co-members see the shared tour
skeleton — that comes from **membership** (§1.5), which is a separate, non-trust
primitive.

### 2.2 Option A vs Option B

| | **Option A** — Private / Connections / Public + Publishing on top | **Option B** — Private / Connections; Publishing is the *only* public path |
|---|---|---|
| "Public" meaning | Two meanings (in-app browsable **and** possibly published) | One meaning: *"I published this."* |
| Strangers can browse your history in-app | Yes (ambient) | **No** — only what you explicitly publish leaves your trust circle |
| Selective portfolio publishing | Possible but muddled by the ambient Public state | **Native** — publish specific tours/recaps, nothing else |
| Social-network drift | Higher — in-app browsing invites feeds/discovery-of-people | Lower — no ambient audience surface |
| Mental model | 3 visibility states **+** publishing (4 concepts) | 2 visibility states **+** publishing (3 concepts) |
| Risk to logbook-first feel | Medium | Low |

### 2.3 Recommendation: **Option B**

Visibility is **Private / Connections**. Content becomes public **only** by
**Publishing** an explicit artifact (§3). Reasons this fits Tourbook's long-term goals:

- **One unambiguous meaning of "public."** Public = "I chose to publish this," with a
  link and a revoke switch. No dual meaning to explain.
- **Logbook-first by construction.** Nothing about you is ambiently browsable by
  strangers; every time data leaves your trust circle it's a deliberate act
  (share with Connections, or Publish to the web).
- **Selective, portfolio-style sharing is the default shape**, exactly your example:
  publish a curated recap or a standout tour without exposing the rest.
- **Removes the accidental social surface** (browsing strangers' histories) that
  would otherwise pull toward feeds and people-discovery.

Option A's only real advantage is frictionless in-app discovery of strangers'
tours — which is precisely the social-network behavior we're trying to avoid.

### 2.4 The one thing Option B must preserve: the shared catalog
Today `public` also powers Tourbook's **shared, de-duplicated catalog**:
act pages, venue pages, and "join this existing tour instead of creating a duplicate."
That value must survive — but it does **not** require exposing tour *contents*. Split
the concern:

- **Catalog linkage (non-sensitive):** a tour's *existence* and its association with a
  shared **act** and **venues**, plus coarse metadata (title, date range, member count,
  creator name). This is what de-dup/join and act/venue pages actually need. It is
  **not** a visibility state on the itinerary; expose it through a narrow, purpose-built
  read (view/RPC) rather than blanket-publishing the route, stops, notes, or stats.
- **Contents (sensitive):** the itinerary, route, notes, and stats follow **Private /
  Connections / Published**.

So: acts and venues stay world-shared catalogs (as they already are); a tour
contributes minimal linkage facts to that catalog, while its *contents* stay private
until shared with Connections or Published. No ambient "browse a stranger's full tour"
exists.

### 2.5 Default visibility
Flip the default to **Private** (logbook-first). Users opt *up* to Connections or
Publish deliberately. (Today the default is `public`, a legacy of the shared-tours
migration — see §5.3.)

### 2.6 Worked example
> *"Keep my notes private, share the route with my touring friends, and publish a
> yearly recap on Instagram."*

- **Notes** → private automatically (owner-only; never in any shared/published view).
- **Route/itinerary** → tour visibility = **Connections**. Connections see the map +
  stops; nobody else; nothing on the open web.
- **Yearly recap** → **Publish** a recap artifact → public page + share-card image for
  Instagram. Draws only from what the user includes; private notes never pulled in;
  revocable.

Three axes, three independent choices.

---

## 3. Publishing (the sole public path)

Publishing = intentionally creating a **read-only, revocable public artifact**. It
never creates a relationship or a count.

### 3.1 What can be published
- **Public tour page** — route map, stops, dates, act/role; no private notes.
- **Yearly touring recap** — miles, shows, countries, cities, longest run, map
  (your `computePassportStats` already produces these).
- **Career/passport stats** — lifetime totals + stylized map.
- **Map visualizations** — tour route or lifetime heatmap as an image.
- **Share cards / images** — Instagram-ready 1:1 and 9:16 images.

### 3.2 Mechanics (high level)
- An explicit **Publish** action marks a specific artifact public and mints an
  **unguessable share token/slug**; **Unpublish** revokes it.
- Public consumption goes through a **narrow anon-safe read path** — preferably an
  **edge-rendered public page** (Supabase Edge Function or small web renderer) that
  reads only *published* artifacts via a service role and returns HTML + Open-Graph
  tags for rich link unfurls; the main app tables keep their `to authenticated`
  policies untouched. (Alternative: a tightly scoped `to anon` SELECT limited to
  published rows.)
- **Share-card images** can be **client-side first** (render → capture → OS share
  sheet), no backend; server-rendered OG images later.

All open-web exposure sits behind this one opt-in, auditable surface.

### 3.3 Discovery without follows *and* without public browsing
Discovery is intentional and catalog/link based — never a people feed:
- **Connections** — your connections' shared tours (already built).
- **Shared catalog** — act pages and venue pages built from **catalog linkage**
  (§2.4) plus any **published** tours; converge users onto canonical acts/venues and
  power join-not-duplicate.
- **Search** — profiles, acts, venues.
- **External links** — a published recap/tour link shared anywhere (the Instagram
  share card links back to its public page).
- **Optional, non-vanity** — "Crew you may know" from **co-membership** (same tour) —
  a connection prompt, not a follow.

---

## 4. Crossing Paths Under This Model

- **Mutual connections only** — already implemented in the `crossed_paths` server RPC
  (visibility-checked, friends-only). No change.
- **Membership never produces a crossing by itself.** A crossing requires the other
  person to be an accepted **Connection**; co-membership alone (a non-connected
  bandmate/crew) yields nothing. Membership only affects *which of a Connection's tours*
  are in scope (the shared-skeleton schedule), never whether a stranger appears.
- **Detection** keys off `is_friends` + tour visibility; **notifications** are
  connection-scoped (requests, accepted, and optional "near a connection on <date>").
- **Privacy:** crossings require mutual consent, so "who's near me" can never leak to
  strangers or the open web. **Published artifacts do not feed crossings.** Blocking
  removes a pair from crossings.

Rejected: follower-, public-, or membership-based crossings.

---

## 5. Database Impact

### 5.1 Can remain as-is
- `profiles`, `friendships`, `is_friends`, `tour_members`, `tours`, `shows`, `acts`,
  `venues`, and the `crossed_paths` RPC.
- Acts and venues are already world-shared catalog tables — the linkage substrate
  §2.4 needs.

**`tour_members` is participation/context only — never an access-control mechanism.**
It records *"who is on this tour"* (and role). It must not be read as a grant to any
member's personal data:
- **Trust** comes from `friendships` / `is_friends` (Connections).
- **Access** to personal tour data comes from **Visibility** (Private / Connections),
  or **Publishing**.
- Any place that currently treats `is a member` as a permission must be re-scoped so
  membership only unlocks the **shared tour skeleton** (identity, dates, venue/city
  schedule, roster), not the personal layer — see §5.2 and §1.5.

### 5.2 Changes required
- **Connections rename:** UX/copy only. No migration (keep `friendships`).
- **Private notes:** if a general per-tour notes field doesn't exist, add an
  owner-only one, never selected by shared/published reads. Small, additive.
- **Visibility → Private/Connections (Option B):**
  - Retire **Public** as a *user-facing* content-visibility choice.
  - **Catalog linkage** read path (view/RPC) exposing only non-sensitive tour
    metadata for act/venue pages + join-not-duplicate, decoupled from visibility.
- **Membership ≠ personal-data access (§1.5):** the current tour/show SELECT policies
  grant access when the viewer `is a member`. That grant must be **scoped to the shared
  tour skeleton** (identity, date range, venue/city schedule, roster) — it must *not*
  become a backdoor to a co-member's personal layer. Concretely:
  - Personal **notes**: `shows.label` is schedule-scoped (see §1.5 audit); no owner-only
    notes column is added in Stage 1.
  - Membership must **not** expose a co-member's *other* tours, stats, or history —
    those follow Connection + visibility. (Under Option B this already holds once
    `public` is retired, since a non-connected member can't see your other Private/
    Connections tours; this line makes the intent explicit and testable.)
  - **Roster visibility (DECIDED — most privacy-preserving):** `tour_members` SELECT is
    changed from `using (true)` (world-readable) to: **own membership OR the member is my
    Connection OR I own the tour** (owner sees the full roster). No co-member enumeration,
    no public crew directory. Implemented in
    `20260722000100_membership_not_access.sql`.
- **Publishing (deferred, additive):** publish marker + share token (e.g.
  `tours.published_slug` / a `published_artifacts` table) and the anon-safe read path.
- **Blocking (deferred):** `blocks` table + policy hooks.

### 5.3 Migration note (Option B is *not* free)
Today `visibility` defaults to `public` and existing tours were bulk-set to `public`
by the shared-tours migration. Moving to Option B means:
- **Default → `private`.**
- **Reclassify legacy `public` tours → `private` via a silent migration.**
  **Decision (pre-launch):** because there are no real external users yet, existing
  `public` tours are migrated straight to **Private**, with no user-facing prompt. A
  user-facing migration prompt can be revisited later if it's ever needed.
- **Enum handling:** dropping an enum value in Postgres is painful; simplest is to
  **stop surfacing `public` in the UI** and treat any remaining `public` rows as
  "catalog-listed, contents Private/Connections" pending reclassification — rather than
  a hard enum change.

### 5.4 Is this mostly product/UX or schema?
- **Connections + the visibility *model*:** mostly **UX/product**, but Option B adds a
  **small, real** piece — the catalog-linkage read path — plus a **data migration**
  for the default/legacy `public` tours. Not major, but not zero.
- **Membership/visibility separation (§1.5):** mostly an **RLS-policy tightening**
  (scope the member grant to the shared skeleton, owner-only notes, decide roster
  scope). Small and testable; no new relationship tables.
- **Public publishing:** the one genuinely new capability; contained and deferrable
  (client share cards first, public pages next).

---

## 6. User Flows

### 6.1 Crew member connects with another crew member
1. A finds B (search, or via a shared tour's members) → **Connect** (`pending` A→B).
2. B **Responds → Accept**.
3. Connected: each sees the other's **Connections** tours, can **Compare**, and sees
   **Crossing paths**. Either can **Remove** later.

### 6.2 Artist shares a public tour history (Option B)
1. Artist keeps working tours **Private/Connections**.
2. To go public, artist **Publishes** selected tours (or a career page) → public
   link(s). There is no "make my whole profile browsable" toggle; publishing is
   per-artifact and curated.
3. The published pages are viewable by anyone with the link; act/venue pages may list
   published tours.

### 6.3 User shares a yearly recap to Instagram
1. Open **2026 Recap** (from passport stats) → **Publish & Share**.
2. App generates a **share-card image** (and later a public recap page + link).
3. OS share sheet → Instagram. Card links back to the public recap; private notes
   excluded; **Unpublish** anytime.

### 6.4 Someone views a public Tourbook link without an account
1. Tap a shared recap/tour link.
2. **Edge-rendered public page** returns the read-only artifact with Open-Graph
   preview — no login/app install.
3. CTA: "Made with Tourbook." No follower prompt.

---

## 7. Recommended Phase 4 Direction (simplest, keeps flexibility)

**Stage 1 — Product/UX + a small migration (do first)**
1. Rename **Friends → Connections** (keep `friendships`).
2. Adopt **Option B**: visibility = **Private / Connections**; default **Private**;
   remove **Public** from the visibility picker.
3. **Silently migrate** default + legacy `public` tours → **Private** (pre-launch
   decision, no user prompt — see §5.3).
4. Add the **catalog-linkage** read path so act/venue pages + join-not-duplicate keep
   working without exposing itineraries.
5. Guarantee **private notes** are never shared; confirm crossings/notifications are
   connection-scoped (already true).

**Stage 2 — Small additive (next)**
6. Connection request/accepted **notifications**.
7. **Client-side share cards** for tour/recap (no backend; OS share sheet).

**Stage 3 — Separate, contained proposals (later)**
8. **Public publishing:** share tokens + edge-rendered public pages + OG images.
9. **Blocking** enforcement.
10. **Crew-you-may-know** from co-membership.

**Explicitly out of scope (any stage):** follows/followers, follower counts, one-way
subscriptions, algorithmic feeds, follower- or public-based crossing paths, and
ambient in-app browsing of strangers' histories.

### Why this is the right minimum
- Option B gives **one clear meaning for "public"** and keeps the app logbook-first by
  construction, at the cost of a **small, well-scoped** catalog-linkage read path and a
  one-time visibility migration.
- Publishing — the only new system — stays isolated behind an opt-in surface, so the
  private/authenticated core stays simple and auditable.
- Nothing forecloses future growth (feeds, private watchlists, richer publishing) on
  top of the three-axis foundation.

---

## 8. UX Language & Terminology

The words are load-bearing: they should make the four concepts (membership,
connections, visibility, publishing) obvious without a tutorial. Principles: plain
verbs, no jargon, no social-network vocabulary (no "followers," "feed," "public
profile"), always make the *audience* explicit, and never let membership and connection
language blur (§8.6).

### 8.1 Connections
- **Noun:** "Connections" (a person is "a connection"). Avoid "friends," "network,"
  "contacts."
- **Actions & states:** **Connect** → **Request sent** (pending, outgoing) /
  **Respond** (pending, incoming) → **Connected**; **Remove connection**; **Block**.
- **One-liner (empty state):** *"Connections are trusted people you choose to share
  with. Connect to share tours privately and see when your paths cross."* (Deliberately
  **not** "people you tour with" — that's tour membership, §8.6.)
- **Microcopy:** button **Connect**; after sending, **Request sent** (disabled) with a
  **Cancel request** affordance; incoming shows **Respond** → **Accept** / **Decline**.
- **Avoid:** "Add friend," "Follow," follower/following counts anywhere.

### 8.2 Sharing with Connections (visibility)
- **Concept name:** a tour's **Visibility**, with two values: **Private** and
  **Connections**.
- **Labels & help text:**
  - **Private** — *"Only you (and people on this tour)."*
  - **Connections** — *"Everyone you're connected with can view this tour."*
- **In context:** the picker reads **"Who can see this tour?"** with the two options
  above. Default is **Private**.
- **Verb for the action:** "**Share with Connections**" (i.e., set visibility to
  Connections). Reversible by switching back to Private — call that "**Make private**,"
  not "unshare."
- **Notes carve-out (always visible reassurance):** *"Your notes stay private."*
- **Avoid:** "Public," "publish," or "anyone" in this control — those belong to §8.3.

### 8.3 Publishing a tour / recap
- **Concept name:** **Publish** (the artifact is a **published page** / **public
  link**). This is the *only* place the words "public" / "anyone" appear.
- **Actions & states:** **Publish** → **Published** (has a **public link**); **Copy
  link**; **Share** (OS share sheet / share card).
- **Labels & help text:**
  - Button **Publish** → confirm sheet: *"Publish creates a public link anyone can
    open — no account needed. Your private notes are never included."*
  - After publishing: **Published · [Copy link] [Share]**.
- **Distinct from visibility:** publishing does **not** change who can see the tour
  *inside* Tourbook; it creates a separate read-only public artifact. Copy that makes
  this clear: *"Publishing is separate from sharing with Connections."*
- **Avoid:** implying publishing "makes the tour public" in the visibility sense, or
  that it notifies anyone.

### 8.4 Revoking a published item
- **Verb:** **Unpublish** (primary). The link then stops working.
- **Labels & help text:**
  - Button **Unpublish** → confirm: *"Unpublish disables the public link. Anyone with
    the old link will no longer be able to open it."*
  - After unpublishing: state returns to **Not published** with a **Publish** button.
- **Honesty about caches:** for shared images already downloaded/posted elsewhere, add
  *"Images you've already shared may still exist where you posted them."* (The link and
  page stop working; a screenshot someone saved cannot be recalled.)
- **Avoid:** "Delete" (it doesn't delete the tour), "Make private" (that's the
  visibility verb in §8.2 — keep the two vocabularies separate).

### 8.5 Quick reference

| Concept | Noun | Primary verb(s) | Reverse | Audience wording |
|---|---|---|---|---|
| Membership | Tour member / crew / roster | Add to tour / Join | Leave / Remove from tour | "people on this tour" |
| Relationship | Connection | Connect / Accept | Remove connection · Block | "trusted people you share with" |
| Visibility | Private / Connections | Share with Connections | Make private | "only you" / "your connections" |
| Publishing | Published page / public link | Publish | Unpublish | "anyone with the link, no account" |

**Golden rule for copy:** *Visibility answers "who in Tourbook can see this?";
Publishing answers "what did I put on the open web?" Never let one control's words
leak into the other.*

### 8.6 Tour members vs Connections (don't conflate)
- Tour members are **"crew," "the roster," "people on this tour"** — never called
  "connections." Adding/removing someone from a tour uses **Add to tour / Remove from
  tour**, not connect/disconnect language.
- A member row on a tour must never render as a connection or imply shared personal
  data. Where useful, a co-member's row may offer a **Connect** action (to *become*
  connections) — but that's an explicit, separate step, clearly labeled.
- **Avoid:** "your tourmates are your connections," auto-connect on join, or showing a
  co-member's stats/history from the roster.

---

## Appendix A — Superseded: Follow vs Friend (decision record)

The earlier `follow-vs-friend.md` proposal evaluated adding a one-way
follower/following graph alongside mutual friendship. **Decision: rejected.**

- **Why rejected:** follower counts and one-way subscriptions create audience/
  popularity incentives and a social-network feel that conflict with a professional
  logbook. Friend-vs-Follow is a permanent UX-explanation tax, and follows don't help
  the core value (crew trust, crossing paths, connection-scoped sharing).
- **What replaced it:** the three-axis model here — mutual **Connections** for trust,
  **Visibility** (Private/Connections) for in-app access, and **Publishing** for
  intentional open-web sharing. No follow graph, now or planned.
- **If a "keep up with someone" need ever appears:** prefer a **private watchlist**
  (no public counts, not shown on anyone's profile) over a social follow graph, and
  only once a real feed exists. Deferred indefinitely.

This appendix is the durable record; the standalone follow-vs-friend document is a
pointer to here.
