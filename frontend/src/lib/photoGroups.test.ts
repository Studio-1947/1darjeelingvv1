import { describe, it, expect } from 'vitest';
import { groupPhotos } from './photoGroups';

describe('homestay photo groups', () => {
  it('groups labelled photos front, outside, rooms, then the rest', () => {
    const groups = groupPhotos(['r1', 'f', 'x', 'o', 'r2'], { r1: 'room', f: 'front', o: 'outside', r2: 'room' });
    expect(groups).toEqual([
      { kind: 'front', urls: ['f'] },
      { kind: 'outside', urls: ['o'] },
      { kind: 'room', urls: ['r1', 'r2'] },
      { kind: 'other', urls: ['x'] },
    ]);
  });
  it('shows everything as one group when nothing is labelled', () => {
    expect(groupPhotos(['a', 'b'], undefined)).toEqual([{ kind: 'other', urls: ['a', 'b'] }]);
  });
  it('ignores an unknown label', () => {
    expect(groupPhotos(['a'], { a: 'garage' })).toEqual([{ kind: 'other', urls: ['a'] }]);
  });
});
