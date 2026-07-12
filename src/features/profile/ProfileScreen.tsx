import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthContext';
import type { Profile } from '@/features/profile/api';
import { usePendingFriendships, useFriends } from '@/features/social/queries';
import { useProfile, useUpdateProfile } from '@/features/profile/queries';
import { profileSchema, type ProfileValues } from '@/features/profile/schema';
import { colors, spacing } from '@/theme';

function ProfileForm({ profile, email }: { profile: Profile; email: string | undefined }) {
  const updateProfile = useUpdateProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { control, handleSubmit, formState } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: profile.display_name ?? '',
      username: profile.username,
      bio: profile.bio,
      defaultRole: profile.default_role,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      await updateProfile.mutateAsync({
        displayName: values.displayName,
        username: values.username,
        bio: values.bio,
        defaultRole: values.defaultRole,
      });
      setSaved(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save profile');
    }
  });

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text variant="caption" color="textMuted">
          Email
        </Text>
        <Text variant="body">{email ?? '—'}</Text>
      </View>

      <Controller
        control={control}
        name="displayName"
        render={({ field, fieldState }) => (
          <TextField
            label="Display name"
            autoCapitalize="words"
            autoComplete="name"
            value={field.value}
            onChangeText={(text) => {
              setSaved(false);
              field.onChange(text);
            }}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="username"
        render={({ field, fieldState }) => (
          <TextField
            label="Username"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="your_handle"
            value={field.value ?? ''}
            onChangeText={(text) => {
              setSaved(false);
              field.onChange(text);
            }}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="defaultRole"
        render={({ field, fieldState }) => (
          <TextField
            label="Role (optional)"
            placeholder="e.g. FOH, Lighting Designer"
            autoCapitalize="words"
            value={field.value ?? ''}
            onChangeText={(text) => {
              setSaved(false);
              field.onChange(text);
            }}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="bio"
        render={({ field, fieldState }) => (
          <TextField
            label="Bio (optional)"
            placeholder="Short note about your work"
            multiline
            value={field.value ?? ''}
            onChangeText={(text) => {
              setSaved(false);
              field.onChange(text);
            }}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            style={styles.bio}
          />
        )}
      />

      {!!formError && <Text color="danger">{formError}</Text>}
      {saved && !formState.isDirty && (
        <Text variant="caption" color="textMuted">
          Saved
        </Text>
      )}

      <Button
        title="Save"
        onPress={onSubmit}
        loading={formState.isSubmitting}
        disabled={!formState.isDirty}
      />
    </View>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const profileQuery = useProfile();
  const friendsQuery = useFriends();
  const pendingQuery = usePendingFriendships();

  const incomingCount =
    pendingQuery.data?.filter((f) => f.direction === 'incoming').length ?? 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="title">Profile</Text>
      </View>

      <View style={styles.links}>
        <Button
          title="Find people"
          variant="secondary"
          onPress={() => router.push('/people')}
        />
        <Button
          title={
            incomingCount > 0
              ? `Friend requests (${incomingCount})`
              : 'Friend requests'
          }
          variant="secondary"
          onPress={() => router.push('/people/requests')}
        />
        <Button
          title={`Friends${friendsQuery.data ? ` (${friendsQuery.data.length})` : ''}`}
          variant="secondary"
          onPress={() => router.push('/people/friends')}
        />
        {session?.user.id && (
          <Button
            title="View my public profile"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/people/[id]', params: { id: session.user.id } })
            }
          />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {profileQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : profileQuery.isError || !profileQuery.data ? (
          <View style={styles.center}>
            <Text color="danger">Couldn&apos;t load your profile.</Text>
            <Button title="Retry" variant="secondary" onPress={() => profileQuery.refetch()} />
          </View>
        ) : (
          <ProfileForm profile={profileQuery.data} email={session?.user.email} />
        )}
      </KeyboardAvoidingView>

      <Button title="Sign out" variant="secondary" onPress={() => signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  links: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  bio: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
