import { useQueries, useQuery } from '@tanstack/react-query';
import type { Coord } from '@/features/maps/mapScene';
import { fetchDayWeather, type DayWeather } from '@/features/weather/api';

const weatherKey = (coord: Coord | null, dateISO: string | null) =>
  ['weather', coord?.[1] ?? null, coord?.[0] ?? null, dateISO] as const;

const weatherOptions = (coord: Coord | null, dateISO: string | null) => ({
  queryKey: weatherKey(coord, dateISO),
  enabled: coord != null && !!dateISO,
  staleTime: 30 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  retry: 1,
  queryFn: () => fetchDayWeather(coord![1], coord![0], dateISO as string),
});

/** Forecast for a coordinate on a given day. Disabled until both are known. */
export function useDayWeather(coord: Coord | null, dateISO: string | null) {
  return useQuery(weatherOptions(coord, dateISO));
}

export type WeatherPoint = { key: string; coord: Coord | null; date: string };

/** Forecasts for several (coordinate, day) points, returned keyed by `point.key`. */
export function useDaysWeather(points: WeatherPoint[]): Map<string, DayWeather | null> {
  const results = useQueries({
    queries: points.map((p) => weatherOptions(p.coord, p.date)),
  });
  const byKey = new Map<string, DayWeather | null>();
  points.forEach((p, i) => byKey.set(p.key, results[i]?.data ?? null));
  return byKey;
}
