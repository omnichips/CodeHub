// The blocker allowlist (storage.local "allow"); background.js re-registers the blocker when it changes.
async function render() {
  const { allow = [] } = await chrome.storage.local.get('allow');
  document.querySelector('#none').hidden = allow.length > 0;
  document.querySelector('#list').replaceChildren(...allow.map((h) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = 'Turn blocking back on';
    b.onclick = () => chrome.storage.local.set({ allow: allow.filter((a) => a !== h) });
    li.append(h + ' ', b);
    return li;
  }));
}
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.allow) render(); });
render();
