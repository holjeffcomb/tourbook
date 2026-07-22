import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { useOfflineSyncStatus } from '@/features/offline/useOfflineSyncStatus';
import { radius, spacing } from '@/theme';
import { useColors } from '@/theme/ThemeProvider';

// A deliberately subtle, top-anchored pill that surfaces offline write state
// without ever blocking the user (offline is the normal case — see
// docs/design/offline-write-support.md §4.6). Hidden entirely when nothing is
// pending and there's no error.
export function PendingSyncBar() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, pendingCount, retry } = useOfflineSyncStatus();

  if (state === 'idle') return null;

  const isError = state === 'error';
  const label =
    state === 'offline'
      ? `Offline · ${pendingCount} pending`
      : state === 'syncing'
        ? `Syncing ${pendingCount}…`
        : "Couldn't sync";

  return (
    <View pointerEvents="box-none" style={[styles.container, { top: insets.top + spacing.xs }]}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: isError ? colors.dangerMuted : colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <Text variant="caption" color={isError ? 'danger' : 'textSecondary'}>
          {label}
        </Text>
        {isError ? (
          <Pressable onPress={retry} hitSlop={8} accessibilityRole="button">
            <Text variant="caption" color="primary" weight="semibold">
              Retry
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
