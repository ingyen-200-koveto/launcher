const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const { Auth } = require('msmc');

const MESSAGES = {
  'error.gui.closed': 'Bezártad a bejelentkezési ablakot.',
  'error.auth.microsoft': 'A Microsoft bejelentkezés nem sikerült.',
  'error.auth.xboxLive': 'Az Xbox Live bejelentkezés nem sikerült.',
  'error.auth.xsts.userNotFound': 'Ehhez a Microsoft-fiókhoz nincs Xbox fiók. Lépj be egyszer a minecraft.net oldalon.',
  'error.auth.xsts.bannedCountry': 'A fiókod országában az Xbox Live nem érhető el.',
  'error.auth.xsts.child': 'Gyerekfiók: egy szülőnek hozzá kell adnia egy családhoz.',
  'error.auth.xsts.child.SK': 'Gyerekfiók: egy szülőnek hozzá kell adnia egy családhoz.',
  'error.auth.minecraft.login': 'A Minecraft bejelentkezés nem sikerült (lehet, hogy az alkalmazás még nincs jóváhagyva a Mojangnál).',
  'error.auth.minecraft.profile': 'Ezen a fiókon még nincs Minecraft profil (játékosnév).',
  'error.auth.minecraft.entitlements': 'Ezen a Microsoft-fiókon nincs megvásárolt Minecraft.',
  'error.state.invalid': 'Lejárt a bejelentkezés, lépj be újra.',
};

class Account {
  constructor(dataDir, settings) {
    this.file = path.join(dataDir, 'fiok.dat');
    this.settings = settings;
    this.minecraft = null;
  }

  auth() {
    const { clientId, redirect } = this.settings.microsoft || {};
    if (!clientId) {
      throw new Error('A launcherben még nincs beállítva a Microsoft (Azure) alkalmazás azonosító. Írd be a config.json fájlba.');
    }
    return new Auth({ client_id: clientId, redirect, prompt: 'select_account' });
  }

  static message(error) {
    const code = typeof error === 'string' ? error : error && (error.message || error.toString());
    return MESSAGES[code] || code || 'Ismeretlen hiba a bejelentkezésnél.';
  }

  save(refreshToken) {
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(refreshToken) : Buffer.from(refreshToken, 'utf8');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, data);
  }

  load() {
    if (!fs.existsSync(this.file)) {
      return null;
    }
    const data = fs.readFileSync(this.file);
    try {
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8');
    } catch (error) {
      return null;
    }
  }

  async finish(xbox) {
    const minecraft = await xbox.getMinecraft();
    if (minecraft.isDemo() || !minecraft.profile) {
      throw new Error('error.auth.minecraft.entitlements');
    }
    this.minecraft = minecraft;
    this.save(xbox.save());
    return this.profile();
  }

  profile() {
    if (!this.minecraft || !this.minecraft.profile) {
      return null;
    }
    return { name: this.minecraft.profile.name, id: this.minecraft.profile.id };
  }

  /** Bejelentkezés: a Microsoft ablak megnyílik, a játékos belép, és ellenőrizzük, hogy megvan-e neki a Minecraft. */
  async login() {
    const xbox = await this.auth().launch('electron', { width: 520, height: 680, title: 'Bejelentkezés - IceMine Launcher', autoHideMenuBar: true });
    return this.finish(xbox);
  }

  /** Induláskor: a mentett belépéssel újra be tudunk lépni ablak nélkül. */
  async restore() {
    const token = this.load();
    if (!token) {
      return null;
    }
    const xbox = await this.auth().refresh(token);
    return this.finish(xbox);
  }

  /** Az MCLC indításhoz kell; ha lejárt, frissítjük. */
  async user() {
    if (!this.minecraft) {
      await this.restore();
    }
    if (!this.minecraft) {
      throw new Error('Előbb jelentkezz be.');
    }
    if (!this.minecraft.validate()) {
      await this.minecraft.refresh(true);
    }
    return this.minecraft.mclc();
  }

  logout() {
    this.minecraft = null;
    fs.rmSync(this.file, { force: true });
  }
}

module.exports = { Account };
