import { findPausedCreatesForId } from '@/lib/offline/dequeue';

type M = {
  options: { mutationKey?: readonly unknown[] };
  state: { isPaused: boolean; variables?: unknown };
};

const SHOWS_CREATE = ['shows', 'create'] as const;
const OFFDAYS_CREATE = ['offDays', 'create'] as const;

function m(key: readonly unknown[], isPaused: boolean, id?: string): M {
  return { options: { mutationKey: key }, state: { isPaused, variables: id ? { id } : {} } };
}

describe('findPausedCreatesForId', () => {
  it('matches a paused create with the given id and key', () => {
    const list = [m(SHOWS_CREATE, true, 'row-1'), m(OFFDAYS_CREATE, true, 'row-2')];
    const found = findPausedCreatesForId(list, [SHOWS_CREATE, OFFDAYS_CREATE], 'row-1');
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(list[0]);
  });

  it('ignores non-paused mutations (already syncing/synced)', () => {
    const list = [m(SHOWS_CREATE, false, 'row-1')];
    expect(findPausedCreatesForId(list, [SHOWS_CREATE], 'row-1')).toHaveLength(0);
  });

  it('ignores mutations with a different id or key', () => {
    const list = [m(SHOWS_CREATE, true, 'other'), m(['tours', 'create'], true, 'row-1')];
    expect(findPausedCreatesForId(list, [SHOWS_CREATE, OFFDAYS_CREATE], 'row-1')).toHaveLength(0);
  });
});
