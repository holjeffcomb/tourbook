export type DriveSegment = {
  fromStopId: string;
  toStopId: string;
  miles: number;
  fromLabel: string;
  toLabel: string;
};

export type TourStats = {
  showCount: number;
  offDayCount: number;
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

export type PassportHighlight = {
  label: string;
  value: string;
  detail?: string;
};

export type PassportStats = {
  tourCount: number;
  totalShows: number;
  totalOffDays: number;
  totalMiles: number;
  earthLaps: number;
  uniqueCities: number;
  uniqueVenues: number;
  uniqueCountries: number;
  countryPercent: number;
  countriesWithData: number;
  mostVisitedCity: { city: string; count: number } | null;
  mostVisitedVenue: { name: string; city: string; count: number } | null;
  mostTouredWith: { userId: string; name: string; tourCount: number } | null;
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
