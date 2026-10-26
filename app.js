const SITES = [
  { id: "pz-tienen", naam: "Psychiatrisch ziekenhuis Tienen" },
  { id: "wzc-sint-alexius", naam: "WZC Sint-Alexius" },
  { id: "wzc-passionisten", naam: "WZC-Passionisten" },
  { id: "wzc-huize-nazareth", naam: "WZC-Huize Nazareth" },
  { id: "psc-leuven", naam: "PSC-Leuven" },
  { id: "hestia", naam: "Hestia" },
];
const ONDERWERPEN = ["Branddeur", "Noodverlichting", "Versperring doorgang", "Versperring blusmiddelen", "Rookmelder", "Elektrische toestellen", "Andere"];

let sb = null, db = null, sessie = null;
let ready = { rondes: false, obs: false };
let rondes = [];   // {id, site, datum, aangemaakt}
let obs = [];      // {id, rondeId, site, gebouw, verdiep, lokaal, onderwerp, omschrijving, gemeld, opgelost, aangemaakt}
let state = { view: "sites", site: null, ronde: null, filter: "alle", editObs: null, confirm: null, editRonde: false };

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fmtDate = iso => { if (!iso) return "—"; const [y, m, d] = String(iso).split("-"); return esc(`${d}/${m}/${y}`); };
const siteNaam = id => (SITES.find(s => s.id === id) || {}).naam || id;
const locTekst = o => [o.gebouw, o.verdiep ? "verdiep " + o.verdiep : "", o.lokaal].filter(Boolean).join(", ") || o.locatie || "";
const gebouwen = os => esc([...new Set(os.map(o => o.gebouw).filter(Boolean))].join(", "));
const status = o => o.opgelost ? "opgelost" : o.gemeld ? "gemeld" : "open";

/* Pictogrammen in de stijl van veiligheidssignalisatie (vaste SVG, geen gebruikersinvoer) */
const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICO = {
  gebouw: svg('<path d="M4 21V5l8-3v19M12 8l8 3v10M2 21h20M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>'),
  klok: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  excel: svg('<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>'),
  Branddeur: svg('<path d="M6 21V3h12v18M3 21h18M14 12h1"/><path d="M9 7h6"/>'),
  Noodverlichting: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z"/>'),
  "Versperring doorgang": svg('<circle cx="13" cy="4.5" r="1.8"/><path d="m7 21 3-6 3 2v4M10 15l1.5-6 3 2.5H18M11.5 9 8 11v3"/><path d="M19 15v6"/>'),
  "Versperring blusmiddelen": svg('<path d="M10 8h4a2 2 0 0 1 2 2v11H8V10a2 2 0 0 1 2-2ZM12 8V5M12 5h-3l-3 2M12 5h3"/>'),
  Rookmelder: svg('<path d="M4 8h16l-2 4H6Z"/><path d="M8 16c1-1 3-1 4 0s3 1 4 0M7 20c1-1 3-1 4 0s3 1 4 0"/>'),
  "Elektrische toestellen": svg('<path d="M13 2 5 14h6l-1 8 8-12h-6Z"/>'),
  Andere: svg('<path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18h.01"/>'),
};
const PICTO_KLEUR = { Noodverlichting: "p-groen", "Versperring doorgang": "p-groen", "Elektrische toestellen": "p-geel", Andere: "p-grijs" };
const picto = onderwerp => `<span class="picto ${PICTO_KLEUR[onderwerp] || ""}">${ICO[onderwerp] || ICO.Andere}</span>`;
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const stempel = iso => { if (!iso) return ""; const [y, m, d] = String(iso).split("-"); return `<span class="stempel" aria-hidden="true"><b>${esc(d)}</b><span>${esc(MAANDEN[+m - 1] || m)} ${esc(y)}</span></span>`; };
const voortgang = c => { const t = c.open + c.gemeld + c.opgelost; if (!t) return ""; const w = n => (n / t * 100).toFixed(1) + "%";
  return `<span class="voortgang" role="img" aria-label="${c.opgelost} van ${t} opgelost"><i class="v-ok" style="width:${w(c.opgelost)}"></i><i class="v-warn" style="width:${w(c.gemeld)}"></i><i class="v-open" style="width:${w(c.open)}"></i></span>`; };

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200);
}
function banner(msg) { const b = $("#banner"); b.textContent = msg || ""; b.hidden = !msg; }

function counts(list) {
  const c = { open: 0, gemeld: 0, opgelost: 0 };
  list.forEach(o => c[status(o)]++);
  return c;
}
function pills(c) {
  let h = "";
  if (c.open) h += `<span class="pill open">${c.open} open</span>`;
  if (c.gemeld) h += `<span class="pill warn">${c.gemeld} gemeld</span>`;
  if (c.opgelost) h += `<span class="pill ok">${c.opgelost} opgelost</span>`;
  return h;
}

function go(view, extra = {}) {
  state = { ...state, view, editObs: null, confirm: null, editRonde: false, ...extra };
  render();
  window.scrollTo({ top: 0 });
}

/* ---------- Views ---------- */
let lastKey = "";
function render() {
  const v = $("#view");
  const key = state.view + ":" + state.site + ":" + state.ronde;
  const keep = {};
  if (key === lastKey) v.querySelectorAll("form input[id]:not([type=file]), form textarea[id], form select[id]").forEach(el => keep[el.id] = el.type === "checkbox" ? el.checked : el.value);
  if (state.view === "ronde" && !rondes.find(r => r.id === state.ronde) && ready.rondes) state.view = "site";
  if (!sessie) { v.innerHTML = viewLogin(); lastKey = ""; return; }
  if (state.view === "sites") v.innerHTML = viewSites();
  else if (state.view === "site") v.innerHTML = viewSite();
  else v.innerHTML = viewRonde();
  for (const id in keep) { const el = document.getElementById(id); if (el && el.closest("form")) { if (el.type === "checkbox") el.checked = keep[id]; else el.value = keep[id]; } }
  lastKey = key;
  toonFotos();
}

function viewLogin() {
  if (!sb) return '<div class="empty">Laden…</div>';
  return `<form class="panel login" id="form-login">
    <h2>Aanmelden</h2>
    <p class="muted" style="margin:0">Vul je e-mailadres in. Je krijgt een mail met een link om je aan te melden.</p>
    <div class="field"><label class="lbl" for="l-mail">E-mailadres</label><input type="text" inputmode="email" autocomplete="email" id="l-mail" required></div>
    <button class="btn primary" type="submit">Stuur aanmeldlink</button>
  </form>`;
}

function viewSites() {
  const cards = SITES.map(s => {
    const rs = rondes.filter(r => r.site === s.id);
    const os = obs.filter(o => o.site === s.id);
    const last = rs.map(r => r.datum).sort().pop();
    const c = counts(os);
    return `<button class="site" data-go-site="${esc(s.id)}">
      <span class="site-kop"><span class="ico">${ICO.gebouw}</span><h3>${esc(s.naam)}</h3></span>
      <span class="site-voet">
        <span class="stats"><span class="pill">${rs.length} ${rs.length === 1 ? "ronde" : "rondes"}</span>${pills(c)}</span>
        <span class="last">${ICO.klok}${last ? "Laatste ronde " + fmtDate(last) : "Nog geen ronde"}</span>
      </span>
    </button>`;
  }).join("");
  const v = lokaleVoorraad();
  const over = v ? `<div class="panel"><h3>Gegevens op dit toestel</h3><p style="margin:0">Op dit toestel staan nog ${v.rondes.length} rondes en ${v.observaties.length} observaties die niet gedeeld zijn.</p><div><button class="btn primary" data-overzetten>Zet ze over naar de gedeelde opslag</button></div></div>` : "";
  return `<div style="display:grid;gap:14px">${over}<h2 class="sectie-kop">Kies je site</h2><p class="intro">Start een veiligheidsronde of volg openstaande observaties op.</p><div class="sites">${cards}</div></div>`;
}

function viewSite() {
  const s = state.site;
  const rs = rondes.filter(r => r.site === s).sort((a, b) => (b.datum || "").localeCompare(a.datum || "") || (b.aangemaakt || "").localeCompare(a.aangemaakt || ""));
  const items = rs.map(r => {
    const os = obs.filter(o => o.rondeId === r.id);
    return `<button class="ronde" data-go-ronde="${esc(r.id)}">
      ${stempel(r.datum)}
      <span class="ronde-info">
        <span class="loc">${gebouwen(os) || '<span class="muted">Nog geen observaties</span>'}</span>
        <span class="stats"><span class="pill">${os.length} ${os.length === 1 ? "observatie" : "observaties"}</span>${pills(counts(os))}</span>
        ${voortgang(counts(os))}
      </span>
    </button>`;
  }).join("");
  const loading = !ready.rondes;
  return `<div style="display:grid;gap:20px">
    <nav class="crumbs"><button data-go-sites>Alle sites</button><span>/</span><span>${esc(siteNaam(s))}</span></nav>
    <div><div class="eyebrow">Site</div><h2>${esc(siteNaam(s))}</h2></div>
    <form class="panel nieuw" id="form-ronde">
      <h3>Nieuwe veiligheidsronde</h3>
      <div class="row">
        <div class="field" style="flex:0 1 180px"><label class="lbl" for="r-datum">Datum</label><input type="date" id="r-datum" required value="${today()}"></div>
        <button class="btn primary" type="submit">Ronde aanmaken</button>
      </div>
    </form>
    <div style="display:grid;gap:10px">
      <h3 class="sectie-kop">Logboek rondes</h3>
      ${loading ? '<div class="empty">Rondes laden…</div>' : items ? `<div class="list">${items}</div>` : '<div class="empty">Nog geen rondes voor deze site. Maak hierboven de eerste aan.</div>'}
    </div>
  </div>`;
}

function obsForm(o) {
  const e = o || {};
  const pre = o ? "e" : "o";
  return `<div class="row">
      <fieldset class="field wide loc-set"><legend class="lbl">Locatie</legend>
        <div class="row">
          <div class="field"><label class="lbl sub" for="${pre}-gebouw">Gebouw</label><input type="text" id="${pre}-gebouw" value="${esc(e.gebouw)}" placeholder="bv. Gebouw B"></div>
          <div class="field" style="flex-basis:110px"><label class="lbl sub" for="${pre}-verdiep">Verdiep</label><input type="text" id="${pre}-verdiep" value="${esc(e.verdiep)}" placeholder="bv. 2"></div>
          <div class="field"><label class="lbl sub" for="${pre}-lokaal">Lokaal</label><input type="text" id="${pre}-lokaal" value="${esc(e.lokaal)}" placeholder="bv. B2.14 of gang"></div>
        </div>
      </fieldset>
      <div class="field"><label class="lbl" for="${pre}-onderwerp">Onderwerp</label>
        <select id="${pre}-onderwerp" required>
          ${o ? "" : '<option value="" disabled selected>Kies een onderwerp</option>'}
          ${ONDERWERPEN.map(x => `<option ${e.onderwerp === x ? "selected" : ""}>${x}</option>`).join("")}
        </select></div>
      <div class="field wide"><label class="lbl" for="${pre}-omschrijving">Omschrijving</label><textarea id="${pre}-omschrijving" placeholder="Wat stelde je vast?">${esc(e.omschrijving)}</textarea></div>
      <div class="field wide"><span class="lbl">Foto</span>
        <div class="foto-veld">
          ${fotoVoorbeeld(pre, e)}
          <input type="file" accept="image/*" capture="environment" id="${pre}-foto" data-foto-input="${pre}">
          <label class="btn" for="${pre}-foto">${heeftFoto(pre, e) ? "Andere foto" : "Foto nemen"}</label>
          ${heeftFoto(pre, e) ? `<button type="button" class="btn danger" data-foto-weg="${pre}">Foto verwijderen</button>` : ""}
        </div>
      </div>
    </div>
    <div class="head">
      <div class="checks">
        <label class="check"><input type="checkbox" id="${pre}-gemeld" ${e.gemeld ? "checked" : ""}> Gemeld</label>
        <label class="check"><input type="checkbox" id="${pre}-opgelost" ${e.opgelost ? "checked" : ""}> Opgelost</label>
      </div>
      <div class="actions">
        ${o ? '<button type="button" class="btn" data-cancel-edit>Annuleren</button>' : ""}
        <button class="btn primary" type="submit">${o ? "Opslaan" : "Observatie toevoegen"}</button>
      </div>
    </div>`;
}

function viewRonde() {
  const r = rondes.find(x => x.id === state.ronde);
  if (!r) return '<div class="empty">Ronde laden…</div>';
  const all = obs.filter(o => o.rondeId === r.id).sort((a, b) => (a.aangemaakt || "").localeCompare(b.aangemaakt || ""));
  const c = counts(all);
  const shown = state.filter === "alle" ? all : all.filter(o => status(o) === state.filter);
  const list = shown.map(o => {
    if (state.editObs === o.id) return `<form class="panel" data-edit-form="${esc(o.id)}"><h3>Observatie bewerken</h3>${obsForm(o)}</form>`;
    const st = status(o);
    const conf = state.confirm === "obs:" + o.id;
    return `<article class="obs s-${st}">
      <div class="obs-top">
        <span class="obs-titel">${picto(o.onderwerp)}<span><span class="subject">${esc(o.onderwerp)}</span>${locTekst(o) ? `<span class="obs-loc">${esc(locTekst(o))}</span>` : ""}</span></span>
        <span class="badge ${st === "open" ? "open" : st === "gemeld" ? "warn" : "ok"}">${st === "open" ? "Open" : st === "gemeld" ? "Gemeld" : "Opgelost"}</span>
      </div>
      ${o.omschrijving ? `<p>${esc(o.omschrijving)}</p>` : ""}
      ${o.foto ? `<button type="button" class="duim-knop" data-groot="${esc(o.foto)}" aria-label="Foto vergroten"><img class="duim" data-foto="${esc(o.foto)}" alt="Foto bij observatie"></button>` : ""}
      <div class="obs-bottom">
        <div class="checks">
          <label class="check"><input type="checkbox" id="g-${o.id}" data-toggle="gemeld" data-id="${esc(o.id)}" ${o.gemeld ? "checked" : ""}> Gemeld</label>
          <label class="check"><input type="checkbox" id="s-${o.id}" data-toggle="opgelost" data-id="${esc(o.id)}" ${o.opgelost ? "checked" : ""}> Opgelost</label>
        </div>
        <div class="actions">
          ${conf
            ? `<span class="muted" style="align-self:center">Verwijderen?</span><button class="btn small danger" data-del-obs="${esc(o.id)}">Ja, verwijderen</button><button class="btn small" data-confirm="">Nee</button>`
            : `<button class="btn small" data-edit-obs="${esc(o.id)}">Bewerken</button><button class="btn small danger" data-confirm="obs:${o.id}">Verwijderen</button>`}
        </div>
      </div>
    </article>`;
  }).join("");
  const filt = ["alle", "open", "gemeld", "opgelost"].map(f =>
    `<button class="btn small" aria-pressed="${state.filter === f}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)}${f === "alle" ? ` (${all.length})` : ` (${c[f]})`}</button>`).join("");
  const confR = state.confirm === "ronde";
  const head = state.editRonde
    ? `<form class="panel" id="form-ronde-edit"><h3>Ronde bewerken</h3><div class="row">
        <div class="field" style="flex:0 1 180px"><label class="lbl" for="re-datum">Datum</label><input type="date" id="re-datum" required value="${esc(r.datum)}"></div>
        <div class="actions"><button type="button" class="btn" data-cancel-ronde>Annuleren</button><button class="btn primary" type="submit">Opslaan</button></div>
      </div></form>`
    : `<section class="fiche"><div class="fiche-band" aria-hidden="true"></div><div class="fiche-in"><div class="head">
        <div><div class="eyebrow">Veiligheidsronde · ${esc(siteNaam(r.site))}</div><h2>${fmtDate(r.datum)}</h2></div>
        <div class="actions">${confR
          ? `<span class="muted" style="align-self:center">Ronde en ${all.length} observaties verwijderen?</span><button class="btn small danger" data-del-ronde>Ja, verwijderen</button><button class="btn small" data-confirm="">Nee</button>`
          : `<button class="btn small" data-export>${ICO.excel}Excel-export</button><button class="btn small" data-edit-ronde>Bewerken</button><button class="btn small danger" data-confirm="ronde">Verwijderen</button>`}</div>
      </div>
      <div class="tellers">
        <div class="teller"><b>${all.length}</b><span>Observaties</span></div>
        <div class="teller t-open"><b>${c.open}</b><span>Open</span></div>
        <div class="teller t-warn"><b>${c.gemeld}</b><span>Gemeld</span></div>
        <div class="teller t-ok"><b>${c.opgelost}</b><span>Opgelost</span></div>
      </div>
      ${voortgang(c)}
    </div></section>`;
  return `<div style="display:grid;gap:20px">
    <nav class="crumbs"><button data-go-sites>Alle sites</button><span>/</span><button data-go-site="${esc(r.site)}">${esc(siteNaam(r.site))}</button><span>/</span><span>${fmtDate(r.datum)}</span></nav>
    ${head}
    <form class="panel nieuw" id="form-obs"><h3>Nieuwe observatie</h3>${obsForm(null)}</form>
    <div style="display:grid;gap:10px">
      <div class="head"><h3 class="sectie-kop">Vaststellingen</h3><div class="filters">${filt}</div></div>
      ${shown.length ? `<div class="list">${list}</div>` : `<div class="empty">${all.length ? "Geen observaties met deze status." : "Nog geen observaties in deze ronde. Voeg hierboven de eerste toe."}</div>`}
    </div>
  </div>`;
}

/* ---------- Lokale opslag (zolang Supabase niet gekoppeld is) ---------- */
const LOKAAL_KEY = "veiligheidsrondes-lokaal";
let lokaal = false;
function leesLokaal() {
  try { const d = JSON.parse(localStorage.getItem(LOKAAL_KEY) || "null"); if (d && Array.isArray(d.rondes) && Array.isArray(d.observaties)) return d; } catch {}
  return { rondes: [], observaties: [] };
}
function schrijfLokaal(d) { localStorage.setItem(LOKAAL_KEY, JSON.stringify(d)); }
const OBS_STANDAARD = { gebouw: "", verdiep: "", lokaal: "", omschrijving: "", gemeld: false, opgelost: false, foto: null };
function lokaleClient() {
  const ok = { error: null };
  const doe = fn => { try { fn(); return ok; } catch (e) { return { error: e }; } };
  return {
    from(tabel) {
      return {
        select: async () => ({ data: leesLokaal()[tabel], error: null }),
        insert: async rij => doe(() => {
          const d = leesLokaal();
          d[tabel].push({ ...(tabel === "observaties" ? OBS_STANDAARD : {}), ...rij, id: rij.id || crypto.randomUUID(), aangemaakt: new Date().toISOString() });
          schrijfLokaal(d);
        }),
        update: wijz => ({ eq: async (_k, id) => doe(() => {
          const d = leesLokaal();
          d[tabel] = d[tabel].map(r => r.id === id ? { ...r, ...wijz } : r);
          schrijfLokaal(d);
        }) }),
        delete: () => ({ eq: async (_k, id) => doe(() => {
          const d = leesLokaal();
          d[tabel] = d[tabel].filter(r => r.id !== id);
          if (tabel === "rondes") d.observaties = d.observaties.filter(o => o.ronde_id !== id);
          schrijfLokaal(d);
        }) }),
      };
    },
  };
}

// Gegevens die nog lokaal op dit toestel staan, overzetten naar Supabase.
function lokaleVoorraad() { if (lokaal) return null; let d; try { d = leesLokaal(); } catch { return null; } return d.rondes.length ? d : null; }
async function zetLokaalOver() {
  const d = lokaleVoorraad(); if (!d) return;
  const rondesRijen = d.rondes.map(({ id, site, datum, aangemaakt }) => ({ id, site, datum, aangemaakt }));
  const obsRijen = d.observaties.map(({ id, ronde_id, site, gebouw, verdiep, lokaal, onderwerp, omschrijving, gemeld, opgelost, aangemaakt, foto }) =>
    ({ id, ronde_id, site, gebouw, verdiep, lokaal, onderwerp, omschrijving, gemeld, opgelost, aangemaakt, foto: foto || null }));
  for (const o of obsRijen) {
    if (!o.foto) continue;
    const blob = await idb("get", o.foto).catch(() => null);
    if (!blob) { o.foto = null; continue; }
    const up = await sb.storage.from("fotos").upload(o.foto, blob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) { console.error(up.error); toast("Een foto kon niet overgezet worden. Probeer opnieuw."); return; }
  }
  let r = await sb.from("rondes").upsert(rondesRijen);
  if (!r.error && obsRijen.length) r = await sb.from("observaties").upsert(obsRijen);
  if (r.error) { console.error(r.error); toast("Overzetten mislukt. Heb je toegang gekregen?"); return; }
  try { localStorage.setItem(LOKAAL_KEY + "-overgezet", JSON.stringify(d)); localStorage.removeItem(LOKAAL_KEY); } catch {}
  toast("Gegevens overgezet");
  laadAlles();
}

/* ---------- Foto's ---------- */
// Lokaal: IndexedDB op dit toestel. Gedeeld: Supabase Storage (bucket "fotos").
function idb(actie, sleutel, waarde) {
  return new Promise((ok, nok) => {
    const req = indexedDB.open("veiligheidsrondes", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("fotos");
    req.onerror = () => nok(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction("fotos", actie === "get" ? "readonly" : "readwrite");
      const st = tx.objectStore("fotos");
      const r = actie === "get" ? st.get(sleutel) : actie === "put" ? st.put(waarde, sleutel) : st.delete(sleutel);
      tx.oncomplete = () => ok(r.result);
      tx.onerror = () => nok(tx.error);
    };
  });
}
const fotoUrls = new Map();
async function fotoUrl(pad) {
  if (fotoUrls.has(pad)) return fotoUrls.get(pad);
  let url = null;
  if (lokaal) { const blob = await idb("get", pad).catch(() => null); if (blob) url = URL.createObjectURL(blob); }
  else { const { data } = await sb.storage.from("fotos").createSignedUrl(pad, 60 * 60 * 12); url = data && data.signedUrl; }
  if (url) fotoUrls.set(pad, url);
  return url;
}
async function bewaarFoto(pad, blob) {
  if (lokaal) { await idb("put", pad, blob); return { error: null }; }
  return sb.storage.from("fotos").upload(pad, blob, { upsert: true, contentType: "image/jpeg" });
}
async function wisFoto(pad) {
  if (!pad) return;
  fotoUrls.delete(pad);
  try { if (lokaal) await idb("del", pad); else await sb.storage.from("fotos").remove([pad]); } catch (e) { console.error(e); }
}
function toonFotos() {
  document.querySelectorAll("img[data-foto]").forEach(async img => {
    const url = await fotoUrl(img.dataset.foto);
    if (url && img.isConnected) img.src = url;
  });
}
// Foto verkleinen tot max. 1600 px, JPEG: kleiner bestand, sneller opladen.
async function verklein(file) {
  const bron = await createImageBitmap(file).catch(() => null);
  if (!bron) return file;
  const k = Math.min(1, 1600 / Math.max(bron.width, bron.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bron.width * k); c.height = Math.round(bron.height * k);
  c.getContext("2d").drawImage(bron, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(b => ok(b || file), "image/jpeg", 0.8));
}
// Gekozen maar nog niet opgeslagen foto's per formulier ("o" = nieuw, "e" = bewerken).
const fotoKeuze = { o: null, e: null };   // Blob
const fotoPreview = { o: null, e: null }; // object-URL
const fotoWeg = { o: false, e: false };
function heeftFoto(pre, e) { return !!fotoKeuze[pre] || (!!e.foto && !fotoWeg[pre]); }
function fotoVoorbeeld(pre, e) {
  if (fotoPreview[pre]) return `<img class="duim" src="${fotoPreview[pre]}" alt="Gekozen foto">`;
  if (e.foto && !fotoWeg[pre]) return `<img class="duim" data-foto="${esc(e.foto)}" alt="Huidige foto">`;
  return "";
}
function wisKeuze(pre) {
  if (fotoPreview[pre]) URL.revokeObjectURL(fotoPreview[pre]);
  fotoKeuze[pre] = null; fotoPreview[pre] = null; fotoWeg[pre] = false;
}

/* ---------- Excel-export ---------- */
const EXCELJS_URL = "vendor/exceljs-4.4.0.min.js";
function laadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise((ok, nok) => {
    const sc = document.createElement("script");
    sc.src = EXCELJS_URL; sc.onload = () => ok(window.ExcelJS); sc.onerror = nok;
    document.head.appendChild(sc);
  });
}
async function fotoBlob(pad) {
  if (lokaal) return idb("get", pad).catch(() => null);
  const { data } = await sb.storage.from("fotos").download(pad);
  return data || null;
}
// Kleine versie van de foto voor in Excel, zodat het bestand licht blijft.
async function fotoVoorExcel(pad) {
  const blob = await fotoBlob(pad); if (!blob) return null;
  const bron = await createImageBitmap(blob).catch(() => null); if (!bron) return null;
  const k = Math.min(1, 240 / Math.max(bron.width, bron.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bron.width * k); c.height = Math.round(bron.height * k);
  c.getContext("2d").drawImage(bron, 0, 0, c.width, c.height);
  const b64 = c.toDataURL("image/jpeg", 0.8).split(",")[1];
  return { base64: b64, width: c.width, height: c.height };
}
async function exporteerRonde(rondeId) {
  const r = rondes.find(x => x.id === rondeId); if (!r) return;
  let ExcelJS;
  try { ExcelJS = await laadExcelJS(); } catch { toast("Excel-export kon niet geladen worden. Controleer je internetverbinding."); return; }
  const lijst = obs.filter(o => o.rondeId === r.id).sort((a, b) => (a.aangemaakt || "").localeCompare(b.aangemaakt || ""));
  const c = counts(lijst);
  const STATUS = { open: ["OPEN", "FFFBE4E1", "FFB3231A"], gemeld: ["GEMELD", "FFFDF0CC", "FF8F5A00"], opgelost: ["OPGELOST", "FFE1F1E7", "FF13804A"] };
  const ROOD = "FFC8261C", ZWART = "FF1B1F1D", GEEL = "FFF5C400", GRIJS = "FF5B625E", LIJN = "FFD3D7D3", ZEBRA = "FFF6F7F5";
  const vul = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const lijn = argb => ({ style: "thin", color: { argb } });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Veiligheidsrondes"; wb.created = new Date();
  const ws = wb.addWorksheet("Ronde", {
    properties: { tabColor: { argb: ROOD } },
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: {
      oddHeader: `&L&"-,Bold"&KC8261CVEILIGHEIDSRONDE BRANDVEILIGHEID&R${siteNaam(r.site).replace(/&/g, "&&")} · ${fmtDate(r.datum)}`,
      oddFooter: "&LVeiligheidsrondes&RPagina &P van &N",
    },
  });
  ws.columns = [
    { key: "nr", width: 5 }, { key: "gebouw", width: 14 }, { key: "verdiep", width: 9 }, { key: "lokaal", width: 14 },
    { key: "onderwerp", width: 22 }, { key: "omschrijving", width: 45 }, { key: "gemeld", width: 9 }, { key: "opgelost", width: 10 },
    { key: "status", width: 12 }, { key: "foto", width: 36 },
  ];

  // Rood bord met titel, daaronder een geel-zwarte markeerband
  ws.mergeCells("A1:J1");
  const titel = ws.getCell("A1");
  titel.value = "VEILIGHEIDSRONDE BRANDVEILIGHEID";
  titel.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  titel.fill = vul(ROOD);
  titel.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 38;
  for (let k = 1; k <= 10; k++) ws.getRow(2).getCell(k).fill = { type: "pattern", pattern: "darkUp", fgColor: { argb: ZWART }, bgColor: { argb: GEEL } };
  ws.getRow(2).height = 9;

  // Gegevens van de ronde
  const info = [["Site", siteNaam(r.site)], ["Datum", fmtDate(r.datum)],
    ["Observaties", `${lijst.length} (open: ${c.open}, gemeld: ${c.gemeld}, opgelost: ${c.opgelost})`],
    ["Geëxporteerd op", new Date().toLocaleString("nl-BE")]];
  info.forEach(([k, v], i) => {
    const nr = 4 + i, rij = ws.getRow(nr);
    ws.mergeCells(nr, 1, nr, 2); ws.mergeCells(nr, 3, nr, 6);
    rij.getCell(1).value = k.toUpperCase();
    rij.getCell(1).font = { bold: true, size: 9, color: { argb: GRIJS } };
    rij.getCell(1).border = { left: { style: "thick", color: { argb: ROOD } } };
    rij.getCell(3).value = v;
    rij.getCell(3).font = { bold: i < 2, size: i < 2 ? 12 : 11, color: { argb: ZWART } };
    [1, 3].forEach(k => { rij.getCell(k).alignment = { vertical: "middle", indent: 1 }; });
    rij.height = 18;
  });

  // Tellers als tegels rechts van de gegevens
  const tegels = [["G", "Open", c.open, STATUS.open], ["H", "Gemeld", c.gemeld, STATUS.gemeld], ["I", "Opgelost", c.opgelost, STATUS.opgelost]];
  tegels.forEach(([kol, label, n, [, bg, fg]]) => {
    ws.mergeCells(`${kol}4:${kol}6`);
    const t = ws.getCell(`${kol}4`);
    t.value = n; t.font = { bold: true, size: 22, color: { argb: fg } };
    t.fill = vul(bg); t.alignment = { horizontal: "center", vertical: "middle" };
    const l = ws.getCell(`${kol}7`);
    l.value = label.toUpperCase(); l.font = { bold: true, size: 8, color: { argb: fg } };
    l.fill = vul(bg); l.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Tabelkop
  const KOP = 9;
  const kop = ws.getRow(KOP);
  ["Nr", "Gebouw", "Verdiep", "Lokaal", "Onderwerp", "Omschrijving", "Gemeld", "Opgelost", "Status", "Foto"].forEach((t, i) => {
    const cel = kop.getCell(i + 1);
    cel.value = t.toUpperCase(); cel.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cel.fill = vul(ZWART);
    cel.alignment = { vertical: "middle", horizontal: i === 0 || (i >= 6 && i <= 8) ? "center" : "left", indent: i === 0 || (i >= 6 && i <= 8) ? 0 : 1 };
    cel.border = { bottom: { style: "thick", color: { argb: ROOD } } };
  });
  kop.height = 24;
  ws.views = [{ state: "frozen", ySplit: KOP, showGridLines: false }];
  ws.pageSetup.printTitlesRow = `${KOP}:${KOP}`;

  for (let i = 0; i < lijst.length; i++) {
    const o = lijst[i], st = status(o), rijNr = KOP + 1 + i;
    const rij = ws.getRow(rijNr);
    rij.values = [i + 1, o.gebouw || "", o.verdiep || "", o.lokaal || "", o.onderwerp || "", o.omschrijving || "",
      o.gemeld ? "Ja" : "Nee", o.opgelost ? "Ja" : "Nee", STATUS[st][0], o.foto ? "" : "—"];
    rij.eachCell({ includeEmpty: true }, (cel, k) => {
      const midden = k === 1 || (k >= 7 && k <= 9);
      cel.alignment = { vertical: "top", wrapText: true, horizontal: midden ? "center" : "left", indent: midden ? 0 : 1 };
      cel.border = { bottom: lijn(LIJN) };
      if (i % 2) cel.fill = vul(ZEBRA);
    });
    rij.getCell(1).font = { bold: true, color: { argb: GRIJS } };
    rij.getCell(1).border = { bottom: lijn(LIJN), left: { style: "thick", color: { argb: STATUS[st][2] } } };
    rij.getCell(5).font = { bold: true };
    [7, 8].forEach(k => { if (rij.getCell(k).value !== "Nee") rij.getCell(k).font = { bold: true, color: { argb: STATUS.opgelost[2] } }; else rij.getCell(k).font = { color: { argb: GRIJS } }; });
    const sc = rij.getCell(9);
    sc.fill = vul(STATUS[st][1]);
    sc.font = { bold: true, size: 10, color: { argb: STATUS[st][2] } };
    sc.border = { top: lijn(STATUS[st][2]), bottom: lijn(STATUS[st][2]), left: lijn(STATUS[st][2]), right: lijn(STATUS[st][2]) };
    rij.height = Math.max(30, Math.ceil((o.omschrijving || "").length / 50) * 15 + 6);
    if (o.foto) {
      const f = await fotoVoorExcel(o.foto).catch(() => null);
      if (f) {
        const id = wb.addImage({ base64: f.base64, extension: "jpeg" });
        ws.addImage(id, { tl: { col: 9.05, row: rijNr - 1 + 0.05 }, ext: { width: f.width, height: f.height }, editAs: "oneCell" });
        rij.height = Math.max(rij.height, f.height * 0.75 + 8);
      } else rij.getCell(10).value = "(foto niet beschikbaar)";
    }
  }
  if (lijst.length) ws.autoFilter = { from: { row: KOP, column: 1 }, to: { row: KOP + lijst.length, column: 9 } };
  else { ws.getCell(`A${KOP + 1}`).value = "Geen observaties in deze ronde."; ws.getCell(`A${KOP + 1}`).font = { italic: true, color: { argb: GRIJS } }; }

  // Afsluitende markeerband onder de tabel
  const eind = KOP + Math.max(lijst.length, 1) + 2;
  for (let k = 1; k <= 10; k++) ws.getRow(eind).getCell(k).fill = { type: "pattern", pattern: "darkUp", fgColor: { argb: ZWART }, bgColor: { argb: GEEL } };
  ws.getRow(eind).height = 6;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const naam = `Veiligheidsronde ${siteNaam(r.site)} ${r.datum}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = naam;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast("Excel-bestand gedownload");
}

/* ---------- Opslag (Supabase) ---------- */
const fromRow = r => ({ id: r.id, rondeId: r.ronde_id, site: r.site, datum: r.datum, gebouw: r.gebouw, verdiep: r.verdiep, lokaal: r.lokaal,
  onderwerp: r.onderwerp, omschrijving: r.omschrijving, gemeld: r.gemeld, opgelost: r.opgelost, aangemaakt: r.aangemaakt, foto: r.foto || null });

async function laadAlles() {
  const [r, o] = await Promise.all([
    sb.from("rondes").select("*"),
    sb.from("observaties").select("*"),
  ]);
  if (r.error || o.error) { banner("De gegevens konden niet geladen worden. Heb je toegang gekregen? Vraag het aan de beheerder."); return; }
  banner(lokaal ? "Gegevens worden voorlopig enkel op dit toestel bewaard." : "");
  rondes = r.data.map(fromRow); obs = o.data.map(fromRow);
  ready.rondes = ready.obs = true;
  renderSafe();
}

async function write(fn, okMsg) {
  try {
    const { error } = await fn();
    if (error) throw error;
    if (okMsg) toast(okMsg);
    laadAlles();
    return true;
  } catch (e) {
    console.error(e);
    toast(e && (e.code === "42501" || /row-level security/i.test(e.message || "")) ? "Je hebt geen toegang om dit op te slaan." : "Opslaan mislukt. Controleer je verbinding en probeer opnieuw.");
    return false;
  }
}

function readObsForm(pre) {
  return {
    gebouw: $(`#${pre}-gebouw`).value.trim(),
    verdiep: $(`#${pre}-verdiep`).value.trim(),
    lokaal: $(`#${pre}-lokaal`).value.trim(),
    onderwerp: $(`#${pre}-onderwerp`).value,
    omschrijving: $(`#${pre}-omschrijving`).value.trim(),
    gemeld: $(`#${pre}-gemeld`).checked,
    opgelost: $(`#${pre}-opgelost`).checked,
  };
}

document.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "form-login") {
    const email = $("#l-mail").value.trim();
    if (!email) return;
    const btn = f.querySelector("button"); btn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
    btn.disabled = false;
    if (error) toast("Versturen mislukt: " + error.message);
    else f.innerHTML = `<h2>Kijk in je mailbox</h2><p style="margin:0">We stuurden een aanmeldlink naar <strong>${esc(email)}</strong>. Open die link op dit toestel.</p>`;
  } else if (f.id === "form-ronde") {
    const datum = $("#r-datum").value;
    if (!datum) return;
    const id = crypto.randomUUID();
    const ok = await write(() => sb.from("rondes").insert({ id, site: state.site, datum }), "Ronde aangemaakt");
    if (ok) { rondes = [...rondes, { id, site: state.site, datum, aangemaakt: new Date().toISOString() }]; go("ronde", { ronde: id, filter: "alle" }); }
  } else if (f.id === "form-obs") {
    const d = readObsForm("o");
    if (!d.onderwerp) { $("#o-onderwerp").focus(); toast("Kies een onderwerp"); return; }
    const r = rondes.find(x => x.id === state.ronde);
    const id = crypto.randomUUID();
    const knop = f.querySelector("button[type=submit]"); knop.disabled = true;
    let foto = null;
    if (fotoKeuze.o) {
      foto = `${r.site}/${id}-${Date.now()}.jpg`;
      const up = await bewaarFoto(foto, fotoKeuze.o).catch(err => ({ error: err }));
      if (up.error) { console.error(up.error); knop.disabled = false; toast("De foto kon niet opgeslagen worden. Probeer opnieuw."); return; }
    }
    const ok = await write(() => sb.from("observaties").insert({ ...d, id, foto, ronde_id: r.id, site: r.site }), "Observatie toegevoegd");
    knop.disabled = false;
    if (ok) { f.reset(); wisKeuze("o"); lastKey = ""; render(); }
  } else if (f.dataset.editForm) {
    const id = f.dataset.editForm, d = readObsForm("e");
    const oud = obs.find(o => o.id === id) || {};
    if (fotoKeuze.e) {
      d.foto = `${oud.site}/${id}-${Date.now()}.jpg`;
      const up = await bewaarFoto(d.foto, fotoKeuze.e).catch(err => ({ error: err }));
      if (up.error) { console.error(up.error); toast("De foto kon niet opgeslagen worden. Probeer opnieuw."); return; }
    } else if (fotoWeg.e) d.foto = null;
    const ok = await write(() => sb.from("observaties").update(d).eq("id", id), "Opgeslagen");
    if (ok) { if ("foto" in d && oud.foto) wisFoto(oud.foto); wisKeuze("e"); state.editObs = null; render(); }
  } else if (f.id === "form-ronde-edit") {
    const datum = $("#re-datum").value;
    const ok = await write(() => sb.from("rondes").update({ datum }).eq("id", state.ronde), "Opgeslagen");
    if (ok) { state.editRonde = false; render(); }
  }
});

document.addEventListener("change", async e => {
  const t = e.target;
  if (t.dataset.fotoInput) {
    const pre = t.dataset.fotoInput, file = t.files && t.files[0];
    if (!file) return;
    const blob = await verklein(file);
    wisKeuze(pre);
    fotoKeuze[pre] = blob; fotoPreview[pre] = URL.createObjectURL(blob);
    render();
    return;
  }
  if (!t.dataset.toggle) return;
  const ok = await write(() => sb.from("observaties").update({ [t.dataset.toggle]: t.checked }).eq("id", t.dataset.id));
  if (!ok) t.checked = !t.checked;
});

document.addEventListener("click", async e => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (b.id === "logout") { await sb.auth.signOut(); return; }
  if ("export" in d) { b.disabled = true; const t = b.textContent; b.textContent = "Bezig…"; try { await exporteerRonde(state.ronde); } finally { b.disabled = false; b.textContent = t; } return; }
  if ("overzetten" in d) { b.disabled = true; await zetLokaalOver(); return; }
  if (d.fotoWeg) { const pre = d.fotoWeg; const had = !!fotoKeuze[pre]; wisKeuze(pre); if (!had || pre === "e") fotoWeg[pre] = !had; render(); return; }
  if (d.groot) {
    const url = await fotoUrl(d.groot); if (!url) return;
    const ov = document.createElement("div"); ov.className = "groot"; ov.innerHTML = `<img alt="Foto bij observatie">`;
    ov.querySelector("img").src = url; ov.addEventListener("click", () => ov.remove()); document.body.appendChild(ov);
    return;
  }
  if ("goSites" in d) go("sites");
  else if (d.goSite) go("site", { site: d.goSite });
  else if (d.goRonde) go("ronde", { ronde: d.goRonde, filter: "alle" });
  else if (d.filter) { state.filter = d.filter; render(); }
  else if ("confirm" in d) { state.confirm = d.confirm || null; render(); }
  else if (d.editObs) { lastKey = ""; wisKeuze("e"); state.editObs = d.editObs; state.confirm = null; render(); }
  else if ("cancelEdit" in d) { wisKeuze("e"); state.editObs = null; render(); }
  else if ("editRonde" in d) { state.editRonde = true; state.confirm = null; render(); }
  else if ("cancelRonde" in d) { state.editRonde = false; render(); }
  else if (d.delObs) {
    const foto = (obs.find(o => o.id === d.delObs) || {}).foto;
    if (await write(() => sb.from("observaties").delete().eq("id", d.delObs), "Observatie verwijderd")) { wisFoto(foto); state.confirm = null; render(); }
  }
  else if ("delRonde" in d) {
    const r = rondes.find(x => x.id === state.ronde);
    // observaties verdwijnen mee (on delete cascade)
    const fotos = obs.filter(o => o.rondeId === r.id && o.foto).map(o => o.foto);
    const ok = await write(() => sb.from("rondes").delete().eq("id", r.id), "Ronde verwijderd");
    if (ok) { fotos.forEach(wisFoto); go("site", { site: r.site }); }
  }
});

/* ---------- Opstart ---------- */
let kanaal = null;
function zetSessie(s) {
  const was = !!sessie;
  sessie = s;
  $("#who").hidden = !s;
  $("#who-mail").textContent = s ? s.user.email : "";
  if (s && !was) {
    laadAlles();
    if (lokaal) return render();
    kanaal = sb.channel("wijzigingen")
      .on("postgres_changes", { event: "*", schema: "public", table: "rondes" }, () => laadAlles())
      .on("postgres_changes", { event: "*", schema: "public", table: "observaties" }, () => laadAlles())
      .subscribe();
  }
  if (!s) { rondes = []; obs = []; ready.rondes = ready.obs = false; if (kanaal) { sb.removeChannel(kanaal); kanaal = null; } }
  render();
}

render();
(async () => {
  const cfg = window.VEILIGHEIDSRONDES_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey || /VUL_IN/.test(cfg.supabaseUrl + cfg.supabaseAnonKey)) {
    // Nog geen gedeelde opslag: alles blijft op dit toestel.
    try { localStorage.setItem(LOKAAL_KEY + "-test", "1"); localStorage.removeItem(LOKAAL_KEY + "-test"); }
    catch { banner("Deze browser laat geen opslag toe. Open de app in een gewoon (niet-privé) venster."); return; }
    lokaal = true;
    sb = lokaleClient();
    banner("Gegevens worden voorlopig enkel op dit toestel bewaard.");
    zetSessie({ user: { email: "" } });
    $("#who").hidden = true;
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const { data } = await sb.auth.getSession();
  zetSessie(data.session);
  sb.auth.onAuthStateChange((_ev, s) => { if (!!s !== !!sessie) zetSessie(s); else sessie = s; });
  // Bij terugkeer naar de app (gsm) gegevens verversen.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && sessie) laadAlles(); });
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
// Eigen installatieknop (Chrome/Edge/Samsung Internet): verschijnt zodra de browser de app installeerbaar vindt.
let installVraag = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installVraag = e; $("#installeer").hidden = false; });
window.addEventListener("appinstalled", () => { installVraag = null; $("#installeer").hidden = true; toast("App geïnstalleerd"); });
$("#installeer").addEventListener("click", async () => {
  if (!installVraag) return;
  installVraag.prompt();
  await installVraag.userChoice.catch(() => {});
  installVraag = null; $("#installeer").hidden = true;
});

// Niet opnieuw tekenen terwijl iemand een formulier invult; dat zou getypte tekst wissen.
function renderSafe() {
  const a = document.activeElement;
  const typing = a && a.matches && a.matches("input[type=text], textarea, select, input[type=date]") && a.value;
  if (typing) { clearTimeout(renderSafe.t); renderSafe.t = setTimeout(renderSafe, 1500); return; }
  render();
}
