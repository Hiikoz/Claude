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
//  Paramètre du widget (facultatif) : nom de la clé Redis à lire
//  (utile si vous suivez plusieurs comptes, ex. "mt5pnl_demo").
// =====================================================================

// ------------------------------ CONFIG -------------------------------
const CONFIG = {
  // "upstash" : l'EA PnLPusher.mq5 envoie les données (MT5 sur PC/VPS)
  // "metaapi" : lecture via MetaApi.cloud (MT5 uniquement sur mobile)
  backend: "upstash",

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

  staleAfterMin: 5,    // au-delà, les données sont signalées comme anciennes
  refreshAfterSec: 60, // demande à iOS de rafraîchir (iOS décide au final)
};
// ---------------------------------------------------------------------

const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CHF: "CHF" };
const CACHE_FILE = "mt5-pnl-cache.json";
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), CACHE_FILE);

// ----------------------------- DONNÉES -------------------------------

async function fetchUpstash(key) {
  const req = new Request(`${CONFIG.upstash.url}/get/${encodeURIComponent(key)}`);
  req.headers = { Authorization: `Bearer ${CONFIG.upstash.token}` };
  req.timeoutInterval = 10;
  const res = await req.loadJSON();
  if (res.error) throw new Error(res.error);
  if (!res.result) throw new Error(`Clé "${key}" vide : l'EA tourne-t-il ?`);
  return JSON.parse(res.result);
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

async function loadData(key) {
  try {
    const data = CONFIG.backend === "metaapi" ? await fetchMetaApi() : await fetchUpstash(key);
    fm.writeString(cachePath, JSON.stringify(data));
    return { data, error: null };
  } catch (e) {
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
const isStale = (d) => Date.now() / 1000 - d.ts > CONFIG.staleAfterMin * 60;

function addAge(stack, d, font) {
  const t = stack.addDate(new Date(d.ts * 1000));
  t.applyRelativeStyle(); // iOS met à jour "il y a X min" tout seul
  t.font = font;
  t.textOpacity = 0.7;
  t.lineLimit = 1;
  return t;
}

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
  const title = head.addText(`MT5 · ${d.count} pos · `);
  title.font = Font.semiboldSystemFont(11);
  title.textOpacity = 0.7;
  addAge(head, d, Font.systemFont(11));
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
  const age = addAge(head, d, Font.systemFont(10));
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

const key = (args.widgetParameter || "").trim() || CONFIG.upstash.key;
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
Script.complete();
