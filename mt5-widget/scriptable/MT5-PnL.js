// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: chart-line;

// =====================================================================
//  MT5 P&L — widget d'écran de verrouillage / d'accueil pour Scriptable
// =====================================================================
//  Tailles prises en charge :
//   - Écran de verrouillage : rectangulaire, circulaire, en ligne
//   - Écran d'accueil       : petit, moyen, grand
//
//  Myfxbook (par défaut) : lancez le script une fois dans l'app
//  Scriptable, il vous demande vos identifiants Myfxbook et le compte
//  à suivre, puis les range dans le trousseau iOS. Rien à modifier ici.
//
//  Paramètre du widget (facultatif) :
//   - Myfxbook : nom ou numéro du compte à afficher
//   - Upstash  : nom de la clé Redis (ex. "mt5pnl_demo")
// =====================================================================

// ------------------------------ CONFIG -------------------------------
const CONFIG = {
  // "auto"     : MT5 direct (Upstash) si configuré dans l'app, sinon Myfxbook
  // "myfxbook" : gratuit, 100 % iPhone, mais Myfxbook se met à jour lentement
  // "upstash"  : l'EA PnLPusher.mq5 envoie les données (MT5 sur PC/VPS)
  // "metaapi"  : lecture via MetaApi.cloud
  backend: "auto",

  upstash: {
    url: "https://VOTRE-BASE.upstash.io",
    // Utilisez le token "Read-Only" d'Upstash : le téléphone n'a besoin que de lire.
    token: "VOTRE_TOKEN_READ_ONLY",
    key: "mt5pnl",
  },

  metaapi: {
    token: "VOTRE_TOKEN_METAAPI",
    accountId: "VOTRE_ACCOUNT_ID",
    region: "new-york", // voir la région de votre compte dans MetaApi
  },

  // au-delà (minutes), les données sont signalées comme anciennes (⚠︎)
  staleAfterMin: { myfxbook: 30, upstash: 5, metaapi: 5 },
  refreshAfterSec: 60, // demande à iOS de rafraîchir (iOS décide au final)
};
// ---------------------------------------------------------------------

const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CHF: "CHF" };
const CACHE_FILE = "mt5-pnl-cache.json";
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), CACHE_FILE);

// ----------------------------- DONNÉES -------------------------------

// Réglages Upstash : trousseau iOS (assistant) en priorité, sinon CONFIG
const KC_UP = { url: "mt5pnl.upstash.url", token: "mt5pnl.upstash.token" };
function upCfg() {
  const has = (k) => Keychain.contains(k);
  return {
    url: has(KC_UP.url) ? Keychain.get(KC_UP.url) : CONFIG.upstash.url,
    token: has(KC_UP.token) ? Keychain.get(KC_UP.token) : CONFIG.upstash.token,
  };
}

function activeBackend() {
  if (CONFIG.backend !== "auto") return CONFIG.backend;
  return Keychain.contains(KC_UP.url) ? "upstash" : "myfxbook";
}

async function fetchUpstashWith(url, token, key) {
  const req = new Request(`${url}/get/${encodeURIComponent(key)}`);
  req.headers = { Authorization: `Bearer ${token}` };
  req.timeoutInterval = 10;
  const res = await req.loadJSON();
  if (res.error) throw new Error(res.error);
  if (!res.result) throw new Error("aucune donnée reçue de MT5 : l'EA tourne-t-il ?");
  return JSON.parse(res.result);
}

async function fetchUpstash(key) {
  const { url, token } = upCfg();
  return fetchUpstashWith(url, token, key);
}

// Assistant : connexion directe à MT5 via Upstash
async function setupUpstash() {
  const a = new Alert();
  a.title = "MT5 direct (Upstash)";
  a.message =
    "Collez l'URL REST et le token « Read-Only » de votre base Upstash " +
    "(console.upstash.com › votre base › REST API).";
  a.addTextField("https://xxx.upstash.io", Keychain.contains(KC_UP.url) ? Keychain.get(KC_UP.url) : "");
  a.addSecureTextField("Token Read-Only", "");
  a.addAction("Connecter");
  a.addCancelAction("Annuler");
  if ((await a.presentAlert()) === -1) return false;

  let url = a.textFieldValue(0).trim().replace(/\/+$/, "");
  if (url && !/^https?:\/\//.test(url)) url = "https://" + url;
  const token = a.textFieldValue(1).trim();

  const info = new Alert();
  info.addAction("OK");
  try {
    const d = await fetchUpstashWith(url, token, CONFIG.upstash.key);
    Keychain.set(KC_UP.url, url);
    Keychain.set(KC_UP.token, token);
    const age = Math.round(Date.now() / 1000 - d.ts);
    info.title = "Connecté ✓";
    info.message =
      `Compte ${d.login} · ${d.count} position(s)\n` +
      `Équité ${d.equity} ${d.currency}\n` +
      `Dernier envoi de MT5 : il y a ${age} s`;
    await info.presentAlert();
    return true;
  } catch (e) {
    info.title = "Connexion impossible";
    info.message =
      e.message +
      "\n\nVérifiez l'URL et le token. Si le message parle de données absentes, " +
      "l'EA n'a encore rien envoyé : regardez l'onglet Experts de MT5.";
    await info.presentAlert();
    return false;
  }
}

async function fetchMetaApi() {
  const { token, accountId, region } = CONFIG.metaapi;
  const base = `https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${accountId}`;
  const get = async (path) => {
    const req = new Request(base + path);
    req.headers = { "auth-token": token, Accept: "application/json" };
    req.timeoutInterval = 15;
    const json = await req.loadJSON();
    if (req.response.statusCode >= 400) {
      throw new Error(json.message || `MetaApi HTTP ${req.response.statusCode}`);
    }
    return json;
  };
  const [info, positions] = await Promise.all([
    get("/account-information"),
    get("/positions"),
  ]);
  return {
    ts: Math.floor(Date.now() / 1000),
    login: info.login,
    currency: info.currency,
    balance: info.balance,
    equity: info.equity,
    floating: info.equity - info.balance,
    today: null, // non calculé avec MetaApi
    margin: info.margin,
    count: positions.length,
    positions: positions.map((p) => ({
      sym: p.symbol,
      side: String(p.type).includes("BUY") ? "buy" : "sell",
      vol: p.volume,
      open: p.openPrice,
      cur: p.currentPrice,
      pnl: (p.profit || 0) + (p.swap || 0),
    })),
  };
}

// ----------------------------- MYFXBOOK ------------------------------

const KC = {
  email: "mt5pnl.myfxbook.email",
  password: "mt5pnl.myfxbook.password",
  session: "mt5pnl.myfxbook.session",
  account: "mt5pnl.myfxbook.account",
};
const kcGet = (k) => (Keychain.contains(k) ? Keychain.get(k) : null);

async function mfxCall(method, params) {
  const qs = Object.entries(params)
    .map(([k, v]) => {
      // la session renvoyée par Myfxbook peut déjà être encodée
      const val = k === "session" && String(v).includes("%") ? v : encodeURIComponent(v);
      return `${k}=${val}`;
    })
    .join("&");
  const req = new Request(`https://www.myfxbook.com/api/${method}.json?${qs}`);
  req.timeoutInterval = 15;
  const json = await req.loadJSON();
  if (json.error) throw new Error(json.message || `Myfxbook : erreur ${method}`);
  return json;
}

async function mfxLogin(email, password) {
  const res = await mfxCall("login", { email, password });
  Keychain.set(KC.session, res.session);
  return res.session;
}

// Appelle l'API avec la session en cache, se reconnecte une fois si elle a expiré
async function mfxAuthed(method, params = {}) {
  let session = kcGet(KC.session);
  if (session) {
    try {
      return await mfxCall(method, { session, ...params });
    } catch (e) {
      if (!/session/i.test(e.message)) throw e;
    }
  }
  const email = kcGet(KC.email);
  const password = kcGet(KC.password);
  if (!email || !password) throw new Error("ouvrez le script dans Scriptable pour le configurer");
  session = await mfxLogin(email, password);
  return mfxCall(method, { session, ...params });
}

// Myfxbook renvoie "MM/dd/yyyy HH:mm", a priori en GMT (sans fuseau indiqué).
// On essaie GMT ; si ça tombe dans le futur, on essaie l'heure locale.
function parseMfxDate(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(str || "");
  const now = Date.now();
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[3], +m[1] - 1, +m[2], +m[4], +m[5]];
  const utc = Date.UTC(y, mo, d, h, mi);
  if (utc <= now + 5 * 60 * 1000) return utc;
  const local = new Date(y, mo, d, h, mi).getTime();
  if (local <= now + 5 * 60 * 1000) return local;
  return null;
}

// Mémorise le moment où le widget a vu les chiffres changer pour la dernière fois.
// Sert de filet de sécurité si la date Myfxbook est dans un fuseau inattendu.
const seenPath = fm.joinPath(fm.cacheDirectory(), "mt5-pnl-seen.json");
function lastChangeTime(fingerprint) {
  let seen = null;
  try {
    if (fm.fileExists(seenPath)) seen = JSON.parse(fm.readString(seenPath));
  } catch (e) {}
  if (seen && seen.fp === fingerprint) return seen.t;
  const t = Date.now();
  fm.writeString(seenPath, JSON.stringify({ fp: fingerprint, t }));
  return seen ? t : null; // premier lancement : pas d'info
}

function pickAccount(accounts, wanted) {
  if (wanted) {
    const w = wanted.toLowerCase();
    const hit = accounts.find(
      (a) => String(a.accountId) === wanted || String(a.id) === wanted || (a.name || "").toLowerCase() === w
    );
    if (hit) return hit;
  }
  const saved = kcGet(KC.account);
  return accounts.find((a) => String(a.id) === saved) || accounts[0];
}

async function fetchMyfxbook(wanted) {
  const { accounts } = await mfxAuthed("get-my-accounts");
  if (!accounts || accounts.length === 0) throw new Error("aucun compte sur Myfxbook");
  const acc = pickAccount(accounts, wanted);
  const { openTrades = [] } = await mfxAuthed("get-open-trades", { id: acc.id });
  const positions = openTrades.map((t) => ({
    sym: t.symbol,
    side: /buy/i.test(t.action) ? "buy" : "sell",
    vol: t.sizing ? Number(t.sizing.value) : 0,
    open: Number(t.openPrice),
    sl: Number(t.sl),
    tp: Number(t.tp),
    pnl: Number(t.profit || 0) + Number(t.swap || 0),
  }));
  const fingerprint = [acc.id, acc.equity, acc.balance, ...positions.map((p) => p.pnl)].join("|");
  const fromSource = parseMfxDate(acc.lastUpdateDate);
  const fromChange = lastChangeTime(fingerprint);
  const best = Math.max(fromSource || 0, fromChange || 0) || Date.now();
  return {
    ts: Math.floor(best / 1000),
    sourceDate: acc.lastUpdateDate,
    login: acc.accountId,
    name: acc.name,
    currency: acc.currency,
    balance: Number(acc.balance),
    equity: Number(acc.equity),
    floating: Number(acc.equity) - Number(acc.balance),
    today: null,
    count: positions.length,
    positions,
  };
}

// Assistant de configuration (lancé depuis l'app Scriptable)
async function setupMyfxbook() {
  const a = new Alert();
  a.title = "Connexion Myfxbook";
  a.message =
    "Identifiants de votre compte Myfxbook (pas ceux de MT5). " +
    "Ils restent dans le trousseau de cet iPhone et ne sont envoyés qu'à myfxbook.com.";
  a.addTextField("E-mail", kcGet(KC.email) || "");
  a.addSecureTextField("Mot de passe", "");
  a.addAction("Se connecter");
  a.addCancelAction("Annuler");
  if ((await a.presentAlert()) === -1) return false;
  const email = a.textFieldValue(0).trim();
  const password = a.textFieldValue(1);

  try {
    await mfxLogin(email, password);
  } catch (e) {
    const err = new Alert();
    err.title = "Connexion refusée";
    err.message = e.message;
    err.addAction("OK");
    await err.presentAlert();
    return false;
  }
  Keychain.set(KC.email, email);
  Keychain.set(KC.password, password);

  const { accounts } = await mfxAuthed("get-my-accounts");
  if (!accounts || accounts.length === 0) {
    const none = new Alert();
    none.title = "Aucun compte";
    none.message = "Ajoutez d'abord votre compte MT5 sur myfxbook.com (Portfolio › Ajouter un compte).";
    none.addAction("OK");
    await none.presentAlert();
    return false;
  }
  let chosen = accounts[0];
  if (accounts.length > 1) {
    const pick = new Alert();
    pick.title = "Quel compte suivre ?";
    accounts.forEach((acc) => pick.addAction(`${acc.name} (${acc.accountId})`));
    chosen = accounts[await pick.presentSheet()] || chosen;
  }
  Keychain.set(KC.account, String(chosen.id));
  return true;
}

async function diagnostic() {
  const a = new Alert();
  a.title = "Diagnostic " + (activeBackend() === "upstash" ? "MT5 direct" : "Myfxbook");
  const fmtT = (t) => (t ? new Date(t).toLocaleString("fr-FR") : "?");
  const st = readStatus();
  const common =
    `Heure de l'iPhone : ${fmtT(Date.now())}\n` +
    `Dernière actualisation du widget : ${fmtT(st.lastOk)}\n` +
    `Exécutions comptées : ${st.runs || 0}\n` +
    `Dernière erreur : ${st.lastError || "aucune"}`;
  if (activeBackend() === "upstash") {
    try {
      const d = await fetchUpstash(CONFIG.upstash.key);
      a.message =
        `Compte : ${d.login}\nDernier envoi de MT5 : ${fmtT(d.ts * 1000)}\n` +
        `Positions : ${d.count} · Équité : ${d.equity} ${d.currency}\n` + common;
    } catch (e) {
      a.message = "Erreur : " + e.message + "\n" + common;
    }
    a.addAction("Copier");
    a.addCancelAction("OK");
    if ((await a.presentAlert()) === 0) Pasteboard.copy(a.message);
    return;
  }
  try {
    const { accounts } = await mfxAuthed("get-my-accounts");
    const acc = pickAccount(accounts, (args.widgetParameter || "").trim());
    const src = parseMfxDate(acc.lastUpdateDate);
    a.message =
      `Compte : ${acc.name} (${acc.accountId})\n` +
      `Date Myfxbook brute : ${acc.lastUpdateDate}\n` +
      `Interprétée : ${fmtT(src)}\n` +
      `Heure de l'iPhone : ${fmtT(Date.now())}\n` +
      `Dernière actualisation du widget : ${fmtT(readStatus().lastOk)}\n` +
      `Exécutions comptées : ${readStatus().runs || 0}\n` +
      `Dernière erreur : ${readStatus().lastError || "aucune"}\n` +
      `Équité : ${acc.equity} ${acc.currency}`;
  } catch (e) {
    a.message = "Erreur : " + e.message;
  }
  a.addAction("Copier");
  a.addCancelAction("OK");
  if ((await a.presentAlert()) === 0) Pasteboard.copy(a.message);
}

async function appMenu() {
  if (CONFIG.backend === "metaapi") return true;
  if (CONFIG.backend === "upstash" && !Keychain.contains(KC_UP.url) && /VOTRE-BASE/.test(CONFIG.upstash.url)) {
    return setupUpstash();
  }
  const b = activeBackend();
  if (b === "myfxbook" && !kcGet(KC.email)) {
    const first = new Alert();
    first.title = "D'où viennent les chiffres ?";
    first.addAction("MT5 direct (EA + Upstash) · rapide");
    first.addAction("Myfxbook · lent");
    first.addCancelAction("Annuler");
    const c = await first.presentSheet();
    if (c === 0) return setupUpstash();
    if (c === 1) return setupMyfxbook();
    return false;
  }

  const m = new Alert();
  m.title = "MT5 P&L";
  m.message = b === "upstash" ? "Source : MT5 direct (Upstash)" : "Source : Myfxbook";
  const actions = [["Aperçu du widget", async () => true]];
  if (b === "upstash") {
    actions.push(["Modifier la connexion Upstash", setupUpstash]);
    actions.push(["Revenir à Myfxbook", async () => {
      Keychain.remove(KC_UP.url);
      Keychain.remove(KC_UP.token);
      return kcGet(KC.email) ? true : setupMyfxbook();
    }]);
  } else {
    actions.push(["Passer en MT5 direct (Upstash)", setupUpstash]);
    actions.push(["Changer d'identifiants / de compte", setupMyfxbook]);
  }
  actions.push(["Diagnostic", async () => { await diagnostic(); return false; }]);
  actions.forEach(([label]) => m.addAction(label));
  m.addDestructiveAction("Tout effacer (déconnexion)");
  m.addCancelAction("Fermer");
  const r = await m.presentSheet();
  if (r === -1) return false;
  if (r < actions.length) return actions[r][1]();
  Object.values(KC).concat(Object.values(KC_UP)).forEach((k) => Keychain.contains(k) && Keychain.remove(k));
  if (fm.fileExists(cachePath)) fm.remove(cachePath);
  return false;
}

// ---------------------------------------------------------------------

// Journal des exécutions (pour le diagnostic)
const statusPath = fm.joinPath(fm.cacheDirectory(), "mt5-pnl-status.json");
function readStatus() {
  try {
    return fm.fileExists(statusPath) ? JSON.parse(fm.readString(statusPath)) : {};
  } catch (e) {
    return {};
  }
}
function writeStatus(st) {
  try {
    fm.writeString(statusPath, JSON.stringify({ ...st, runs: (readStatus().runs || 0) + 1 }));
  } catch (e) {}
}

async function loadData(key) {
  try {
    const backend = activeBackend();
    const data =
      backend === "myfxbook"
        ? await fetchMyfxbook((args.widgetParameter || "").trim())
        : backend === "metaapi"
        ? await fetchMetaApi()
        : await fetchUpstash(key);
    data.fetchedAt = Date.now();
    fm.writeString(cachePath, JSON.stringify(data));
    writeStatus({ lastRun: Date.now(), lastOk: Date.now(), lastError: null });
    return { data, error: null };
  } catch (e) {
    writeStatus({ ...readStatus(), lastRun: Date.now(), lastError: e.message });
    // Hors ligne ou erreur : on affiche la dernière valeur connue
    if (fm.fileExists(cachePath)) {
      return { data: JSON.parse(fm.readString(cachePath)), error: e.message };
    }
    return { data: null, error: e.message };
  }
}

// ---------------------------- FORMATAGE ------------------------------

function fmt(n, { sign = true, decimals = 2 } = {}) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const abs = Math.abs(n).toFixed(decimals);
  const [int, dec] = abs.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  return (sign ? s : n < 0 ? "−" : "") + grouped + (dec ? "," + dec : "");
}

function compact(n) {
  const abs = Math.abs(n);
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  if (abs >= 1e6) return s + (abs / 1e6).toFixed(1).replace(".", ",") + "M";
  if (abs >= 1e4) return s + Math.round(abs / 1e3) + "k";
  if (abs >= 1e3) return s + (abs / 1e3).toFixed(1).replace(".", ",") + "k";
  return s + Math.round(abs);
}

const cur = (d) => CURRENCY_SYMBOLS[d.currency] || d.currency || "";
const pnlColor = (n) =>
  n > 0 ? new Color("#30D158") : n < 0 ? new Color("#FF453A") : Color.gray();
const arrow = (n) => (n > 0 ? "▲" : n < 0 ? "▼" : "■");
const isStale = (d) => Date.now() / 1000 - d.ts > (CONFIG.staleAfterMin[activeBackend()] || 5) * 60;

const pad = (n) => String(n).padStart(2, "0");
const hm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// Heure des chiffres (source) et heure de la dernière actualisation du widget
const dataTime = (d) => hm(d.ts * 1000);
const runTime = (d) => (d.fetchedAt ? hm(d.fetchedAt) : "?");

// ----------------------------- WIDGETS -------------------------------

function errorWidget(msg) {
  const w = new ListWidget();
  const t = w.addText("MT5 · " + msg);
  t.font = Font.systemFont(11);
  t.minimumScaleFactor = 0.6;
  return w;
}

// Écran de verrouillage — en ligne (au-dessus de l'heure)
function inlineWidget(d) {
  const w = new ListWidget();
  const t = w.addText(`${arrow(d.floating)} ${fmt(d.floating)} ${cur(d)} · ${d.count} pos`);
  t.font = Font.semiboldSystemFont(12);
  return w;
}

// Écran de verrouillage — circulaire
function circularWidget(d) {
  const w = new ListWidget();
  w.addAccessoryWidgetBackground = true;
  const s = w.addStack();
  s.layoutVertically();
  s.centerAlignContent();

  const l = s.addText("P&L");
  l.font = Font.semiboldSystemFont(9);
  l.textOpacity = 0.7;
  l.centerAlignText();

  const v = s.addText(compact(d.floating));
  v.font = Font.boldRoundedSystemFont(15);
  v.minimumScaleFactor = 0.5;
  v.lineLimit = 1;
  v.centerAlignText();

  const c = s.addText(`${d.count} pos`);
  c.font = Font.systemFont(8);
  c.textOpacity = 0.7;
  c.centerAlignText();
  return w;
}

// Écran de verrouillage — rectangulaire (le plus utile)
function rectangularWidget(d, error) {
  const w = new ListWidget();

  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText(`MT5 · ${d.count} pos · chiffres de ${dataTime(d)}`);
  title.font = Font.semiboldSystemFont(11);
  title.textOpacity = 0.7;
  title.lineLimit = 1;
  title.minimumScaleFactor = 0.8;
  if (error || isStale(d)) {
    const warn = head.addText(" ⚠︎");
    warn.font = Font.systemFont(11);
  }

  const v = w.addText(`${arrow(d.floating)} ${fmt(d.floating)} ${cur(d)}`);
  v.font = Font.boldRoundedSystemFont(20);
  v.minimumScaleFactor = 0.6;
  v.lineLimit = 1;

  const parts = [];
  if (d.today !== null && d.today !== undefined) parts.push(`Jour ${fmt(d.today)}`);
  parts.push(`Éq ${fmt(d.equity, { sign: false, decimals: 0 })}`);
  parts.push(`↻ ${runTime(d)}`);
  const sub = w.addText(parts.join(" · "));
  sub.font = Font.systemFont(11);
  sub.minimumScaleFactor = 0.7;
  sub.lineLimit = 1;
  return w;
}

// Écran d'accueil — petit / moyen / grand
function homeWidget(d, error, family) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#111214");
  w.setPadding(14, 14, 14, 14);

  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText("MT5 P&L");
  title.font = Font.semiboldSystemFont(12);
  title.textColor = Color.white();
  title.textOpacity = 0.7;
  head.addSpacer();
  const age = head.addText(`${dataTime(d)} · ↻ ${runTime(d)}`);
  age.font = Font.systemFont(10);
  age.textOpacity = 0.7;
  age.textColor = error || isStale(d) ? new Color("#FFD60A") : Color.white();

  w.addSpacer(6);
  const v = w.addText(`${fmt(d.floating)} ${cur(d)}`);
  v.font = Font.boldRoundedSystemFont(family === "small" ? 22 : 26);
  v.textColor = pnlColor(d.floating);
  v.minimumScaleFactor = 0.5;
  v.lineLimit = 1;

  const sub = w.addText(
    (d.today !== null && d.today !== undefined ? `Jour ${fmt(d.today)} · ` : "") +
      `Éq ${fmt(d.equity, { sign: false, decimals: 0 })}`
  );
  sub.font = Font.systemFont(11);
  sub.textColor = Color.white();
  sub.textOpacity = 0.7;
  sub.lineLimit = 1;
  sub.minimumScaleFactor = 0.7;

  const max = family === "small" ? 2 : family === "medium" ? 3 : 10;
  const list = [...(d.positions || [])].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  w.addSpacer(8);
  if (list.length === 0) {
    const t = w.addText("Aucune position ouverte");
    t.font = Font.systemFont(11);
    t.textColor = Color.gray();
  }
  for (const p of list.slice(0, max)) {
    const row = w.addStack();
    row.centerAlignContent();
    const name = row.addText(`${p.side === "buy" ? "↑" : "↓"} ${p.sym} ${p.vol}`);
    name.font = Font.mediumSystemFont(11);
    name.textColor = Color.white();
    name.lineLimit = 1;
    row.addSpacer();
    const pv = row.addText(fmt(p.pnl));
    pv.font = Font.semiboldMonospacedSystemFont(11);
    pv.textColor = pnlColor(p.pnl);
    w.addSpacer(2);
  }
  if (list.length > max) {
    const more = w.addText(`+${list.length - max} autre(s)`);
    more.font = Font.systemFont(10);
    more.textColor = Color.gray();
  }
  w.addSpacer();
  return w;
}

// ------------------------------- MAIN --------------------------------

async function main() {
  const key = (args.widgetParameter || "").trim() || CONFIG.upstash.key;
  if (!config.runsInWidget && !(await appMenu())) return;

  const family = config.widgetFamily || "accessoryRectangular";
  const { data, error } = await loadData(key);

  let widget;
  if (!data) {
    widget = errorWidget(error || "aucune donnée");
  } else if (family === "accessoryInline") {
    widget = inlineWidget(data);
  } else if (family === "accessoryCircular") {
    widget = circularWidget(data);
  } else if (family === "accessoryRectangular") {
    widget = rectangularWidget(data, error);
  } else {
    widget = homeWidget(data, error, family);
  }

  widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshAfterSec * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    // Lancé depuis l'app Scriptable : aperçu
    if (error) console.warn(error);
    if (data && typeof widget.presentAccessoryRectangular === "function") {
      await widget.presentAccessoryRectangular();
    } else {
      await widget.presentMedium();
    }
  }
}

await main();
Script.complete();
