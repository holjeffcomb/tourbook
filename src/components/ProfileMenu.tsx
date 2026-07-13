import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { useProfile } from '@/features/profile/queries';
import { profileLabel } from '@/features/social/labels';
import { colors, radius, spacing } from '@/theme';

type MenuItem = {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
};

export function ProfileMenuButton() {
  const router = useRouter();
  const { signOut } = useAuth();
  const profileQuery = useProfile();
  const [open, setOpen] = useState(false);

  const name = profileLabel(profileQuery.data);

  const items: MenuItem[] = [
    {
      label: 'My Profile',
      icon: 'person-outline',
      onPress: () => router.push('/profile'),
    },
    {
      label: 'Settings',
      icon: 'settings-outline',
      onPress: () => router.push('/settings'),
    },
    {
      label: 'Sign Out',
      icon: 'log-out-outline',
      onPress: () => signOut(),
      destructive: true,
    },
  ];

  const close = () => setOpen(false);

  const onItemPress = (item: MenuItem) => {
    close();
    item.onPress();
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Account menu"
        hitSlop={8}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Avatar name={name} size={36} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <View style={styles.menu}>
            {items.map((item, index) => (
              <Pressable
                key={item.label}
                onPress={() => onItemPress(item)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.menuItem,
                  index === items.length - 1 && styles.menuItemLast,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <Icon
                  name={item.icon}
                  size={18}
                  color={item.destructive ? 'danger' : 'textSecondary'}
                />
                <Text color={item.destructive ? 'danger' : 'text'}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'flex-end',
    paddingTop: spacing.md + 44,
    paddingRight: spacing.md,
  },
  menu: {
    minWidth: 180,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemPressed: {
    backgroundColor: colors.surface,
  },
});
