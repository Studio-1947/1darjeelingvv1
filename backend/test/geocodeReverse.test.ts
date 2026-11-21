import { describe, it, expect } from 'vitest';
import { shortPlaceName } from '../src/routes/geocode';
import { checkNameLike } from '../src/lib/contentRules';

/** "My location" in host sign-up names the spot from GPS; the name becomes the listing's location. */
describe('shortPlaceName', () => {
  it('gives the street and the town', () => {
    expect(shortPlaceName({ road: 'Lebong Cart Road', town: 'Darjeeling', state_district: 'Darjeeling' }, 'x')).toBe('Lebong Cart Road, Darjeeling');
  });

  it('falls back to hamlet / village when there is no road', () => {
    expect(shortPlaceName({ hamlet: 'Lepchajagat', county: 'Darjeeling Pulbazar' }, 'x')).toBe('Lepchajagat, Darjeeling Pulbazar');
  });

  it('does not repeat a name that is both the spot and the town', () => {
    expect(shortPlaceName({ suburb: 'Mirik', town: 'mirik' }, 'x')).toBe('Mirik');
  });

  it('uses the first two parts of the full address when the parts are missing', () => {
    expect(shortPlaceName({}, 'Tiger Hill, Ghum, Darjeeling, West Bengal, India')).toBe('Tiger Hill, Ghum');
  });

  it('produces a name the signup location check accepts', () => {
    const name = shortPlaceName({ road: 'Hill Cart Road', city: 'Siliguri' }, 'x');
    expect('value' in checkNameLike(name, 'Location', 200)).toBe(true);
  });
});
