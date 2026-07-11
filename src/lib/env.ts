import { z } from 'zod';

// EXPO_PUBLIC_* vars are inlined at build time, so they must be referenced
// statically (not via a dynamic key) for Expo to replace them.
const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Optional so the app runs before Mapbox is set up; venue search and the map
  // are simply disabled until a public token is provided.
  EXPO_PUBLIC_MAPBOX_TOKEN: z.string().min(1).optional(),
});

const parsed = schema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration. Check your .env file:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = {
  supabaseUrl: parsed.data.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: parsed.data.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  mapboxToken: parsed.data.EXPO_PUBLIC_MAPBOX_TOKEN,
};
