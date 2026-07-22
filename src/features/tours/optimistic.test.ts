import type { MyTour } from '@/features/tours/api';
import {
  applyTourUpdate,
  createTourVarsToMyTour,
  mapTour,
  removeTour,
  upsertTour,
} from '@/features/tours/optimistic';

function tour(id: string, createdAt: string, extra: Partial<MyTour> = {}): MyTour {
  return {
    id,
    title: 'Tour',
    start_date: null,
    end_date: null,
    visibility: 'private',
    created_at: createdAt,
    created_by: 'user-1',
    act: { id: 'act-1', name: 'The Band' },
    myRole: null,
    ...extra,
  };
}

describe('upsertTour', () => {
  it('prepends and keeps newest-first order', () => {
    const list = [tour('a', '2026-01-05T00:00:00Z'), tour('b', '2026-01-01T00:00:00Z')];
    const next = upsertTour(list, tour('c', '2026-01-10T00:00:00Z'));
    expect(next.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('replaces an existing tour with the same id', () => {
    const list = [tour('a', '2026-01-05T00:00:00Z', { title: 'old' })];
    const next = upsertTour(list, tour('a', '2026-01-05T00:00:00Z', { title: 'new' }));
    expect(next).toHaveLength(1);
    expect(next[0].title).toBe('new');
  });
});

describe('removeTour / mapTour', () => {
  it('removes by id (undefined-safe)', () => {
    expect(removeTour([tour('a', 'x'), tour('b', 'y')], 'a').map((t) => t.id)).toEqual(['b']);
    expect(removeTour(undefined, 'a')).toEqual([]);
  });

  it('maps only the matching tour', () => {
    const list = [tour('a', 'x'), tour('b', 'y')];
    const next = mapTour(list, 'b', (t) => ({ ...t, title: 'patched' }));
    expect(next.find((t) => t.id === 'a')?.title).toBe('Tour');
    expect(next.find((t) => t.id === 'b')?.title).toBe('patched');
  });
});

describe('createTourVarsToMyTour', () => {
  it('uses a provisional act id when the act is new', () => {
    const t = createTourVarsToMyTour({
      id: 'tour-9',
      userId: 'user-1',
      actName: 'New Act',
      role: 'FOH',
    });
    expect(t.id).toBe('tour-9');
    expect(t.act.name).toBe('New Act');
    expect(t.act.id).toBe('pending:tour-9');
    expect(t.myRole).toBe('FOH');
    expect(t.visibility).toBe('private');
  });

  it('uses the real act id when provided', () => {
    const t = createTourVarsToMyTour({
      id: 'tour-9',
      userId: 'user-1',
      actName: 'Known',
      actId: 'act-42',
    });
    expect(t.act.id).toBe('act-42');
  });
});

describe('applyTourUpdate', () => {
  it('patches fields and keeps existing role when role is omitted', () => {
    const existing = tour('a', 'x', { myRole: 'Tech' });
    const next = applyTourUpdate(existing, {
      userId: 'user-1',
      tourId: 'a',
      actName: 'Renamed',
      title: 'New title',
    });
    expect(next.act.name).toBe('Renamed');
    expect(next.title).toBe('New title');
    expect(next.myRole).toBe('Tech');
  });

  it('updates role when provided', () => {
    const next = applyTourUpdate(tour('a', 'x', { myRole: 'Tech' }), {
      userId: 'user-1',
      tourId: 'a',
      actName: 'A',
      role: 'Manager',
    });
    expect(next.myRole).toBe('Manager');
  });
});
