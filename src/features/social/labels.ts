import type { Profile } from '@/features/profile/api';

export function profileLabel(profile: Pick<Profile, 'display_name' | 'username'> | null | undefined) {
  if (!profile) return 'Someone';
  const name = profile.display_name?.trim();
  if (name) return name;
  if (profile.username) return `@${profile.username}`;
  return 'Someone';
}

export function profileHandle(profile: Pick<Profile, 'username'> | null | undefined) {
  return profile?.username ? `@${profile.username}` : null;
}
