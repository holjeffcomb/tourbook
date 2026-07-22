-- Retire 'public' tour visibility (Stage 1 of the approved social model —
-- docs/design/social-model.md, docs/design/stage1-implementation-checklist.md §1).
--
-- The model makes content visibility Private / Connections only. Broad public reach is
-- a later, explicit *Publishing* action, never a visibility state. Pre-launch there are
-- no real external users, so legacy 'public' tours are silently reclassified to Private.
--
-- Backwards-compatible / fail-closed: we do NOT drop the 'public' enum value (removing an
-- enum value in Postgres is disruptive and irreversible). It is simply no longer produced
-- by the app (visibility picker drops it) and no longer honored by any RLS policy (the
-- membership-not-access migration removes every `visibility = 'public'` branch). Any stray
-- 'public' row that appears before the client ships is therefore treated as Private
-- (owner/members only) — strictly safe.

-- Silently reclassify legacy public tours to Private (pre-launch decision).
update tours set visibility = 'private' where visibility = 'public';

-- New tours default to Private.
alter table tours alter column visibility set default 'private';

comment on column tours.visibility is
  'private | friends (=Connections, UX label). ''public'' is RETIRED: unused by the app '
  'and ignored by RLS. Broad reach happens via Publishing (a later stage), not visibility.';
