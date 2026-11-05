const api = window.launcher;
const $ = (id) => document.getElementById(id);
const logLines = [];
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
$('avatar').addEventListener('error', () => {
  $('avatar').src = BLANK;
});

let info = null;
let settings = null;

function show(id, visible) {
  $(id).classList.toggle('hidden', !visible);
}

function setError(text) {
  $('error').textContent = text || '';
  show('error', Boolean(text));
}

function setProfile(profile) {
  if (profile) {
    $('account-name').textContent = profile.name;
    $('avatar').src = `https://mc-heads.net/avatar/${profile.id}/96`;
  } else {
    $('account-name').textContent = 'Nem vagy bejelentkezve';
    $('avatar').src = BLANK;
  }
  show('login', !profile);
  show('play', Boolean(profile));
  show('logout', Boolean(profile));
}

function setBusy(busy) {
  $('play').disabled = busy;
  $('login').disabled = busy;
  show('progress', busy);
}

function log(line) {
  logLines.push(line);
  if (logLines.length > 400) {
    logLines.shift();
  }
  $('log').textContent = logLines.join('\n');
}

async function loadServer() {
  try {
    const response = await fetch(`https://api.mcsrvstat.us/3/${info.server}`);
    const data = await response.json();
    if (data.online) {
      $('server-dot').className = 'dot online';
      const players = data.players ? `${data.players.online} játékos online` : 'Online';
      $('server-status').textContent = players;
    } else {
      $('server-dot').className = 'dot offline';
      $('server-status').textContent = 'A szerver most nem elérhető';
    }
  } catch (error) {
    $('server-status').textContent = 'Nem sikerült lekérni az állapotot';
  }
}

async function loadNews() {
  if (!info.news) {
    return;
  }
  try {
    const response = await fetch(info.news);
    if (!response.ok) {
      return;
    }
    const items = await response.json();
    if (!Array.isArray(items) || !items.length) {
      return;
    }
    const list = $('news-list');
    list.textContent = '';
    for (const item of items.slice(0, 8)) {
      const article = document.createElement('article');
      const title = document.createElement('h3');
      title.textContent = item.title || '';
      const body = document.createElement('p');
      body.textContent = item.text || item.body || '';
      article.append(title, body);
      list.append(article);
    }
  } catch (error) {
    // ha nincs hír API, marad az alap szöveg
  }
}

async function init() {
  info = await api.info();
  settings = await api.settings();
  $('server-name').textContent = info.server;
  $('version').textContent = `IceMine Launcher ${info.version} · Minecraft ${info.minecraft} (Fabric)`;
  show('not-configured', !info.configured);
  $('memory').max = Math.max(2, Math.min(16, info.totalMemory - 1));
  $('memory').value = settings.memory;
  $('memory-value').textContent = `${settings.memory} GB`;
  $('close-on-start').checked = settings.closeOnStart;
  $('fullscreen').checked = settings.fullscreen;
  loadServer();
  loadNews();
  setInterval(loadServer, 60000);
  if (info.configured) {
    $('account-name').textContent = 'Bejelentkezés...';
    const result = await api.restore();
    setProfile(result.profile);
  } else {
    setProfile(null);
  }
}

$('minimize').addEventListener('click', () => api.minimize());
$('close').addEventListener('click', () => api.close());
$('folder').addEventListener('click', () => api.openFolder());
$('website').addEventListener('click', () => api.openUrl(info.website));
$('discord').addEventListener('click', () => api.openUrl(info.discord));

$('login').addEventListener('click', async () => {
  setError('');
  $('login').disabled = true;
  const result = await api.login();
  $('login').disabled = false;
  if (result.error) {
    setError(result.error);
  }
  setProfile(result.profile);
});

$('logout').addEventListener('click', async () => {
  await api.logout();
  setProfile(null);
});

$('play').addEventListener('click', async () => {
  setError('');
  setBusy(true);
  const result = await api.launch();
  if (!result.ok) {
    setBusy(false);
    setError(result.error);
  }
});

$('settings-open').addEventListener('click', () => show('settings', true));
$('settings-close').addEventListener('click', async () => {
  settings = await api.saveSettings({
    memory: Number($('memory').value),
    closeOnStart: $('close-on-start').checked,
    fullscreen: $('fullscreen').checked,
  });
  show('settings', false);
});
$('memory').addEventListener('input', () => {
  $('memory-value').textContent = `${$('memory').value} GB`;
});

$('update-install').addEventListener('click', () => api.installUpdate());

api.on('status', ({ text, progress }) => {
  show('progress', true);
  $('progress-text').textContent = text;
  const fill = $('progress-fill');
  if (progress === null || progress === undefined) {
    fill.classList.add('indeterminate');
    fill.style.width = '';
  } else {
    fill.classList.remove('indeterminate');
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  }
});
api.on('log', log);
api.on('game:started', () => {
  $('progress-text').textContent = 'A játék elindult. Jó játékot!';
});
api.on('game:closed', () => {
  setBusy(false);
});
api.on('update', () => show('update', true));

init();
