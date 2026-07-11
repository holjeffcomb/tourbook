import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { signInSchema, type SignInValues } from '@/features/auth/schema';
import { useAuth } from '@/features/auth/AuthContext';
import { spacing } from '@/theme';

export function SignInScreen() {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to sign in');
    }
  });

  return (
    <Screen>
      <View style={styles.form}>
        <View style={styles.header}>
          <Text variant="title">Welcome back</Text>
          <Text variant="body" color="textMuted">
            Sign in to your logbook.
          </Text>
        </View>

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

        <Button title="Sign in" onPress={onSubmit} loading={formState.isSubmitting} />

        <View style={styles.footer}>
          <Text variant="body" color="textMuted">
            No account yet?
          </Text>
          <Link href="/sign-up" replace>
            <Text variant="body" color="primary">
              Sign up
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
