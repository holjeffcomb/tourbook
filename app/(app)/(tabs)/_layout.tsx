import Ionicons from '@react-native-vector-icons/ionicons';
import { Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';
import { type IconName } from '@/components/Icon';
import { TabBarBridge } from '@/features/maps/FloatingTabBar';
import { useColors } from '@/theme/ThemeProvider';

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const colors = useColors();

  return (
    <Tabs
      // The map renders on top of the navigator, which would bury a native tab
      // bar. So draw nothing here and relay state to the app-level FloatingTabBar
      // (rendered above the map) instead.
      tabBar={(props) => <TabBarBridge {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Tours',
          tabBarIcon: tabIcon('map', 'map-outline'),
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
          tabBarIcon: tabIcon('add', 'add'),
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
