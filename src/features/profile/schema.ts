import { z } from 'zod';

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required'),
  username: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine((v) => v == null || /^[a-zA-Z0-9_]{3,30}$/.test(v), {
      message: '3–30 letters, numbers, or underscores',
    }),
  bio: z
    .string()
    .trim()
    .max(280, 'Keep it under 280 characters')
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  defaultRole: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === '' ? null : v))
    .nullable(),
});

export type ProfileValues = z.infer<typeof profileSchema>;
