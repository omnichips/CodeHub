// The engine throws plain developer messages ("Split weights are all zero"). People see these instead.
const PLAIN: [RegExp, string][] = [
  [/at least one member/i, 'Choose at least one person to split with.'],
  [/duplicate member/i, 'Something went wrong with the split. Close this and try again.'],
  [/weights are all zero/i, 'Give at least one person a share above zero.'],
  [/percentages must total/i, 'The percentages must add up to 100.'],
  [/exact amounts must total/i, 'The amounts must add up to the expense total.'],
  [/rate is required/i, 'Type the exchange rate for this currency.'],
  [/no rate allowed/i, 'No exchange rate is needed when the expense is in the trip currency.'],
  [/rate must be above zero|invalid rate|does not convert/i, 'That exchange rate does not look right. Use a number such as 65.20.'],
  [/invalid number|non-negative integer/i, 'That does not look like a valid amount.'],
  [/too large/i, 'That number is too large.'],
  [/trip not found|member not found/i, 'That is no longer on this phone.'],
];

export const friendly = (message: string, fallback = 'Something went wrong. Please try again.') =>
  PLAIN.find(([re]) => re.test(message))?.[1] ?? (message.length < 90 && /^[A-Z][^.]*\.?$/.test(message) ? message : fallback);
