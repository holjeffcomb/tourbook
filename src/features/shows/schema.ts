import { z } from 'zod';

const isoDate = z
  .string()
  .trim()
  .min(1, 'Date is required')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a real date');

export const createShowSchema = z.object({
  date: isoDate,
  // Optional: a show can be scheduled before its venue is booked. The city still
  // places it on the map ("Venue TBD") until a venue is added later.
  venueName: z.string().trim().optional(),
  venueCity: z.string().trim().min(1, 'City is required'),
  // Captured when a venue is picked from Mapbox search; not user-edited.
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
});

export type CreateShowValues = z.infer<typeof createShowSchema>;

// An off day only requires a date. Its location is optional and can be a specific
// place (hotel/address) or just a city; either is geocoded so it lands on the map.
export const offDaySchema = z.object({
  date: isoDate,
  label: z.string().trim().optional(),
  city: z.string().trim().optional(),
  // Captured when a place is picked from Mapbox search; not user-edited.
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
});

export type OffDayValues = z.infer<typeof offDaySchema>;
