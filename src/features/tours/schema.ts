import { z } from 'zod';

export const createTourSchema = z.object({
  actName: z.string().trim().min(1, 'Act is required'),
  role: z.string().trim().optional(),
  title: z.string().trim().optional(),
});

export type CreateTourValues = z.infer<typeof createTourSchema>;
