/**
 * Finds a file or folder. Relative paths are tried next to your main file first (the one you ran with
 * `node bot.js`), then in the folder you ran node in. Absolute paths and file:// URLs work too.
 * Returns { path, url, label }; `url` is what import() wants, also on Windows.
 */
export async function locate(target, { extensions = ['.js', '.mjs'] } = {}) {
  const [{ pathToFileURL, fileURLToPath }, path, fs] = await Promise.all([import('node:url'), import('node:path'), import('node:fs')]);
  const raw = target instanceof URL ? target.href : String(target ?? '');
  let tries;
  if (/^file:/i.test(raw)) tries = [fileURLToPath(raw)];
  else if (path.isAbsolute(raw)) tries = [raw];
  else {
    const main = process.argv?.[1] ? path.dirname(path.resolve(process.argv[1])) : null;
    tries = [...new Set([main && path.resolve(main, raw), path.resolve(process.cwd(), raw)].filter(Boolean))];
  }
  const candidates = tries.flatMap((p) => (/\.[mc]?js$/i.test(p) ? [p] : [p, ...extensions.map((ext) => p + ext)]));
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`Can't find ${raw} (looked in ${tries.join(' and ')})`);
  const rel = path.relative(process.cwd(), found);
  const label = (rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : found).split(path.sep).join('/');
  return { path: found, url: pathToFileURL(found).href, label, isDirectory: fs.statSync(found).isDirectory() };
}

/** .js / .mjs files in a folder (recursively), A to Z. Names starting with _ or . are skipped. */
export async function listFiles(dir, { recursive = true } = {}) {
  const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')]);
  const out = [];
  const walk = async (folder) => {
    const entries = (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (/^[_.]/.test(entry.name)) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await walk(full);
      } else if (/\.m?js$/i.test(entry.name)) {
        out.push(full);
      }
    }
  };
  await walk(dir);
  return out;
}

/** Imports a module; a version above 0 adds ?v=n so Node reads the file again (hot reload). */
export async function importFile(url, version = 0) {
  return import(version ? `${url}?v=${version}` : url);
}

export function basename(label) {
  return label.replace(/^.*\//, '').replace(/\.m?js$/i, '');
}
