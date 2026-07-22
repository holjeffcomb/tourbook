import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { usePendingFriendships, useFriends } from '@/features/social/queries';
import { useUpcomingCrossedPaths } from '@/features/social/useUpcomingCrossedPaths';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useColors, useThemedStyles, useThemePreference, type ThemePreference } from '@/theme/ThemeProvider';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

function ThemeSelector() {
  const { preference, setPreference } = useThemePreference();
  const colors = useColors();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.segment}>
      {THEME_OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => setPreference(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Icon
              name={option.icon}
              size={18}
              color={active ? 'onPrimary' : 'textSecondary'}
            />
            <Text
              variant="callout"
              color={active ? 'onPrimary' : 'text'}
              style={active ? { color: colors.onPrimary } : undefined}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingsRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text variant="body">{label}</Text>
      {!!detail && (
        <Text variant="caption" color="textMuted">
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const colors = useColors();
  const styles = useThemedStyles(createStyles);
  const friendsQuery = useFriends();
  const pendingQuery = usePendingFriendships();
  const crossedPaths = useUpcomingCrossedPaths();

  const incomingCount =
    pendingQuery.data?.filter((friendship) => friendship.direction === 'incoming').length ?? 0;

  const isLoading = friendsQuery.isLoading || pendingQuery.isLoading;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      <AppHeader title="Settings" showProfileMenu={false} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text variant="heading">Appearance</Text>
        <ThemeSelector />

        <Text variant="heading" style={styles.sectionGap}>
          People
        </Text>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <SettingsRow label="Find people" onPress={() => router.push('/people')} />
            <SettingsRow
              label="Connection requests"
              detail={incomingCount > 0 ? `${incomingCount} waiting` : undefined}
              onPress={() => router.push('/people/requests')}
            />
            <SettingsRow
              label="Connections"
              detail={friendsQuery.data ? `${friendsQuery.data.length} connections` : undefined}
              onPress={() => router.push('/people/friends')}
            />
            {crossedPaths.count > 0 && (
              <SettingsRow
                label="Upcoming crossed paths"
                detail={`${crossedPaths.count} upcoming`}
                onPress={() => router.push('/people/crossed-paths')}
              />
            )}
            {session?.user.id && (
              <SettingsRow
                label="View my public profile"
                onPress={() =>
                  router.push({ pathname: '/people/[id]', params: { id: session.user.id } })
                }
              />
            )}
          </>
        )}

        <Text variant="heading" style={styles.sectionGap}>
          Account
        </Text>
        <Text color="textMuted">{session?.user.email ?? '—'}</Text>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    topBar: {
      paddingTop: spacing.md,
    },
    body: {
      gap: spacing.sm,
      paddingBottom: spacing.xl,
    },
    sectionGap: {
      marginTop: spacing.lg,
    },
    segment: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    segmentItemActive: {
      backgroundColor: colors.primary,
    },
    row: {
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      gap: spacing.xs,
    },
    rowPressed: {
      opacity: 0.7,
    },
  });
