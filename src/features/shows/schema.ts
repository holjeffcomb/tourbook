import { z } from 'zod';

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a real date');

export const createShowSchema = z.object({
  date: isoDate,
  venueName: z.string().trim().min(1, 'Venue is required'),
  venueCity: z.string().trim().min(1, 'City is required'),
});

export type CreateShowValues = z.infer<typeof createShowSchema>;
