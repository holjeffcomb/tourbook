import { z } from 'zod';

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required'),
});

export type ProfileValues = z.infer<typeof profileSchema>;
