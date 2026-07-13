import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '@/theme';

function AddTabButton() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/tours/new')}
      accessibilityRole="button"
      accessibilityLabel="Add tour"
      style={styles.addButton}
    >
      <View style={styles.addCircle}>
        <RNText style={styles.addPlus}>+</RNText>
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Tours',
          tabBarLabel: 'My Tours',
        }}
      />
      <Tabs.Screen
        name="friends-tours"
        options={{
          title: "Friends' Tours",
          tabBarLabel: "Friends' Tours",
        }}
      />
      <Tabs.Screen
        name="passport"
        options={{
          title: 'Lifetime',
          tabBarLabel: 'Lifetime',
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
    marginTop: -2,
  },
});
