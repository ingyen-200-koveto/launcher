# IceMine Launcher

Az IceMine szerver saját launchere (Windows). Microsoft-fiókkal lehet belépni (csak akkor, ha a fiókon megvan a
Minecraft), utána egy gombnyomásra:

- letölti a Javát (Eclipse Temurin 21), a Minecraft 1.20.6-ot és a Fabricot,
- felrakja a gyorsító modokat a Modrinthről (Sodium, Lithium, FerriteCore, ImmediatelyFast, EntityCulling, Mod Menu,
  Fabric API), és frissen tartja őket,
- elindítja a játékot, és egyből csatlakozik a play.icemine.hu szerverre.

A játék a `%APPDATA%\.icemine\game` mappába kerül, a sima Minecrafttól külön. A launcher magát is frissíti
(GitHub Releases).

## 1. Microsoft (Azure) alkalmazás – egyszer kell megcsinálni

A Microsoft-belépéshez a launchernek kell egy saját alkalmazás azonosító (Client ID).

1. Lépj be a https://portal.azure.com oldalra a Microsoft-fiókoddal.
2. Keresd meg: **App registrations** → **New registration**.
   - Name: `IceMine Launcher`
   - Supported account types: **Personal Microsoft accounts only**
   - Redirect URI: platform **Public client/native (mobile & desktop)**, cím:
     `https://login.microsoftonline.com/common/oauth2/nativeclient`
3. A létrehozott alkalmazásnál: **Authentication** → **Allow public client flows: Yes** → Save.
4. Másold ki az **Application (client) ID**-t, és írd be a `config.json` fájlba a `clientId` helyére.
5. **Kérj engedélyt a Mojangtól**, hogy az alkalmazás használhassa a Minecraft belépést:
   https://aka.ms/mce-reviewappid (az űrlapon add meg a Client ID-t). Amíg nem hagyják jóvá, a belépésnél
   "A Minecraft bejelentkezés nem sikerült" hibát ír ki. A jóváhagyás napokig vagy hetekig is tarthat.

## 2. Telepítő készítése (nem kell hozzá semmit telepítened)

A GitHub magától elkészíti a Windows telepítőt (`IceMine Launcher Setup x.y.z.exe`):

- Minden feltöltés után a GitHub magától lefordítja, és feltölti a **Releases** közé.
- **Új verzió:** írd át a `package.json`-ban a `version` értékét (pl. `1.0.1`). A játékosok launchere ebből tudja,
  hogy frissítenie kell.
- **Letöltés:** https://github.com/ingyen-200-koveto/launcher/releases/latest

Saját gépen (Windows, Node.js 20): `npm install`, majd `npm start` (kipróbálás) vagy `npm run dist` (telepítő a
`dist` mappába).

## Beállítások (config.json)

| kulcs | mire jó |
|---|---|
| `microsoft.clientId` | az Azure alkalmazás azonosítója |
| `server` | erre a szerverre csatlakozik indításkor |
| `minecraft` | a Minecraft verzió (a modok is ehhez töltődnek) |
| `fabricLoader` | `latest` = a legújabb stabil Fabric |
| `mods` | Modrinth azonosítók; a kötelező függőségeiket magától hozzáteszi |
| `news` | ha a weboldal ad hír listát (`[{"title": "...", "text": "..."}]`), itt jelenik meg |

A játékos saját modjaihoz (amit ő rak a `mods` mappába) a launcher nem nyúl, csak azokat cseréli, amiket ő rakott fel.
