/** Checks apps.json and returns a list of problems (empty when it is fine). Pure, so it is easy to test. */
export function validateRegistry(reg) {
  const errors = [];
  if (!reg || typeof reg.title !== 'string' || !reg.title.trim()) errors.push('"title" is required');
  if (!Array.isArray(reg?.apps)) return [...errors, '"apps" must be a list'];

  const seen = new Set();
  let docked = 0;
  reg.apps.forEach((a, i) => {
    const at = `apps[${i}]${a?.id ? ` (${a.id})` : ''}`;
    if (!a || typeof a !== 'object') return errors.push(`${at}: must be an object`);
    // The id becomes the web address (/<id>/) and a folder name. Underscore is kept for the hub's own folders.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(a.id ?? '')) errors.push(`${at}: "id" must be lowercase letters, numbers and dashes, starting with a letter or number`);
    if (seen.has(a.id)) errors.push(`${at}: duplicate id`);
    seen.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim()) errors.push(`${at}: "name" is required`);
    if (a.color !== undefined && !/^#[0-9a-f]{6}$/i.test(a.color)) errors.push(`${at}: "color" must look like #3f7d46`);
    if (a.icon !== undefined && typeof a.icon !== 'string') errors.push(`${at}: "icon" must be a file path inside the app`);
    if (a.icon !== undefined && !/\.(svg|png)$/i.test(a.icon)) errors.push(`${at}: "icon" must be an .svg or .png file`);
    if (a.folder !== undefined && (typeof a.folder !== 'string' || !a.folder.trim())) errors.push(`${at}: "folder" must be a name`);
    if (a.dock && a.folder) errors.push(`${at}: an app cannot be in the dock and in a folder`);
    if (a.dock && ++docked > 4) errors.push(`${at}: the dock holds at most 4 apps`);

    const s = a.source;
    if (!s || !['vite', 'static'].includes(s.type)) errors.push(`${at}: "source.type" must be "vite" or "static"`);
    else if (typeof s.dir !== 'string' || !s.dir) errors.push(`${at}: "source.dir" is required`);
    else if (s.type === 'static' && s.entry !== undefined && typeof s.entry !== 'string') errors.push(`${at}: "source.entry" must be a file name`);
  });
  return errors;
}
