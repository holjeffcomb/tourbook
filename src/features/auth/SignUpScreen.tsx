import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { signUpSchema, type SignUpValues } from '@/features/auth/schema';
import { useAuth } from '@/features/auth/AuthContext';
import { spacing } from '@/theme';

export function SignUpScreen() {
  const { signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp(values);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to create account');
    }
  });

  return (
    <Screen>
      <View style={styles.form}>
        <View style={styles.header}>
          <Text variant="title">Create your logbook</Text>
          <Text variant="body" color="textMuted">
            Start recording your touring career.
          </Text>
        </View>

        <Controller
          control={control}
          name="displayName"
          render={({ field, fieldState }) => (
            <TextField
              label="Name"
              autoCapitalize="words"
              autoComplete="name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label="Password"
              secureTextEntry
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />

        {!!formError && (
          <Text variant="caption" color="danger">
            {formError}
          </Text>
        )}

        <Button title="Create account" onPress={onSubmit} loading={formState.isSubmitting} />

        <View style={styles.footer}>
          <Text variant="body" color="textMuted">
            Already have an account?
          </Text>
          <Link href="/sign-in" replace>
            <Text variant="body" color="primary">
              Sign in
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = {
  form: { flex: 1, justifyContent: 'center', gap: spacing.md } as const,
  header: { gap: spacing.xs } as const,
  footer: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' } as const,
};
