// Dark mode: a per-device preference (like the receipt language), so localStorage, not trip data.
const KEY = 'theme';

export function isDark(): boolean {
  try {
    return localStorage.getItem(KEY) === 'dark';
  } catch {
    return false;
  }
}

/** Sets the colours (styles.css, :root[data-theme='dark']) and the browser bar colour. */
export function applyTheme(dark = isDark()) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0c0b' : '#f7f6f1');
}

export function setDark(dark: boolean) {
  try {
    localStorage.setItem(KEY, dark ? 'dark' : 'light');
  } catch {
    /* storage blocked: this session only */
  }
  applyTheme(dark);
}
