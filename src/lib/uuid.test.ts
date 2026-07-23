jest.mock('expo-crypto', () => ({
  randomUUID: () => '3f1b7c2e-5a6d-4e8f-9a0b-1c2d3e4f5a6b',
}));

import { newId } from '@/lib/uuid';

describe('newId', () => {
  it('returns a v4-shaped UUID string', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
