import { describe, it, expect } from 'vitest';
import { applyReaction, topReactions } from './posts';

const base = { like_count: 3, comment_count: 0, liked_by_me: false, reactions: { heart: 2, wow: 1 }, my_reaction: null };

describe('post reactions on screen', () => {
  it('adds a reaction', () => {
    expect(applyReaction(base, 'yum')).toMatchObject({ like_count: 4, my_reaction: 'yum', liked_by_me: true, reactions: { heart: 2, wow: 1, yum: 1 } });
  });
  it('switches a reaction without counting twice', () => {
    const mine = applyReaction(base, 'wow');
    expect(applyReaction(mine, 'heart')).toMatchObject({ like_count: 4, reactions: { heart: 3, wow: 1 } });
  });
  it('takes a reaction back', () => {
    expect(applyReaction(applyReaction(base, 'clap'), null)).toMatchObject({ like_count: 3, liked_by_me: false, my_reaction: null });
  });
  it('treats an older heart-only like as a heart', () => {
    const old = { like_count: 1, comment_count: 0, liked_by_me: true };
    expect(applyReaction(old, null)).toMatchObject({ like_count: 0, liked_by_me: false });
  });
  it('summarises the most used reactions first', () => {
    expect(topReactions({ ...base, reactions: { heart: 1, wow: 5, yum: 2 } })).toEqual(['😮', '😋', '❤️']);
  });
});
