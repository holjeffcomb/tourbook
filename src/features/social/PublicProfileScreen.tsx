import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthContext';
import { useProfile, usePublicToursForUser } from '@/features/profile/queries';
import { profileHandle, profileLabel } from '@/features/social/labels';
import {
  useAreFriends,
  useFriendshipWith,
  useSendFriendRequest,
  useUnfriend,
  useCancelFriendRequest,
  useVisibleToursForUser,
} from '@/features/social/queries';
import { formatDateRange } from '@/lib/date';
import { colors, radius, spacing } from '@/theme';

export function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const isSelf = session?.user.id === id;

  const profileQuery = useProfile(id);
  const publicToursQuery = usePublicToursForUser(id);
  const friendshipQuery = useFriendshipWith(id);
  const areFriendsQuery = useAreFriends(id);
  const visibleToursQuery = useVisibleToursForUser(id, !!areFriendsQuery.data);

  const sendRequest = useSendFriendRequest();
  const unfriend = useUnfriend();
  const cancel = useCancelFriendRequest();

  const friendship = friendshipQuery.data;
  const isFriend = !!areFriendsQuery.data;

  const toursToShow = isFriend
    ? (visibleToursQuery.data ?? [])
    : (publicToursQuery.data ?? []);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text variant="body" color="primary" onPress={() => router.back()}>
          Back
        </Text>
      </View>

      {profileQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : profileQuery.isError || !profileQuery.data ? (
        <View style={styles.center}>
          <Text color="danger">Couldn&apos;t load this profile.</Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text variant="title">{profileLabel(profileQuery.data)}</Text>
          {!!profileHandle(profileQuery.data) && (
            <Text color="textMuted">{profileHandle(profileQuery.data)}</Text>
          )}
          {!!profileQuery.data.default_role && (
            <Text color="textMuted">{profileQuery.data.default_role}</Text>
          )}
          {!!profileQuery.data.bio && <Text style={styles.bio}>{profileQuery.data.bio}</Text>}

          {!isSelf && (
            <View style={styles.actions}>
              {isFriend && friendship ? (
                <>
                  <Button
                    title="Compare histories"
                    onPress={() =>
                      router.push({ pathname: '/people/[id]/compare', params: { id } })
                    }
                  />
                  <Button
                    title="Crossed paths"
                    variant="secondary"
                    onPress={() =>
                      router.push({ pathname: '/people/[id]/near-misses', params: { id } })
                    }
                  />
                  <Button
                    title="Unfriend"
                    variant="secondary"
                    onPress={() => unfriend.mutate(friendship.id)}
                    loading={unfriend.isPending}
                  />
                </>
              ) : friendship?.status === 'pending' &&
                friendship.requester_id === session?.user.id ? (
                <Button
                  title="Cancel request"
                  variant="secondary"
                  onPress={() => cancel.mutate(friendship.id)}
                  loading={cancel.isPending}
                />
              ) : friendship?.status === 'pending' &&
                friendship.addressee_id === session?.user.id ? (
                <Button
                  title="Respond to request"
                  onPress={() => router.push('/people/requests')}
                />
              ) : (
                <Button
                  title="Add friend"
                  onPress={() => sendRequest.mutate(id)}
                  loading={sendRequest.isPending}
                />
              )}
            </View>
          )}

          <Text variant="heading">
            {isFriend ? 'Tours you can see' : 'Public tours'}
          </Text>
          {(isFriend ? visibleToursQuery.isLoading : publicToursQuery.isLoading) ? (
            <ActivityIndicator color={colors.primary} />
          ) : toursToShow.length === 0 ? (
            <Text color="textMuted">No tours to show.</Text>
          ) : (
            toursToShow.map((tour) => {
              const dateRange = formatDateRange(tour.start_date, tour.end_date);
              return (
                <Pressable
                  key={tour.id}
                  onPress={() => router.push({ pathname: '/tours/[id]', params: { id: tour.id } })}
                  style={({ pressed }) => [styles.tourRow, pressed && styles.pressed]}
                >
                  <Text variant="body">{tour.act.name}</Text>
                  {!!tour.title && (
                    <Text variant="caption" color="textMuted">
                      {tour.title}
                    </Text>
                  )}
                  {!!dateRange && (
                    <Text variant="caption" color="textMuted">
                      {dateRange}
                    </Text>
                  )}
                  {!!tour.myRole && (
                    <Text variant="caption" color="textMuted">
                      {tour.myRole}
                    </Text>
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
  body: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  bio: {
    marginTop: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  tourRow: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
