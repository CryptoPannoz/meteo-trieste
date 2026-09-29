/**
 * ventotrieste-dati — Cloudflare Worker (set 2026)
 *
 * Perché esiste: il proxy Apps Script prepara il payload ogni 5 minuti (trigger
 * riscaldaCache) ma lo SERVE male: anche a cache pronta risponde in 2-18 secondi e a
 * volte con una pagina HTML 404 dopo 11-39 secondi (misurato il 29 set 2026). Per chi
 * apre la pagina o preme "Aggiorna" voleva dire guardare dati vecchi per decine di
 * secondi.
 *
 * Come funziona:
 *  - cron ogni minuto: legge il payload dal proxy Apps Script (richieste a staffetta,
 *    come /dati-live.js) e, se è più recente di quello salvato, lo scrive in KV.
 *    Scrive solo quando cambia (~288 volte al giorno, il piano gratuito ne concede 1000).
 *    Il proxy serve la sua copia in cache: nessuna lettura in più su vetercek, il ritmo
 *    lo decide sempre il trigger Apps Script (accordo con Jaka: mai sotto i 5 minuti).
 *  - GET /: risponde con il payload da KV in pochi millisecondi (misurato 0,13-0,22s).
 *    NB: Barcola NON si può rileggere da qui: Windguru risponde 403 "forbidden" alle
 *    richieste che partono da Cloudflare (provato 29 set 2026 con vari Referer/UA).
 *    Resta quella del proxy Apps Script, aggiornata ogni 5 minuti.
 *  - GET /?diag=1: età del payload salvato.
 *
 * Il frontend (/dati-live.js) usa questo Worker per primo e torna al proxy Apps Script
 * se il Worker non risponde o ha un payload vecchio: il sito non dipende da Cloudflare.
 *
 * Deploy: dalla cartella cloudflare-worker/dati →  npx wrangler deploy
 */

const PROXY = 'https://script.google.com/macros/s/AKfycbxev3jcFdaCa1MM8lAx56sMBWYCkoUprA7C3Q_uGyCxNEYEjgKF6P3BiDaadr4zvUTpPg/exec';
const CHIAVE = 'payload';
const PARTENZE_MS = [0, 3000, 7000];
const TIMEOUT_MS = 40000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function valido(d) {
  return !!(d && typeof d === 'object' && !d.fatal && d.updated && !isNaN(Date.parse(d.updated)));
}

/* Payload dal proxy Apps Script: fino a 3 richieste sfalsate, vince la prima JSON valida. */
function leggiProxy() {
  return new Promise((resolve, reject) => {
    const controlli = [], timer = [];
    let finito = false, falliti = 0, partiti = 0, ultimoErr = null;
    const chiudi = () => {
      finito = true;
      timer.forEach(clearTimeout);
      controlli.forEach(c => { try { c.abort(); } catch (e) {} });
    };
    const parti = () => {
      if (finito || partiti >= PARTENZE_MS.length) return;
      partiti++;
      const ac = new AbortController();
      controlli.push(ac);
      fetch(PROXY + '?ts=' + Date.now() + '-cf' + partiti, { signal: ac.signal, redirect: 'follow' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(d => {
          if (!valido(d)) throw new Error((d && d.fatal) || 'payload non valido');
          if (finito) return;
          chiudi();
          resolve(d);
        })
        .catch(err => {
          if (finito) return;
          ultimoErr = err;
          if (++falliti >= PARTENZE_MS.length) { chiudi(); reject(err); return; }
          parti();
        });
    };
    PARTENZE_MS.forEach((ms, i) => { if (i === 0) parti(); else timer.push(setTimeout(parti, ms)); });
    timer.push(setTimeout(() => { if (!finito) { chiudi(); reject(ultimoErr || new Error('timeout')); } }, TIMEOUT_MS));
  });
}

/* cron: copia il payload in KV se è più recente di quello salvato */
async function aggiorna(env) {
  const d = await leggiProxy();
  const salvato = await env.DATI.getWithMetadata(CHIAVE, { type: 'text' });
  const prima = salvato && salvato.metadata ? Date.parse(salvato.metadata.updated) : 0;
  if (Date.parse(d.updated) <= prima) return 'invariato';
  await env.DATI.put(CHIAVE, JSON.stringify(d), { metadata: { updated: d.updated, salvato: new Date().toISOString() } });
  return 'scritto ' + d.updated;
}

function json(obj, extra) {
  return new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...(extra || {}) },
  });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(aggiorna(env).catch(err => console.warn('aggiorna: ' + err)));
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const params = new URL(request.url).searchParams;

    if (params.get('diag')) {
      const s = await env.DATI.getWithMetadata(CHIAVE, { type: 'text', cacheTtl: 30 });
      const m = (s && s.metadata) || {};
      return json({ updated: m.updated || null, salvato: m.salvato || null,
        etaSec: m.updated ? Math.round((Date.now() - Date.parse(m.updated)) / 1000) : null });
    }

    const testo = await env.DATI.get(CHIAVE, { type: 'text', cacheTtl: 30 });
    let d = null;
    try { d = testo ? JSON.parse(testo) : null; } catch (e) { d = null; }
    if (!valido(d)) {
      // KV vuoto (primo avvio) o illeggibile: vado dal proxy e salvo per i prossimi
      try {
        d = await leggiProxy();
        ctx.waitUntil(env.DATI.put(CHIAVE, JSON.stringify(d), { metadata: { updated: d.updated, salvato: new Date().toISOString() } }));
      } catch (err) {
        return json({ fatal: 'dati non disponibili: ' + err }, { 'X-Fonte': 'errore' });
      }
    }
    return json(d, { 'X-Dati-Updated': d.updated });
  },
};
