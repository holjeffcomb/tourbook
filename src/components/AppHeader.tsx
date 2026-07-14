import { StyleSheet, View, type ViewProps } from 'react-native';
import { ProfileMenuButton } from '@/components/ProfileMenu';
import { Text } from '@/components/Text';
import { spacing } from '@/theme';

type Props = ViewProps & {
  title: string;
  subtitle?: string;
  showProfileMenu?: boolean;
};

export function AppHeader({ title, subtitle, showProfileMenu = true, style, ...rest }: Props) {
  return (
    <View style={[styles.header, style]} {...rest}>
      <View style={styles.titles}>
        <Text variant="title">{title}</Text>
        {!!subtitle && <Text color="textMuted">{subtitle}</Text>}
      </View>
      {showProfileMenu && <ProfileMenuButton />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  titles: {
    flex: 1,
    gap: spacing.xs,
  },
});
