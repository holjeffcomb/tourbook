import { z } from 'zod';

const optionalIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a real date')
  .nullable();

export const createTourSchema = z
  .object({
    actName: z.string().trim().min(1, 'Act is required'),
    role: z.string().trim().optional(),
    title: z.string().trim().optional(),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    visibility: z.enum(['public', 'friends', 'private']),
  })
  // ISO date strings compare correctly as plain strings.
  .refine((values) => !values.startDate || !values.endDate || values.endDate >= values.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

export type CreateTourValues = z.infer<typeof createTourSchema>;

// 'public' is retired (see docs/design/social-model.md): content visibility is
// Private / Connections only; broad reach happens via Publishing later. The 'public'
// enum value still exists in the DB but is no longer offered here.
export const VISIBILITY_OPTIONS: {
  value: Exclude<CreateTourValues['visibility'], 'public'>;
  label: string;
  hint: string;
}[] = [
  { value: 'private', label: 'Private', hint: 'Only you' },
  { value: 'friends', label: 'Connections', hint: 'Visible to your accepted connections' },
];
