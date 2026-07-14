import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="tours" />
      <Stack.Screen name="people" />
      <Stack.Screen name="venues" />
      <Stack.Screen name="acts" />
    </Stack>
  );
}
