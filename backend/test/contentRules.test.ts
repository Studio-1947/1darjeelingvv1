import { describe, it, expect } from 'vitest';
import { checkNameLike, checkPostText, tidyText } from '../src/lib/contentRules';
import { REFERRAL_CODE_IN_TEXT } from '../src/lib/reviewRules';

// From the 6 Nov 2026 UI audit: test text and one-letter names reached the live site.
describe('content rules', () => {
  it.each(['D', 'd', 'asdasd', 'zxczxfsdfsdf', 'qwerty', 'x1'])('refuses %j as a name or place', (v) => {
    expect('error' in checkNameLike(v, 'Name', 120)).toBe(true);
  });

  it.each([
    'DC CAFE', 'Liberty Homestay', 'Property', 'Dada', 'Didi', 'Tshering Lepcha', 'Glenary’s Bakery & Café',
    'Rhythm Cafe', 'eazy stay', 'Chito aau', 'Mist & Pine Homestay', 'दार्जिलिंग होमस्टे', 'Mirik', 'NJP',
    'Sky', 'Lebong, Darjeeling', 'Tiger Hill', 'Batasia Loop',
  ])('accepts the real name %j', (v) => {
    expect(checkNameLike(v, 'Name', 120)).toEqual({ value: v });
  });

  it('tidies spacing', () => {
    expect(tidyText('  Dali ,  Darjeeling ')).toBe('Dali, Darjeeling');
    expect(checkNameLike('Dali , Darjeeling', 'Location', 200)).toEqual({ value: 'Dali, Darjeeling' });
  });

  it('refuses keyboard-mash posts but keeps real ones', () => {
    expect(checkPostText('zxczxfsdfsdf')).not.toBeNull();
    expect(checkPostText('asdf asdf')).not.toBeNull();
    expect(checkPostText('Fresh momos today!')).toBeNull();
    expect(checkPostText('Open at 7, chiya ready')).toBeNull();
  });

  it('spots a referral code inside review text', () => {
    expect(REFERRAL_CODE_IN_TEXT.test('Very good ANG26-4AWLNE')).toBe(true);
    expect(REFERRAL_CODE_IN_TEXT.test('Very good stay, angry dog though')).toBe(false);
  });
});
