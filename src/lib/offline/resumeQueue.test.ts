import {
  partitionQueuedMutations,
  shouldReplayQueued,
  type QueuedMutationInfo,
} from './resumeQueue';

const ME = 'user-me';
const OTHER = 'user-other';

describe('shouldReplayQueued', () => {
  it('replays only a queued write created under the current user', () => {
    expect(shouldReplayQueued(ME, ME)).toBe(true);
    expect(shouldReplayQueued(OTHER, ME)).toBe(false);
  });

  it('fails closed when the queued write has no userId', () => {
    expect(shouldReplayQueued(undefined, ME)).toBe(false);
    expect(shouldReplayQueued('', ME)).toBe(false);
  });
});

describe('partitionQueuedMutations', () => {
  it('replays all when every paused mutation matches the current user', () => {
    const queue: QueuedMutationInfo[] = [
      { isPaused: true, userId: ME },
      { isPaused: true, userId: ME },
    ];
    const { replay, discard } = partitionQueuedMutations(queue, ME);
    expect(replay).toHaveLength(2);
    expect(discard).toHaveLength(0);
  });

  it('discards all when every paused mutation belongs to another user', () => {
    const queue: QueuedMutationInfo[] = [
      { isPaused: true, userId: OTHER },
      { isPaused: true, userId: undefined },
    ];
    const { replay, discard } = partitionQueuedMutations(queue, ME);
    expect(replay).toHaveLength(0);
    expect(discard).toHaveLength(2);
  });

  it('splits a mixed queue, replaying mine and discarding the rest', () => {
    const mine1: QueuedMutationInfo = { isPaused: true, userId: ME };
    const mine2: QueuedMutationInfo = { isPaused: true, userId: ME };
    const theirs: QueuedMutationInfo = { isPaused: true, userId: OTHER };
    const orphan: QueuedMutationInfo = { isPaused: true, userId: undefined };

    const { replay, discard } = partitionQueuedMutations([mine1, theirs, mine2, orphan], ME);

    expect(replay).toEqual([mine1, mine2]);
    expect(discard).toEqual([theirs, orphan]);
  });

  it('ignores mutations that are not paused (not part of the offline queue)', () => {
    const queue: QueuedMutationInfo[] = [
      { isPaused: false, userId: ME }, // active / settled — not queued
      { isPaused: false, userId: OTHER },
      { isPaused: true, userId: ME },
    ];
    const { replay, discard } = partitionQueuedMutations(queue, ME);
    expect(replay).toHaveLength(1);
    expect(discard).toHaveLength(0);
  });
});
