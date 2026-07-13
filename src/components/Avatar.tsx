import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { colors } from '@/theme';

type Props = {
  name: string;
  size?: number;
};

/** Initials placeholder until profile photos are supported. */
export function Avatar({ name, size = 48 }: Props) {
  const initials = initialsFromName(name);
  const fontSize = Math.round(size * 0.36);

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      accessibilityLabel={name}
    >
      <Text style={[styles.initials, { fontSize, lineHeight: fontSize + 2 }]}>{initials}</Text>
    </View>
  );
}

export function initialsFromName(name: string): string {
  const cleaned = name.replace(/^@/, '').trim();
  if (!cleaned || cleaned === 'Someone') return '?';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
