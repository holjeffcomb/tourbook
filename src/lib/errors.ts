// Supabase's PostgrestError is a plain object (not `instanceof Error`), so a
// naive `error instanceof Error` check hides the real message. This normalizes
// any thrown value into a readable string.
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const maybe = error as { message?: unknown; error_description?: unknown; details?: unknown };
    for (const value of [maybe.message, maybe.error_description, maybe.details]) {
      if (typeof value === 'string' && value) return value;
    }
  }
  return fallback;
}
