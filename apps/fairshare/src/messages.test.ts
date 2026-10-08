import { expect, it } from 'vitest';
import { friendly } from './messages';

it('turns engine messages into plain words', () => {
  expect(friendly('Split weights are all zero')).toBe('Give at least one person a share above zero.');
  expect(friendly('Exact amounts must total the expense amount')).toBe('The amounts must add up to the expense total.');
  expect(friendly('Invalid number: 12x')).toBe('That does not look like a valid amount.');
  expect(friendly('Rate "1 EUR = 65 PHP" does not convert USD to PHP')).toContain('exchange rate');
});

it('lets short readable sentences through and hides anything technical', () => {
  expect(friendly('Choose who shared Pizza')).toBe('Choose who shared Pizza');
  expect(friendly('TypeError: x is not a function at foo (bar.js:12:3)')).toBe('Something went wrong. Please try again.');
  expect(friendly('')).toBe('Something went wrong. Please try again.');
});
