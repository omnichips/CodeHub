// Per-device preferences (like dark mode and the receipt language): localStorage, not trip data, never synced.
export const getPref = (key: string, fallback = ''): string => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export const setPref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: this session only */
  }
};

/** Currency a new trip starts with. */
export const defaultCurrency = () => getPref('default-currency', 'PHP');
/** The member name that "Paid by" starts on (matched case-insensitively against a trip's members). */
export const myName = () => getPref('my-name');
/** Whether a receipt photo offers to be read; off means it is simply attached. */
export const scanEnabled = () => getPref('receipt-scan', 'on') === 'on';
