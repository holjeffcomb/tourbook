import Ionicons from '@react-native-vector-icons/ionicons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { useColors } from '@/theme/ThemeProvider';

function AddTabButton() {
  const router = useRouter();
  const colors = useColors();

  return (
    <Pressable
      onPress={() => router.push('/tours/new')}
      accessibilityRole="button"
      accessibilityLabel="Add tour"
      style={styles.addButton}
    >
      <View style={[styles.addCircle, { backgroundColor: colors.primary }]}>
        <Icon name="add" size={28} color="onPrimary" />
      </View>
    </Pressable>
  );
}

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const colors = useColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Tours',
          tabBarIcon: tabIcon('musical-notes', 'musical-notes-outline'),
        }}
      />
      <Tabs.Screen
        name="friends-tours"
        options={{
          title: "Friends' Tours",
          tabBarIcon: tabIcon('people', 'people-outline'),
        }}
      />
      <Tabs.Screen
        name="passport"
        options={{
          title: 'Lifetime',
          tabBarIcon: tabIcon('earth', 'earth-outline'),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarLabel: () => null,
          tabBarButton: () => <AddTabButton />,
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -4,
  },
  addCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
