/**
 * ventotrieste-api — Cloudflare Worker (ott 2026)
 *
 * API JSON per i partner. Primo cliente: RAI, grafica della diretta Barcolana 58
 * (11 ott 2026), che interroga anche ogni 5 secondi. Accordo: niente credito in
 * grafica (compliance RAI), i commentatori dello streaming dicono che i dati sono
 * forniti da vento.barcolana.it, progetto di Alberto Broggi (redirect a
 * ventotrieste.info/barcolana2026/).
 *
 * Solo stazioni della Protezione Civile FVG (API pubblica, licenza CC BY 4.0): sono le
 * uniche che possiamo ridistribuire. Dicitura obbligatoria (ARPA FVG, 1 ott 2026):
 * "Fonte: Protezione Civile della Regione Friuli Venezia Giulia", licenza, "dati elaborati";
 * niente "OSMER", che è il nome dei dati ARPA (quelli real-time non si ripubblicano).
 * NIENTE vetercek (accordo con Jaka solo per il sito) e NIENTE Windguru/Barcola
 * (offline dal 2 ott 2026, e comunque non nostra).
 *
 * Come funziona:
 *  - cron ogni 5 minuti: legge l'ultima misura delle stazioni e la salva in KV
 *    (scrive solo quando cambia: le stazioni pubblicano ogni 15 minuti).
 *  - GET /v1/barcolana?key=…: calcola i punti del percorso dalle stazioni salvate.
 *    Villaggio = misura di Trieste molo; partenza, boe e arrivo = stima pesata
 *    1/d² come nella pagina /barcolana2026/ (lì non ci sono centraline).
 *    La lettura di KV resta in memoria 30s: il polling a 5s non consuma la quota KV.
 *  - GET /v1/stato: età dei dati delle stazioni, senza chiave e senza valori.
 *
 * Chiavi: secret CHIAVI (separate da virgola) →  npx wrangler secret put CHIAVI
 * Deploy: dalla cartella cloudflare-worker/api →  npx wrangler deploy
 */

const PCFVG = 'https://monitor.protezionecivile.fvg.it/api/stations/';
const SENSORI = { dir: 5, vel: 6, raffica: 7 };   // gradi da cui viene il vento; m/s; m/s
const MS_IN_KT = 1.943844;
const KT_IN_KMH = 1.852;
const CHIAVE_KV = 'api-stazioni';
const MEMO_MS = 30000;
// oltre questa età una stazione non entra nei calcoli. Pubblicano ogni 15 min con
// 5-15 min di ritardo, più i 5 min del cron: 40 evita di spegnere la grafica per un
// solo dato in ritardo (la pagina /barcolana2026/, che legge in diretta, usa 30).
const MAX_ETA_MIN = 40;
const FONTE = 'Fonte: Protezione Civile della Regione Friuli Venezia Giulia (CC BY 4.0), dati elaborati da vento.barcolana.it';
const LICENZA = 'https://creativecommons.org/licenses/by/4.0/deed.it';
// frase per i commentatori dello streaming
const CREDITO = 'Dati vento forniti da vento.barcolana.it, progetto di Alberto Broggi, su dati della Protezione Civile della Regione Friuli Venezia Giulia';

// stesse coordinate del sito (ventotrieste-dati e /barcolana2026/), così i numeri coincidono
const STAZIONI = [
  { id: 'trieste', nome: 'Trieste molo', pcfvg: 212, lat: 45.636806, lon: 13.750556 },
  { id: 'muggia', nome: 'Muggia', pcfvg: 500, lat: 45.602, lon: 13.768 },
  { id: 'paloma', nome: 'Boa Paloma', pcfvg: 574, lat: 45.619, lon: 13.565 },
];

// boe dalla mappa ufficiale, come in /barcolana2026/ (partenza e arrivo = centro della linea)
const PUNTI = [
  { id: 'partenza', nome: 'Partenza', lat: 45.680245, lon: 13.71925 },
  { id: 'boa1', nome: 'Boa 1', lat: 45.62219, lon: 13.67103 },
  { id: 'boa2', nome: 'Boa 2', lat: 45.63473, lon: 13.66177 },
  { id: 'arrivo', nome: 'Arrivo', lat: 45.653105, lon: 13.75622 },
  { id: 'villaggio', nome: 'Villaggio Barcolana', stazione: 'trieste' },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'X-Api-Key',
};

const rad = d => d * Math.PI / 180;
const norm360 = d => ((d % 360) + 360) % 360;
const r1 = x => Math.round(x * 10) / 10;
const CARDINALI = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const cardinale = deg => CARDINALI[Math.round(norm360(deg) / 22.5) % 16];
const oraLocale = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });

function distNm(a, b) {
  const dy = (b.lat - a.lat) * 60, dx = (b.lon - a.lon) * 60 * Math.cos(rad((a.lat + b.lat) / 2));
  return Math.hypot(dx, dy);
}

/* ---------- lettura delle stazioni (cron) ---------- */

async function fetchJson(url, timeoutMs, tentativi) {
  for (let i = 1; ; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (err) {
      if (i >= tentativi) throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

/* ultima misura di una stazione: { kt, raffica, deg, t (ms) } o null se manca la velocità */
async function leggiStazione(st) {
  const j = await fetchJson(PCFVG + st.pcfvg + '/measures/latest?ts=' + Date.now(), 15000, 2);
  const per = {};
  let dt = null;
  (j.measures || []).forEach(m => {
    per[m.sensor_id] = m.value;
    if (Object.values(SENSORI).includes(m.sensor_id) && (!dt || m.dt > dt)) dt = m.dt;
  });
  // orari UTC, formato "2026-10-07 06:45:00"
  const t = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(dt || '').trim())
    ? Date.parse(String(dt).trim().replace(' ', 'T') + 'Z') : NaN;
  if (typeof per[SENSORI.vel] !== 'number' || isNaN(t)) return null;
  return {
    kt: per[SENSORI.vel] * MS_IN_KT,
    raffica: typeof per[SENSORI.raffica] === 'number' ? per[SENSORI.raffica] * MS_IN_KT : null,
    deg: typeof per[SENSORI.dir] === 'number' ? per[SENSORI.dir] : null,
    t,
  };
}

/* legge tutte le stazioni; una che non risponde tiene il valore salvato prima */
async function aggiorna(env) {
  const salvato = (await env.DATI.get(CHIAVE_KV, { type: 'json' })) || {};
  const letture = await Promise.allSettled(STAZIONI.map(leggiStazione));
  const nuovo = { ...salvato };
  let cambiato = false;
  letture.forEach((l, i) => {
    const id = STAZIONI[i].id;
    if (l.status !== 'fulfilled') { console.warn(id + ': ' + l.reason); return; }
    if (!l.value) return;
    if (!salvato[id] || salvato[id].t !== l.value.t) cambiato = true;
    nuovo[id] = l.value;
  });
  if (!cambiato) return { dati: salvato, esito: 'invariato' };
  await env.DATI.put(CHIAVE_KV, JSON.stringify(nuovo));
  return { dati: nuovo, esito: 'scritto' };
}

/* ---------- risposta ---------- */

let memo = { letto: 0, dati: null };

async function stazioniSalvate(env) {
  if (memo.dati && Date.now() - memo.letto < MEMO_MS) return memo.dati;
  let dati = await env.DATI.get(CHIAVE_KV, { type: 'json' });
  if (!dati) dati = (await aggiorna(env)).dati;   // primo avvio, prima del cron
  memo = { letto: Date.now(), dati };
  return dati;
}

function etaMin(t, ora) {
  return Math.max(0, Math.round((ora - t) / 60000));
}

function valori(v, ora) {
  return {
    vento_kt: r1(v.kt),
    raffica_kt: v.raffica == null ? null : r1(v.raffica),
    vento_kmh: r1(v.kt * KT_IN_KMH),
    raffica_kmh: v.raffica == null ? null : r1(v.raffica * KT_IN_KMH),
    direzione_gradi: v.deg == null ? null : Math.round(norm360(v.deg)),
    direzione: v.deg == null ? null : cardinale(v.deg),
    ora_misura: new Date(v.t).toISOString(),
    ora_misura_locale: oraLocale.format(new Date(v.t)),
    eta_min: etaMin(v.t, ora),
  };
}

const VUOTO = {
  vento_kt: null, raffica_kt: null, vento_kmh: null, raffica_kmh: null,
  direzione_gradi: null, direzione: null, ora_misura: null, ora_misura_locale: null, eta_min: null,
};

/* media pesata 1/d² delle stazioni fresche (stessa formula di /barcolana2026/);
   la direzione è una media vettoriale pesata anche sull'intensità */
function stima(punto, fresche) {
  if (!fresche.length) return null;
  let sw = 0, sk = 0, sg = 0, sgw = 0, sx = 0, sy = 0, t = Infinity;
  const pesi = [];
  fresche.forEach(({ st, v }) => {
    const w = 1 / Math.pow(Math.max(distNm(punto, st), 0.4), 2);
    pesi.push({ nome: st.nome, w });
    sw += w; sk += w * v.kt;
    if (v.raffica != null) { sg += w * v.raffica; sgw += w; }
    if (v.deg != null) { const wv = w * Math.max(v.kt, 1); sx += wv * Math.sin(rad(v.deg)); sy += wv * Math.cos(rad(v.deg)); }
    t = Math.min(t, v.t);   // ora della misura = la più vecchia tra quelle usate
  });
  pesi.sort((a, b) => b.w - a.w);
  const kt = sk / sw;
  return {
    // raffica mai sotto il vento medio (succederebbe se la stazione più ventosa non desse la raffica)
    v: { kt, raffica: sgw ? Math.max(sg / sgw, kt) : null, deg: (sx || sy) ? Math.atan2(sx, sy) * 180 / Math.PI : null, t },
    fonti: pesi.filter(p => p.w / sw > 0.15).map(p => p.nome),
  };
}

function risposta(dati) {
  const ora = Date.now();
  const fresche = STAZIONI
    .map(st => ({ st, v: dati[st.id] }))
    .filter(({ v }) => v && etaMin(v.t, ora) <= MAX_ETA_MIN);

  const punti = {};
  PUNTI.forEach(p => {
    if (p.stazione) {
      const st = STAZIONI.find(s => s.id === p.stazione);
      const f = fresche.find(x => x.st.id === p.stazione);
      punti[p.id] = { nome: p.nome, tipo: 'misura', disponibile: !!f, ...(f ? valori(f.v, ora) : VUOTO),
        fonti: [st.nome], lat: st.lat, lon: st.lon };
      return;
    }
    const s = stima(p, fresche);
    punti[p.id] = { nome: p.nome, tipo: 'stima', disponibile: !!s, ...(s ? valori(s.v, ora) : VUOTO),
      fonti: s ? s.fonti : [], lat: p.lat, lon: p.lon };
  });

  const stazioni = {};
  STAZIONI.forEach(st => {
    const v = dati[st.id];
    stazioni[st.id] = { nome: st.nome, rete: 'Protezione Civile della Regione Friuli Venezia Giulia', id_pcfvg: st.pcfvg,
      ...(v ? valori(v, ora) : VUOTO), vecchio: !v || etaMin(v.t, ora) > MAX_ETA_MIN, lat: st.lat, lon: st.lon };
  });

  return {
    evento: 'Barcolana 58 – 11 ottobre 2026',
    generato: new Date(ora).toISOString(),
    fonte: FONTE,
    licenza: LICENZA,
    credito: CREDITO,
    aggiornamento_fonti_min: 5,
    punti,
    stazioni,
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

function chiaveValida(request, url, env) {
  const chiavi = String(env.CHIAVI || '').split(',').map(s => s.trim()).filter(Boolean);
  const data = request.headers.get('X-Api-Key') || url.searchParams.get('key') || '';
  return chiavi.length > 0 && chiavi.includes(data);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(aggiorna(env).then(r => console.log(r.esito), err => console.warn('aggiorna: ' + err)));
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const percorso = url.pathname.replace(/\/+$/, '');

    if (percorso === '/v1/stato') {
      const dati = await stazioniSalvate(env);
      const ora = Date.now();
      const eta = {};
      STAZIONI.forEach(st => { eta[st.id] = dati[st.id] ? etaMin(dati[st.id].t, ora) : null; });
      return json({ generato: new Date(ora).toISOString(), eta_min: eta, max_eta_min: MAX_ETA_MIN });
    }

    if (percorso === '/v1/barcolana') {
      if (!chiaveValida(request, url, env)) return json({ errore: 'chiave mancante o non valida' }, 401);
      try {
        return json(risposta(await stazioniSalvate(env)));
      } catch (err) {
        return json({ errore: 'dati non disponibili: ' + err }, 503);
      }
    }

    return json({ errore: 'percorso sconosciuto', disponibili: ['/v1/barcolana?key=…', '/v1/stato'] }, 404);
  },
};
