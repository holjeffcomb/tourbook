// Central registry for every TanStack Query key in the app.
//
// One source of truth makes the cache namespace easy to see, keeps keys from
// colliding, and gives invalidation a single place to reason about. Feature
// `queries.ts` files re-export their keys from here (preserving their public
// names), so call sites elsewhere stay unchanged.
//
// The exact array *values* are load-bearing: they are the persisted cache keys
// and drive prefix-based invalidation. A few pre-existing quirks are preserved
// on purpose (documented inline) so behavior is identical — normalize them in a
// later, deliberate change, not here.

/** Friend-set fingerprint baked into crew/players keys (already sorted+joined). */
type FriendKey = string;

export const queryKeys = {
  tours: {
    /** All of the current user's tours. */
    all: ['tours'] as const,
    detail: (id: string) => ['tours', id] as const,
    membership: (tourId: string) => ['tours', tourId, 'membership'] as const,
    members: (tourId: string) => ['tours', tourId, 'members'] as const,
    searchByAct: (actId: string) => ['tours', 'search', actId] as const,
  },
  shows: {
    /** Stops (the `shows` table) for a tour. */
    list: (tourId: string) => ['shows', tourId] as const,
    // NOTE: singular `show` root is intentional-for-now and differs from the
    // plural list root above; preserved to keep cache/invalidation identical.
    detail: (showId: string) => ['show', showId] as const,
  },
  acts: {
    search: (term: string) => ['acts', 'search', term] as const,
    detail: (id: string) => ['acts', id] as const,
    crew: (actId: string, friendKey: FriendKey) =>
      ['acts', actId, 'crew', friendKey] as const,
  },
  venues: {
    search: (q: string, city: string) => ['venues', 'search', q, city] as const,
    detail: (id: string) => ['venues', id] as const,
    players: (venueId: string, friendKey: FriendKey) =>
      ['venues', venueId, 'players', friendKey] as const,
  },
  /** Mapbox place typeahead (external, not our catalog). */
  places: {
    search: (term: string, city: string) => ['places', 'search', term, city] as const,
  },
  profiles: {
    detail: (userId: string) => ['profile', userId] as const,
    search: (term: string) => ['profiles', 'search', term] as const,
    publicTours: (userId: string) => ['profile', userId, 'public-tours'] as const,
    // NOTE: lives under the `profile` prefix (not `tours`) — preserved as-is.
    visibleTours: (userId: string) => ['profile', userId, 'visible-tours'] as const,
  },
  friends: {
    list: (userId: string) => ['friends', userId] as const,
    pending: (userId: string) => ['friends', userId, 'pending'] as const,
    /** Server-computed crossed paths (near-misses) for the current user. */
    crossings: (userId: string) => ['friends', userId, 'crossings'] as const,
  },
  friendship: {
    /** Prefix for invalidating every friendship query at once. */
    all: ['friendship'] as const,
    between: (a: string, b: string) => ['friendship', a, b] as const,
    /** The `is_friends` RPC variant of a pair. */
    areFriends: (a: string, b: string) => ['friendship', a, b, 'rpc'] as const,
  },
  weather: (lat: number | null, lng: number | null, dateISO: string | null) =>
    ['weather', lat, lng, dateISO] as const,
} as const;
