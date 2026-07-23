import type { IconName } from '@/components/Icon';

export type WeatherCondition = {
  code: number;
  icon: IconName;
  label: string;
};

export type DayWeather = {
  date: string;
  condition: WeatherCondition;
  highF: number;
  lowF: number;
  /** "Right now" temperature — only meaningful for today. */
  currentF: number | null;
};

// WMO weather-interpretation codes → an Ionicon + short label.
// See https://open-meteo.com/en/docs (Weather variable documentation).
export function describeWeather(code: number): WeatherCondition {
  const pick = (icon: IconName, label: string): WeatherCondition => ({ code, icon, label });
  if (code === 0) return pick('sunny', 'Clear');
  if (code === 1 || code === 2) return pick('partly-sunny', 'Partly cloudy');
  if (code === 3) return pick('cloudy', 'Overcast');
  if (code === 45 || code === 48) return pick('cloudy', 'Fog');
  if (code >= 51 && code <= 57) return pick('rainy', 'Drizzle');
  if (code >= 61 && code <= 67) return pick('rainy', 'Rain');
  if (code >= 71 && code <= 77) return pick('snow', 'Snow');
  if (code >= 80 && code <= 82) return pick('rainy', 'Showers');
  if (code === 85 || code === 86) return pick('snow', 'Snow showers');
  if (code >= 95) return pick('thunderstorm', 'Thunderstorms');
  return pick('partly-sunny', 'Mild');
}

/**
 * Fetches the forecast for a single day at a coordinate via Open-Meteo (free, no
 * key). Returns null on any miss so callers can simply hide the weather block.
 * Temps are Fahrenheit to match the app's mile-based units.
 */
export async function fetchDayWeather(
  latitude: number,
  longitude: number,
  dateISO: string,
): Promise<DayWeather | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    current: 'temperature_2m',
    temperature_unit: 'fahrenheit',
    timezone: 'auto',
    start_date: dateISO,
    end_date: dateISO,
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) return null;

  const json = (await res.json()) as {
    current?: { temperature_2m?: number };
    daily?: {
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };

  const code = json.daily?.weather_code?.[0];
  const hi = json.daily?.temperature_2m_max?.[0];
  const lo = json.daily?.temperature_2m_min?.[0];
  if (code == null || hi == null || lo == null) return null;

  const current = json.current?.temperature_2m;
  return {
    date: dateISO,
    condition: describeWeather(code),
    highF: Math.round(hi),
    lowF: Math.round(lo),
    currentF: current != null ? Math.round(current) : null,
  };
}
