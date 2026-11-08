// Вішліст — API для Vercel (Vercel Function + Upstash Redis через REST, без залежностей). Усі адреси однорівневі: /api/state, /api/reserve ...
const crypto = require("crypto");
const ENV = k => (process.env[k] || "").trim();
const RURL = () => ENV("KV_REST_API_URL") || ENV("UPSTASH_REDIS_REST_URL");
const RTOK = () => ENV("KV_REST_API_TOKEN") || ENV("UPSTASH_REDIS_REST_TOKEN");
async function redis(...cmd) {
  if (!RURL() || !RTOK()) throw new Error("Не підключено базу даних (Upstash Redis)");
  const r = await fetch(RURL(), { method: "POST", headers: { Authorization: "Bearer " + RTOK(), "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "redis " + r.status);
  return j.result;
}
const SEED = [
 {id:1,name:'Пазл «Тварини на фермі»',category:'toys',emoji:'🧩',image:'https://kiddyland.com.ua/content/images/33/78x78l80nn0/mii-pershyi-pazl-tvaryny-na-fermi-21142282122722.webp',link:'https://kiddyland.com.ua/mii-pershyi-pazl-tvaryny-na-fermi/',reserved:false},
 {id:2,name:'Нічник-проектор Mideer 4 в 1',category:'toys',emoji:'🌙',image:'https://antoshka.ua/media/catalog/product/cache/ad77408d3b4dcbc5065912f96c5b5ac8/6/2/6284404.webp',link:'https://antoshka.ua/uk/proektor-nichnik-mideer-kids-storybook-torch-4-v-1.html',reserved:false},
 {id:3,name:'Інтерактивна іграшка «Бебі Панда»',category:'toys',emoji:'🐼',image:'https://igra4kite.com/cdn/img/products/190555/little-live-pets-interaktivno-bebe-panda-chuchu-moose-toys-691b9644d5a5e.webp?height=1920&v=1777569430&width=1920',link:'https://antoshka.ua/uk/interaktivna-igrashka-moose-bebi-panda.html',reserved:false},
 {id:4,name:'Набір тіста для ліплення Mideer, 12 кольорів',category:'creative',emoji:'🎨',image:'https://bi.ua/uploaded-images/products/size_650/602855_1.jpg',link:'https://bi.ua/ukr/product/nabor-testa-dlya-lepki-mideer-12-cvetov-md1501.html',reserved:false},
 {id:5,name:'Магнітний конструктор Mideer «Креативна геометрія»',category:'creative',emoji:'🧲',image:'https://mistoigrashok.com.ua/content/images/46/600x600l80mc0/mahnitnyi-konstruktor-kolorovi-plytky-60-detalei-mideer-98047777050473.jpg',link:'https://bi.ua/rus/product/magntniy-konstruktor-mideer-kreativna-geometrya-51-detal-ct0625.html',reserved:false},
 {id:6,name:'Воскові олівці Mideer, 24 кольори',category:'creative',emoji:'🖍️',image:'https://i.simpalsmedia.com/marketplace/products/original/1dfae1bd950ef4e73d656660e94ba474.jpg',link:'https://bi.ua/ukr/product/voskov-olvc-mideer-v-tubus-24-kolorv-md4255.html',reserved:false},
 {id:7,name:'Набір для творчості «Джунглі»',category:'creative',emoji:'🌿',image:'https://bi.ua/uploaded-images/products/size_650/588038_1.jpg',link:'https://bi.ua/ukr/product/razvivayuschiy-nabor-lets-craft-okruzhayuschaya-sreda---dzhungli-psb004.html',reserved:false},
 {id:8,name:'Багаторазові наклейки «Океан»',category:'creative',emoji:'🐠',image:'https://mideerart.com/cdn/shop/files/3-1.jpg?v=1710141908&width=1500',link:'https://bi.ua/rus/product/nabr-bagatorazovih-nalpok-mideer-okean-ct0612.html',reserved:false},
 {id:9,name:'Надувний стрибунець «Єдиноріг»',category:'active',emoji:'🦄',image:'https://cdn.27.ua/original/d9/01/7854337_3.jpeg',link:'https://epicentrk.ua/ua/shop/strybunets-naduvnyi-maxxpro-kids-yedynorih-z-nasosom-pa39925.html',reserved:false}
];
const CATS = ["toys", "creative", "active"];
const SECRET = () => ENV("TOKEN_SECRET") || "wl|" + ENV("ADMIN_PASSWORD");
const sign = p => crypto.createHmac("sha256", SECRET()).update(p).digest("base64url");
const mkToken = () => { const p = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 3600e3 })).toString("base64url"); return p + "." + sign(p); };
const isAdmin = req => {
  const [p, s] = String(req.headers.authorization || "").replace("Bearer ", "").split(".");
  if (!p || !s) return false;
  const e = sign(p); if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return false;
  try { return JSON.parse(Buffer.from(p, "base64url").toString()).exp > Date.now(); } catch { return false; }
};
const getItems = async () => { const v = await redis("GET", "wl:items"); return v ? JSON.parse(v) : SEED.map(({ reserved, ...x }) => x); };
const clean = (s, n) => String(s || "").trim().slice(0, n);
const url = s => (/^https?:\/\//i.test(s) ? s : "");
const send = (res, code, obj) => { res.setHeader("Cache-Control", "no-store"); res.status(code).json(obj); };

module.exports = async (req, res) => {
  const p = String(req.url || "").split("?")[0].replace(/^\/api/, "") || "/", m = req.method;
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  try {
    if (m === "GET" && p === "/health") { let storage = true; try { await redis("PING"); } catch { storage = false; } return send(res, 200, { ok: true, adminPassword: !!ENV("ADMIN_PASSWORD"), storage }); }
    if (m === "GET" && p === "/state") {
      const items = await getItems(), keys = await redis("KEYS", "wl:r:*"), vals = keys.length ? await redis("MGET", ...keys) : [], R = {};
      keys.forEach((k, i) => { if (vals[i]) R[k.slice(5)] = JSON.parse(vals[i]); });
      const adm = isAdmin(req);
      return send(res, 200, { admin: adm, items: items.map(w => ({ ...w, reserved: !!R[w.id], ...(adm && R[w.id] ? { by: R[w.id].name } : {}) })) });
    }
    if (m === "POST" && p === "/login") {
      if (ENV("ADMIN_PASSWORD") && String(b.password || "").trim() === ENV("ADMIN_PASSWORD")) return send(res, 200, { token: mkToken() });
      await new Promise(r => setTimeout(r, 600)); return send(res, 401, { error: "Невірний пароль" });
    }
    if (m === "POST" && p === "/reserve") { // атомарно: SET NX — двоє людей не заброньують одне й те саме
      const id = String(+b.id || ""); const items = await getItems();
      if (!id || !items.some(w => String(w.id) === id)) return send(res, 404, { error: "Подарунок не знайдено" });
      const secret = crypto.randomBytes(12).toString("hex");
      const ok = await redis("SET", "wl:r:" + id, JSON.stringify({ name: clean(b.name, 40) || "Гість", secret, t: Date.now() }), "NX");
      if (ok === null) return send(res, 409, { error: "Цей подарунок уже забронював хтось інший" });
      return send(res, 200, { secret });
    }
    if (m === "POST" && p === "/unreserve") {
      const id = String(+b.id || ""), key = "wl:r:" + id, v = await redis("GET", key);
      if (!v) return send(res, 200, { ok: true });
      if (!isAdmin(req) && JSON.parse(v).secret !== String(b.secret || "")) return send(res, 403, { error: "Скасувати бронь може лише той, хто її зробив" });
      await redis("DEL", key); return send(res, 200, { ok: true });
    }
    if (m === "POST" && (p === "/item" || p === "/delitem")) {
      if (!isAdmin(req)) return send(res, 401, { error: "Потрібен вхід власника" });
      const items = await getItems();
      if (p === "/delitem") { const id = String(b.id); await redis("SET", "wl:items", JSON.stringify(items.filter(w => String(w.id) !== id))); await redis("DEL", "wl:r:" + id); return send(res, 200, { ok: true }); }
      const it = b.item || {}, name = clean(it.name, 120); if (!name) return send(res, 400, { error: "Вкажіть назву" });
      const w = { id: +it.id || Date.now(), name, price: clean(it.price, 30), link: url(clean(it.link, 600)), image: url(clean(it.image, 600)), category: CATS.includes(it.category) ? it.category : "toys", emoji: clean(it.emoji, 4) || "🎁" };
      const i = items.findIndex(x => x.id === w.id); if (i >= 0) items[i] = w; else items.unshift(w);
      await redis("SET", "wl:items", JSON.stringify(items)); return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "Не знайдено" });
  } catch (e) { console.error(e); return send(res, 500, { error: "Помилка сервера" }); }
};
