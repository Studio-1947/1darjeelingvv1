import { describe, expect, it } from 'vitest';
import { cafeForTwo, costForTwo } from './cafePrice';

describe('costForTwo', () => {
  it('is two dishes at the menu average, to the nearest ₹10', () => {
    // avg 183.33 -> 366.67 -> 370
    expect(costForTwo([{ name: 'Momo', price: 100 }, { name: 'Thukpa', price: 150 }, { name: 'Thali', price: 300 }])).toBe(370);
  });
  it('skips unpriced and unavailable dishes', () => {
    expect(costForTwo([{ name: 'Tea', price: 0 }, { name: 'Momo', price: 120 }, { name: 'Off', price: 900, available: false }])).toBe(240);
  });
  it('is 0 with no priced dishes', () => {
    expect(costForTwo([])).toBe(0);
    expect(costForTwo(undefined)).toBe(0);
    expect(costForTwo([{ name: 'Tea', price: '' }])).toBe(0);
  });
});

describe('cafeForTwo', () => {
  it('is only for cafes', () => {
    const menu = [{ name: 'Momo', price: 100 }];
    expect(cafeForTwo({ type: 'cafe', extras: { menu } })).toBe(200);
    expect(cafeForTwo({ type: 'shop', extras: { menu } })).toBe(0);
  });
});
