import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import type { NearMiss } from '@/features/stats/types';
import { formatShowDate } from '@/lib/date';
import { formatMiles } from '@/lib/geo';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

type Props = {
  nearMiss: NearMiss;
  upcoming: boolean;
  theirName: string;
  /** Optional friend label for the global upcoming list. */
  withFriend?: string;
  onPress: () => void;
};

function kindBadge(kind: NearMiss['kind']) {
  if (kind === 'same_venue') return 'Same venue';
  if (kind === 'same_city') return 'Same city';
  return 'Nearby';
}

export function NearMissListCard({
  nearMiss,
  upcoming,
  theirName,
  withFriend,
  onPress,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const dateLabel =
    nearMiss.dateA === nearMiss.dateB
      ? formatShowDate(nearMiss.dateA)
      : `${formatShowDate(nearMiss.dateA)} / ${formatShowDate(nearMiss.dateB)}`;

  const youVenue = nearMiss.stopA.label;
  const themVenue = nearMiss.stopB.label;
  const youCity = nearMiss.stopA.city;
  const themCity = nearMiss.stopB.city;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        upcoming && styles.cardUpcoming,
        pressed && styles.pressed,
      ]}
    >
      <Avatar name={theirName} size={48} />

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text variant="caption" color={upcoming ? 'primary' : 'textMuted'}>
            {upcoming ? 'Upcoming' : 'Past'} · {kindBadge(nearMiss.kind)}
          </Text>
          <Text variant="caption" color="textMuted">
            {formatMiles(nearMiss.milesApart)}
          </Text>
        </View>

        <Text variant="body">{dateLabel}</Text>

        {!!withFriend && (
          <Text variant="caption" color="primary">
            With {withFriend}
          </Text>
        )}

        <Text variant="caption" color="textMuted" numberOfLines={2}>
          You: {youVenue}
          {youCity ? ` · ${youCity}` : ''}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={2}>
          {theirName}: {themVenue}
          {themCity ? ` · ${themCity}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    cardUpcoming: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryMuted,
    },
    pressed: {
      opacity: 0.75,
    },
    body: {
      flex: 1,
      gap: 2,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
  });
