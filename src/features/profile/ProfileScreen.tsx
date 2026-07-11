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
import { useProfile, useUpdateProfile } from '@/features/profile/queries';
import { profileSchema, type ProfileValues } from '@/features/profile/schema';
import { colors, spacing } from '@/theme';

function ProfileForm({ profile, email }: { profile: Profile; email: string | undefined }) {
  const updateProfile = useUpdateProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { control, handleSubmit, formState } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: profile.display_name ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      await updateProfile.mutateAsync(values.displayName);
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

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          ‹ Back
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text variant="title">Profile</Text>
        </View>

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
  topBar: {
    flexDirection: 'row',
    paddingTop: spacing.md,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
