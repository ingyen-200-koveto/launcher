const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { getJson, download } = require('./net');

const FABRIC_META = 'https://meta.fabricmc.net/v2/versions/loader';
const MODRINTH = 'https://api.modrinth.com/v2';

function javaBinary(folder) {
  if (!fs.existsSync(folder)) {
    return null;
  }
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  const stack = [folder];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === exe && path.basename(dir) === 'bin') {
        return full;
      }
    }
  }
  return null;
}

/** Java 21 (Eclipse Temurin JRE) a launcher saját mappájába, ha még nincs meg. */
async function ensureJava(dataDir, report) {
  const folder = path.join(dataDir, 'runtime', 'java21');
  const existing = javaBinary(folder);
  if (existing) {
    return existing;
  }
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const archive = os === 'windows' ? 'zip' : 'tar.gz';
  const url = `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  const file = path.join(dataDir, 'runtime', `java21.${archive}`);
  report('Java letöltése...', 0);
  await download(url, file, { onProgress: (p) => report('Java letöltése...', p) });
  report('Java kicsomagolása...', null);
  fs.mkdirSync(folder, { recursive: true });
  if (archive === 'zip') {
    await extract(file, { dir: folder });
  } else {
    const { execFileSync } = require('child_process');
    execFileSync('tar', ['-xzf', file, '-C', folder]);
  }
  fs.rmSync(file, { force: true });
  const binary = javaBinary(folder);
  if (!binary) {
    throw new Error('Nem sikerült a Javát telepíteni.');
  }
  return binary;
}

/** A Fabric profil (verzió JSON) a játék mappájába. Visszaadja a verzió nevét (pl. fabric-loader-0.16.9-1.20.6). */
async function ensureFabric(gameDir, minecraft, loader, report) {
  report('Fabric ellenőrzése...', null);
  let loaderVersion = loader;
  if (!loaderVersion || loaderVersion === 'latest') {
    try {
      const list = await getJson(`${FABRIC_META}/${minecraft}`);
      const stable = list.find((entry) => entry.loader && entry.loader.stable) || list[0];
      loaderVersion = stable.loader.version;
    } catch (error) {
      const installed = installedFabric(gameDir, minecraft);
      if (installed) {
        return installed;
      }
      throw error;
    }
  }
  const id = `fabric-loader-${loaderVersion}-${minecraft}`;
  const file = path.join(gameDir, 'versions', id, `${id}.json`);
  if (!fs.existsSync(file)) {
    const profile = await getJson(`${FABRIC_META}/${minecraft}/${loaderVersion}/profile/json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(profile, null, 2));
  }
  return id;
}

function installedFabric(gameDir, minecraft) {
  const versions = path.join(gameDir, 'versions');
  if (!fs.existsSync(versions)) {
    return null;
  }
  const found = fs.readdirSync(versions).filter((name) => name.startsWith('fabric-loader-') && name.endsWith(`-${minecraft}`));
  return found.length ? found.sort().pop() : null;
}

async function modrinthVersion(project, minecraft) {
  const query = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([minecraft]))}`;
  const versions = await getJson(`${MODRINTH}/project/${encodeURIComponent(project)}/version?${query}`);
  return versions.find((v) => v.version_type === 'release') || versions[0] || null;
}

/**
 * Az IceMine modok (Modrinthről, a játékos gépére), a kötelező függőségeikkel együtt. Amit korábban a launcher
 * rakott fel, de már nincs a listában, azt törli; a játékos saját modjaihoz nem nyúl.
 */
async function ensureMods(gameDir, minecraft, projects, report) {
  const modsDir = path.join(gameDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const stateFile = path.join(modsDir, '.icemine.json');
  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (error) {
    previous = [];
  }
  const queue = [...projects];
  const seen = new Set();
  const wanted = [];
  const skipped = [];
  while (queue.length) {
    const project = queue.shift();
    if (seen.has(project)) {
      continue;
    }
    seen.add(project);
    report(`Modok ellenőrzése: ${project}`, null);
    let version;
    try {
      version = await modrinthVersion(project, minecraft);
    } catch (error) {
      version = null;
    }
    if (!version) {
      skipped.push(project);
      continue;
    }
    const file = version.files.find((f) => f.primary) || version.files[0];
    wanted.push({ project, filename: file.filename, url: file.url, sha1: file.hashes && file.hashes.sha1 });
    for (const dependency of version.dependencies || []) {
      if (dependency.dependency_type === 'required' && dependency.project_id) {
        queue.push(dependency.project_id);
      }
    }
  }
  if (!wanted.length && previous.length) {
    return { skipped, offline: true };
  }
  for (let i = 0; i < wanted.length; i++) {
    const mod = wanted[i];
    report(`Modok letöltése (${i + 1}/${wanted.length})`, i / wanted.length);
    await download(mod.url, path.join(modsDir, mod.filename), { sha1: mod.sha1 });
  }
  const keep = new Set(wanted.map((m) => m.filename));
  for (const old of previous) {
    if (!keep.has(old)) {
      fs.rmSync(path.join(modsDir, old), { force: true });
    }
  }
  fs.writeFileSync(stateFile, JSON.stringify([...keep], null, 2));
  return { skipped, offline: false };
}

module.exports = { ensureJava, ensureFabric, ensureMods, javaBinary };
