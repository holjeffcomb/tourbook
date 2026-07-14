import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useProfileSearch } from '@/features/profile/queries';
import { profileHandle, profileLabel } from '@/features/social/labels';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles } from '@/theme/ThemeProvider';

export function PeopleSearchScreen() {
  const styles = useThemedStyles(createStyles);
  const colors = useColors();
  const router = useRouter();
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term, 250);
  const searchQuery = useProfileSearch(debounced);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <Text variant="title">Find people</Text>
      <Text color="textMuted" style={styles.hint}>
        Search by username or display name.
      </Text>

      <TextField
        label="Search"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="name or @username"
        value={term}
        onChangeText={setTerm}
      />

      {searchQuery.isFetching ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : debounced.trim().length < 2 ? (
        <Text color="textMuted" style={styles.hint}>
          Type at least 2 characters.
        </Text>
      ) : searchQuery.isError ? (
        <Text color="danger">Couldn&apos;t search profiles.</Text>
      ) : (searchQuery.data?.length ?? 0) === 0 ? (
        <Text color="textMuted">No matches.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {searchQuery.data!.map((profile) => (
            <Pressable
              key={profile.id}
              onPress={() =>
                router.push({ pathname: '/people/[id]', params: { id: profile.id } })
              }
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowText}>
                <Text variant="body">{profileLabel(profile)}</Text>
                {!!profileHandle(profile) && (
                  <Text variant="caption" color="textMuted">
                    {profileHandle(profile)}
                  </Text>
                )}
                {!!profile.default_role && (
                  <Text variant="caption" color="textMuted">
                    {profile.default_role}
                  </Text>
                )}
              </View>
              <Text color="primary">View</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  topBar: {
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
  hint: {
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  center: {
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  });
