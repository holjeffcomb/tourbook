import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthContext';
import type { Profile } from '@/features/profile/api';
import { useProfile, useUpdateProfile } from '@/features/profile/queries';
import { profileSchema, type ProfileValues } from '@/features/profile/schema';
import { spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

function ProfileForm({ profile, email }: { profile: Profile; email: string | undefined }) {
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const profileQuery = useProfile();

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <AppHeader title="My Profile" showProfileMenu={false} />

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
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  flex: {
    flex: 1,
  },
  topBar: {
    paddingTop: spacing.md,
  },
  form: {
    gap: spacing.md,
    paddingTop: spacing.md,
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
