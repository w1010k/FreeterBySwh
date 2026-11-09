/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/*
 * Windows: the PATH in the registry. An app started by the installer (msiexec) gets no user PATH, so its terminals
 * would not find programs such as claude; main adds the registry's folders at start (index.ts refreshWindowsPath).
 */

/** The Path value in `reg query <key> /v Path` output (REG_SZ or REG_EXPAND_SZ). */
export function parseRegPath(output: string): string | undefined {
  return /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*?)\s*$/im.exec(output)?.[1];
}

/** %NAME% from the environment, the name in any case (Windows); an unknown one stays as it is. */
export function expandEnvVars(value: string, env: Record<string, string | undefined>): string {
  const byName = new Map(Object.entries(env).map(([k, v]) => [k.toLowerCase(), v]));
  return value.replace(/%([^%;]+)%/g, (all, name: string) => byName.get(name.toLowerCase()) ?? all);
}

/** `current` with the folders of `extra` it lacks added at its end (Windows: no case, no trailing slash). */
export function mergePath(current: string, extra: string): string {
  const key = (dir: string) => dir.trim().replace(/[\\/]+$/, '').toLowerCase();
  const dirs = current.split(';').filter(d => d.trim() !== '');
  const known = new Set(dirs.map(key));
  for (const dir of extra.split(';')) {
    if (dir.trim() !== '' && !known.has(key(dir))) {
      known.add(key(dir));
      dirs.push(dir.trim());
    }
  }
  return dirs.join(';');
}
