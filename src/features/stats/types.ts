export type DriveSegment = {
  fromStopId: string;
  toStopId: string;
  miles: number;
  fromLabel: string;
  toLabel: string;
};

export type TourStats = {
  showCount: number;
  /** Stops explicitly marked as off days. */
  offDayCount: number;
  /**
   * Rest/travel days across the tour: calendar span minus days that had a show.
   * Captures gaps even when the user hasn't entered explicit off days.
   */
  offDays: number;
  totalStops: number;
  showOffLabel: string;
  calendarDays: number;
  uniqueCities: number;
  uniqueVenues: number;
  locatedStops: number;
  unlocatedStops: number;
  totalMiles: number;
  segmentCount: number;
  avgDriveMiles: number;
  longestDrive: DriveSegment | null;
  shortestDrive: DriveSegment | null;
  countries: string[];
};

export type HighlightGroup = 'time' | 'places' | 'people' | 'road';

export type PassportHighlight = {
  group: HighlightGroup;
  label: string;
  value: string;
  detail?: string;
};

export type PassportStats = {
  tourCount: number;
  totalShows: number;
  totalMiles: number;
  earthLaps: number;
  uniqueCities: number;
  uniqueVenues: number;
  uniqueCountries: number;
  countryPercent: number;
  countriesWithData: number;
  /** Distinct acts across the user's tours. */
  uniqueActs: number;
  /** Distinct calendar dates that had any stop (a proxy for days on the road). */
  daysOnRoad: number;
  /** Longest run of back-to-back show nights (consecutive calendar days). */
  longestShowStreak: number;
  firstShowDate: string | null;
  lastShowDate: string | null;
  mostVisitedCity: { city: string; count: number } | null;
  mostVisitedVenue: { name: string; city: string; count: number } | null;
  mostTouredWith: { userId: string; name: string; tourCount: number } | null;
  /** Act the user has played the most shows for. */
  topAct: { name: string; shows: number } | null;
  /** Year with the most shows. */
  busiestYear: { year: number; shows: number } | null;
  /** Calendar month (1-12) with the most shows across all years. */
  busiestMonth: { month: number; shows: number } | null;
  /** Weekday (0=Sun … 6=Sat) the user plays most often. */
  favoriteWeekday: { weekday: number; shows: number } | null;
  longestTourMiles: number;
  longestSingleDrive: DriveSegment | null;
  highlights: PassportHighlight[];
};

export type OverlapStopRef = {
  stopId: string;
  tourId: string;
  date: string;
  label: string;
  city: string;
  actName: string;
  tourTitle: string | null;
  venueKey: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type OverlapStats = {
  sharedTourCount: number;
  sharedTours: { id: string; actName: string; title: string | null }[];
  mutualActs: string[];
  mutualVenues: string[];
  mutualCities: string[];
  mutualCountries: string[];
  sameDateCount: number;
  sameDates: { date: string; stopA: string; stopB: string }[];
  you: { shows: number; miles: number; cities: number; countries: number };
  them: { shows: number; miles: number; cities: number; countries: number };
};

export type NearMissKind = 'same_venue' | 'same_city' | 'nearby';

export type NearMiss = {
  dateA: string;
  dateB: string;
  stopA: {
    stopId: string;
    label: string;
    city: string;
    lat: number;
    lng: number;
    tourId: string;
    tourTitle: string | null;
    actName: string;
  };
  stopB: {
    stopId: string;
    label: string;
    city: string;
    lat: number;
    lng: number;
    tourId: string;
    tourTitle: string | null;
    actName: string;
  };
  milesApart: number;
  kind: NearMissKind;
};
