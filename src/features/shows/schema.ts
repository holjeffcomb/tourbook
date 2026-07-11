import { z } from 'zod';

const isoDate = z
  .string()
  .trim()
  .min(1, 'Date is required')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a real date');

export const createShowSchema = z.object({
  date: isoDate,
  venueName: z.string().trim().min(1, 'Venue is required'),
  venueCity: z.string().trim().min(1, 'City is required'),
  // Captured when a venue is picked from Mapbox search; not user-edited.
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  address: z.string().nullable().optional(),
});

export type CreateShowValues = z.infer<typeof createShowSchema>;
