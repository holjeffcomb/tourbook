import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required'),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

export type SignUpValues = z.infer<typeof signUpSchema>;
