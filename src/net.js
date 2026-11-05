const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const AGENT = 'IceMineLauncher/1.0 (+https://icemine.hu)';

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.json();
}

async function sha1(file) {
  const hash = crypto.createHash('sha1');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function download(url, target, { sha1: expected, onProgress } = {}) {
  if (expected && fs.existsSync(target) && (await sha1(target)) === expected) {
    return target;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const response = await fetch(url, { headers: { 'User-Agent': AGENT }, redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  const total = Number(response.headers.get('content-length')) || 0;
  let done = 0;
  const temp = `${target}.letoltes`;
  const source = Readable.fromWeb(response.body);
  source.on('data', (chunk) => {
    done += chunk.length;
    if (onProgress && total) {
      onProgress(done / total);
    }
  });
  await pipeline(source, fs.createWriteStream(temp));
  if (expected && (await sha1(temp)) !== expected) {
    fs.rmSync(temp, { force: true });
    throw new Error(`Hibás letöltés (ellenőrzőösszeg): ${path.basename(target)}`);
  }
  fs.renameSync(temp, target);
  return target;
}

module.exports = { getJson, download, sha1, AGENT };
