const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Formats an ISO date (YYYY-MM-DD) without constructing a Date, avoiding
// timezone shifts that would move the day.
export function formatShowDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return iso;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

// Converts a local calendar date to an ISO date string (YYYY-MM-DD), using the
// date's local parts so the day never shifts due to timezone.
export function dateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parses an ISO date string (YYYY-MM-DD) into a local Date at midnight.
export function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

// Formats an optional start/end pair into a readable range, or null if neither is set.
export function formatDateRange(start: string | null, end: string | null): string | null {
  if (start && end) return `${formatShowDate(start)} – ${formatShowDate(end)}`;
  if (start) return `From ${formatShowDate(start)}`;
  if (end) return `Until ${formatShowDate(end)}`;
  return null;
}
