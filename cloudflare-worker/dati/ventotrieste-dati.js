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
 *  - GET /registro?giorno=YYYY-MM-DD: registro del vento dalle 6 alle 19, un valore ogni
 *    15 minuti per centralina più la media sul campo di regata (vedi "REGISTRO" sotto).
 *  - GET /riepilogo: media di ogni giornata dal 1° settembre 2026, per il riepilogo dei
 *    giorni ventosi sopra la tabella del registro (vedi "RIEPILOGO" sotto).
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

/* Dal proxy Apps Script: fino a 3 richieste sfalsate, vince la prima JSON valida.
   query: parametri in più (es. "storicoBarcola=2026-10-11"); ok: validatore della risposta. */
function leggiProxy(query, ok) {
  const buono = ok || valido;
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
      fetch(PROXY + '?' + (query ? query + '&' : '') + 'ts=' + Date.now() + '-cf' + partiti, { signal: ac.signal, redirect: 'follow' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(d => {
          if (!buono(d)) throw new Error((d && (d.fatal || d.errore)) || 'risposta non valida');
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

/* cron: copia il payload in KV se è più recente di quello salvato; quando cambia,
   aggiorna anche la registrazione di Monte Grisa e, tra le 6 e le 19:30, il registro di oggi */
async function aggiorna(env) {
  const d = await leggiProxy();
  const salvato = await env.DATI.getWithMetadata(CHIAVE, { type: 'text' });
  const prima = salvato && salvato.metadata ? Date.parse(salvato.metadata.updated) : 0;
  if (Date.parse(d.updated) <= prima) return 'invariato';
  await env.DATI.put(CHIAVE, JSON.stringify(d), { metadata: { updated: d.updated, salvato: new Date().toISOString() } });
  try { await registraGrisa(env, d); } catch (e) { console.warn('grisa: ' + e); }
  const ora = roma(Date.now());
  if (ora.hhmm >= REG_CRON_DA && ora.hhmm <= REG_CRON_A) {
    try { await salvaRegistro(env, await costruisciRegistro(env, ora.giorno)); } catch (e) { console.warn('registro: ' + e); }
  }
  return 'scritto ' + d.updated;
}

/* ============================ REGISTRO DEL VENTO 6-19 ============================
   Richiesto dall'organizzazione della Barcolana (30 set 2026): per ogni giorno un valore
   ogni 15 minuti per ciascuna centralina, più la media sul campo di regata. Prima dalle 8
   alle 18; dal 2 ott 2026 dalle 6 alle 19 (Alberto), REG_VERSIONE 2: i registri salvati con
   la finestra vecchia si rifanno da soli (la pagina Barcolana mostra comunque solo 8-18).
   Ogni casella = i 15 minuti che finiscono a quell'ora: vento medio, raffica
   massima e direzione media (nodi, gradi di provenienza).

   Da dove arriva lo storico:
    - Barcola: Windguru, medie a 5 minuti, via proxy Apps Script (?storicoBarcola=),
      perché Windguru respinge Cloudflare. Windguru tiene solo le ultime 2 settimane
      (provato il 2 ott 2026: c'era dal 18 settembre): oltre BARCOLA_GIORNI non si chiede,
      la colonna resta vuota e la media sul campo si fa con le altre tre.
    - Trieste molo, Muggia, boa Paloma: Protezione Civile FVG (stazioni 212, 500, 574),
      già a 15 minuti, per qualsiasi giorno. Sensori 5 direzione, 6 velocità, 7 raffica.
    - Monte Grisa: vetercek dà solo l'ultimo dato, quindi la registriamo noi dal payload
      (registraGrisa, chiave KV "grisa:<giorno>"): esiste solo dal 30 set 2026.
    - Boa Mambo: OGS, un dato all'ora, pubblicato con 1-2 ore di ritardo.
   Media sul campo: stessa formula della pagina (stimaVento al centro del percorso): media
   pesata 1/d² delle centraline a mare (Barcola, Trieste molo, Muggia, Paloma).

   Conservazione: "registro:<giorno>" in KV. Oggi si ricalcola ogni 5 minuti dal cron
   (6-19:30); un giorno passato si calcola alla prima richiesta e resta salvato.
   Scritture KV al giorno: ~290 payload + ~160 Monte Grisa + ~165 registro + 1-2 riepilogo (limite 1000). */
const REG_PRIMA = 6 * 60, REG_ULTIMA = 19 * 60, REG_PASSO = 15;
const REG_VERSIONE = 2;                                  // 1 = 8-18, 2 = 6-19
const REG_CRON_DA = '05:55', REG_CRON_A = '19:30';       // quando il cron tiene fresco il registro di oggi
const BARCOLA_GIORNI = 14;
const MS_IN_KT = 1.94384;
const PCFVG = 'https://monitor.protezionecivile.fvg.it/api/stations/';
const CAMPO = { lat: 45.662, lon: 13.705 };
const REG_STAZIONI = [
  { id: 'barcola',    nome: 'Barcola',      lat: 45.680,    lon: 13.754,    campo: true,  fonte: 'Windguru' },
  { id: 'trieste',    nome: 'Trieste molo', lat: 45.636806, lon: 13.750556, campo: true,  fonte: 'Protezione Civile della Regione Friuli Venezia Giulia (CC BY 4.0)', pc: 212 },
  { id: 'muggia',     nome: 'Muggia',       lat: 45.602,    lon: 13.768,    campo: true,  fonte: 'Protezione Civile della Regione Friuli Venezia Giulia (CC BY 4.0)', pc: 500 },
  { id: 'paloma',     nome: 'Boa Paloma',   lat: 45.619,    lon: 13.565,    campo: true,  fonte: 'Protezione Civile della Regione Friuli Venezia Giulia (CC BY 4.0)', pc: 574 },
  { id: 'monteGrisa', nome: 'Monte Grisa',  campo: false, fonte: 'Vetercek' },
  { id: 'mambo',      nome: 'Boa Mambo',    campo: false, fonte: 'OGS', oraria: true },
];
const CARDINALI = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5,
  SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

/* ---- orari: tutto il registro è in ora locale di Trieste ---- */
const fmtRoma = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function roma(ms) {
  const p = {};
  fmtRoma.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  const h = p.hour === '24' ? '00' : p.hour;
  return { giorno: p.year + '-' + p.month + '-' + p.day, hhmm: h + ':' + p.minute, min: Number(h) * 60 + Number(p.minute) };
}
function romaInUtc(giorno, min) {           // giorno + minuti dalla mezzanotte locale -> ms UTC
  const [y, m, d] = giorno.split('-').map(Number);
  const prova = Date.UTC(y, m - 1, d, 0, min);
  const r = roma(prova), [ry, rm, rd] = r.giorno.split('-').map(Number);
  return prova - (Date.UTC(ry, rm - 1, rd, 0, r.min) - prova);
}
const hhmm = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
const giornoValido = g => /^\d{4}-\d{2}-\d{2}$/.test(g) && !isNaN(Date.parse(g + 'T12:00:00Z')) && g >= '2020-01-01';
const sposta = (g, n) => new Date(Date.parse(g + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const r1 = v => Math.round(v * 10) / 10;

/* campioni [{ min, kt, raffica, deg }] -> una casella per quarto d'ora:
   [vento medio, raffica massima, direzione media] dei 15 minuti che finiscono a quell'ora */
function inQuarti(campioni) {
  const out = [];
  for (let fine = REG_PRIMA; fine <= REG_ULTIMA; fine += REG_PASSO) {
    const c = campioni.filter(x => x.min > fine - REG_PASSO && x.min <= fine && typeof x.kt === 'number' && !isNaN(x.kt));
    if (!c.length) { out.push(null); continue; }
    let sk = 0, g = null, sx = 0, sy = 0;
    c.forEach(x => {
      sk += x.kt;
      if (typeof x.raffica === 'number' && !isNaN(x.raffica)) g = g == null ? x.raffica : Math.max(g, x.raffica);
      if (typeof x.deg === 'number' && !isNaN(x.deg)) { const w = Math.max(x.kt, .5); sx += w * Math.sin(x.deg * Math.PI / 180); sy += w * Math.cos(x.deg * Math.PI / 180); }
    });
    out.push([r1(sk / c.length), g == null ? null : r1(g), (sx || sy) ? Math.round((Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360) : null]);
  }
  return out;
}

async function getJson(url, ms) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms || 15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* Barcola: campioni Windguru a 5 minuti. 0/0 = anemometro fermo (come sul sito), si salta. */
async function campioniBarcola(giorno) {
  const j = await leggiProxy('storicoBarcola=' + giorno, d => d && Array.isArray(d.unixtime));
  const out = [];
  j.unixtime.forEach((u, i) => {
    const t = roma(u * 1000), avg = Number(j.wind_avg[i]), max = Number(j.wind_max[i]);
    if (t.giorno !== giorno || isNaN(avg) || (avg === 0 && !(max > 0))) return;
    out.push({ min: t.min, kt: avg, raffica: isNaN(max) ? null : max, deg: typeof j.wind_direction[i] === 'number' ? j.wind_direction[i] : null });
  });
  return out;
}

/* Protezione Civile FVG: una richiesta per sensore, orari UTC, velocità in m/s */
async function campioniPcfvg(stazione, giorno) {
  const fmt = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const q = '&from=' + encodeURIComponent(fmt(romaInUtc(giorno, REG_PRIMA - REG_PASSO))) + '&to=' + encodeURIComponent(fmt(romaInUtc(giorno, REG_ULTIMA)));
  const [vel, raf, dir] = await Promise.all([6, 7, 5].map(s => getJson(PCFVG + stazione + '/measures?sensor_id=' + s + q)));
  const per = {};
  [['kt', vel, MS_IN_KT], ['raffica', raf, MS_IN_KT], ['deg', dir, 1]].forEach(([k, j, f]) => {
    (j.measures || []).forEach(m => { if (typeof m.value === 'number') (per[m.dt] = per[m.dt] || {})[k] = m.value * f; });
  });
  return Object.keys(per).map(dt => {
    const t = roma(Date.parse(dt.replace(' ', 'T') + 'Z'));
    return t.giorno === giorno ? Object.assign({ min: t.min }, per[dt]) : null;
  }).filter(Boolean);
}

async function campioniMambo(giorno) {
  const da = new Date(romaInUtc(giorno, REG_PRIMA - REG_PASSO)).toISOString(), a = new Date(romaInUtc(giorno, REG_ULTIMA)).toISOString();
  const url = 'https://nodc.ogs.it/erddap/tabledap/MAMBO1_TS.json?' + encodeURIComponent('time,WSPD,GSPD,WDIR') +
    '&' + encodeURIComponent('time>=' + da) + '&' + encodeURIComponent('time<=' + a) + '&' + encodeURIComponent('WSPD!=NaN');
  let j;
  try { j = await getJson(url, 20000); }
  catch (e) { if (/HTTP 404/.test(String(e))) return []; throw e; }   // ERDDAP: 404 = nessuna riga
  return j.table.rows.map(r => {
    const t = roma(Date.parse(r[0]));
    return t.giorno === giorno ? { min: t.min, kt: r[1] * MS_IN_KT, raffica: r[2] == null ? null : r[2] * MS_IN_KT, deg: typeof r[3] === 'number' ? r[3] : null } : null;
  }).filter(Boolean);
}

/* Monte Grisa: a ogni payload nuovo salvo le righe di oggi (finestra del registro) */
async function registraGrisa(env, payload) {
  const righe = Array.isArray(payload.monteGrisa) ? payload.monteGrisa : [];
  const adesso = roma(Date.now());
  const chiave = 'grisa:' + adesso.giorno;
  const nuove = {};
  righe.forEach(r => {
    const m = String(r.ora || '').match(/^(\d{1,2}):(\d{2})/), kt = parseFloat(r.kt);
    if (!m || isNaN(kt)) return;
    const min = Number(m[1]) * 60 + Number(m[2]);
    // solo oggi (un orario "nel futuro" è di ieri) e solo la finestra del registro
    if (min > adesso.min + 5 || min <= REG_PRIMA - REG_PASSO || min > REG_ULTIMA) return;
    const deg = CARDINALI[String(r.direzione || '').toUpperCase().trim()];
    const raf = parseFloat(r.sunki);
    nuove[hhmm(min)] = [kt, isNaN(raf) ? null : raf, deg === undefined ? null : deg];
  });
  if (!Object.keys(nuove).length) return;
  const salvate = (await env.DATI.get(chiave, { type: 'json' })) || {};
  let cambiato = false;
  Object.keys(nuove).forEach(k => { if (!salvate[k]) { salvate[k] = nuove[k]; cambiato = true; } });
  if (cambiato) await env.DATI.put(chiave, JSON.stringify(salvate));
}
async function campioniGrisa(env, giorno) {
  const salvate = (await env.DATI.get('grisa:' + giorno, { type: 'json' })) || {};
  return Object.keys(salvate).map(k => {
    const [h, m] = k.split(':').map(Number), v = salvate[k];
    return { min: h * 60 + m, kt: v[0], raffica: v[1], deg: v[2] };
  });
}

function distNm(a, b) {
  const dy = (b.lat - a.lat) * 60, dx = (b.lon - a.lon) * 60 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
  return Math.hypot(dx, dy);
}
/* media sul campo di regata per ogni quarto d'ora: come stimaVento() della pagina */
function mediaCampo(serie) {
  const mare = REG_STAZIONI.filter(s => s.campo).map(s => ({ dati: serie[s.id], w: 1 / Math.pow(Math.max(distNm(CAMPO, s), 0.4), 2) }));
  const n = (REG_ULTIMA - REG_PRIMA) / REG_PASSO + 1, out = [];
  for (let i = 0; i < n; i++) {
    let sw = 0, sk = 0, sg = 0, sgw = 0, sx = 0, sy = 0;
    mare.forEach(s => {
      const v = s.dati && s.dati[i];
      if (!v) return;
      sw += s.w; sk += s.w * v[0];
      if (v[1] != null) { sg += s.w * v[1]; sgw += s.w; }
      if (v[2] != null) { const wv = s.w * Math.max(v[0], 1); sx += wv * Math.sin(v[2] * Math.PI / 180); sy += wv * Math.cos(v[2] * Math.PI / 180); }
    });
    out.push(sw ? [r1(sk / sw), sgw ? r1(sg / sgw) : null, (sx || sy) ? Math.round((Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360) : null] : null);
  }
  return out;
}

async function costruisciRegistro(env, giorno) {
  const adesso = roma(Date.now());
  const slot = [];
  for (let m = REG_PRIMA; m <= REG_ULTIMA; m += REG_PASSO) slot.push(hhmm(m));
  const errori = {};
  const prova = (id, p) => p.catch(e => { errori[id] = String(e).slice(0, 120); return []; });
  const vuoto = giorno > adesso.giorno;
  const giorniFa = (Date.parse(adesso.giorno + 'T12:00:00Z') - Date.parse(giorno + 'T12:00:00Z')) / 864e5;
  const senzaBarcola = giorniFa > BARCOLA_GIORNI;       // Windguru non ce l'ha più: non è un errore
  const campioni = vuoto ? [] : await Promise.all(REG_STAZIONI.map(s =>
    s.id === 'barcola' ? (senzaBarcola ? [] : prova(s.id, campioniBarcola(giorno))) :
    s.pc ? prova(s.id, campioniPcfvg(s.pc, giorno)) :
    s.id === 'mambo' ? prova(s.id, campioniMambo(giorno)) :
    prova(s.id, campioniGrisa(env, giorno))));
  const serie = {};
  REG_STAZIONI.forEach((s, i) => { serie[s.id] = vuoto ? slot.map(() => null) : inQuarti(campioni[i]); });
  // giorno chiuso: dopo le 21:30 (Mambo arriva in ritardo) o un giorno passato, e senza fonti in errore
  const chiuso = giorno < adesso.giorno || (giorno === adesso.giorno && adesso.hhmm >= '21:30');
  return {
    giorno, versione: REG_VERSIONE, passo: REG_PASSO, fuso: 'Europe/Rome', slot,
    serie: [{ id: 'campo', nome: 'Campo di regata', fonte: 'media pesata delle centraline a mare', dati: mediaCampo(serie) }]
      .concat(REG_STAZIONI.map(s => ({ id: s.id, nome: s.nome, fonte: s.fonte, oraria: !!s.oraria, dati: serie[s.id] }))),
    errori: Object.keys(errori).length ? errori : undefined,
    senza: senzaBarcola ? ['barcola'] : undefined,
    completo: chiuso && !Object.keys(errori).length,
    aggiornato: new Date().toISOString(),
  };
}
async function salvaRegistro(env, reg) {
  await env.DATI.put('registro:' + reg.giorno, JSON.stringify(reg), { metadata: { aggiornato: reg.aggiornato, completo: reg.completo } });
}
/* registro di un giorno: da KV se definitivo o abbastanza fresco, altrimenti ricalcolato */
async function registro(env, ctx, giorno) {
  const adesso = roma(Date.now());
  if (giorno > adesso.giorno) return costruisciRegistro(env, giorno);        // futuro: vuoto, non si salva
  const salvato = await env.DATI.get('registro:' + giorno, { type: 'json', cacheTtl: 60 });
  if (salvato && salvato.versione === REG_VERSIONE) {
    const eta = (Date.now() - Date.parse(salvato.aggiornato)) / 60000;
    // oggi nella finestra del cron lo tiene fresco il cron; fuori da lì (o giorno con fonti in errore) si ricalcola ogni 30 min
    const max = salvato.completo ? Infinity : (giorno === adesso.giorno && adesso.hhmm >= REG_CRON_DA && adesso.hhmm <= REG_CRON_A) ? 7 : 30;
    if (eta <= max) return salvato;
  }
  try {
    const reg = await costruisciRegistro(env, giorno);
    ctx.waitUntil(salvaRegistro(env, reg));
    return reg;
  } catch (e) {
    if (salvato) return salvato;
    throw e;
  }
}

/* ===================== RIEPILOGO: GIORNATE SURFABILI =====================
   Richiesto da Alberto (2 ott 2026): sopra la tabella del registro un grafico giorno per
   giorno con media e raffica massima, e il conto delle giornate surfabili del mese.
   Giornata surfabile = la media sul campo (la prima colonna del registro) sopra i 15 nodi
   per almeno 6 ore dei quarti d'ora 6-19. Le 6 ore le applica la pagina (registro-vento.js),
   qui solo i numeri.

   KV "riepilogo" = { giorni: { "YYYY-MM-DD": { v, n, m, r, rs, q, d, sb, p } } }
     v = REG_VERSIONE con cui è stato fatto (diverso = si rifà),
     n = quarti d'ora con un dato (su 53), m = media della giornata (nodi, 1 decimale),
     r = raffica massima della giornata: il picco più alto delle centraline a mare (nodi),
     rs = la centralina dove l'ha fatto (barcola, trieste, muggia, paloma),
     q = quarti d'ora con la media sopra RIEP_SOGLIA (24 = 6 ore),
     d = direzione prevalente (gradi, media vettoriale pesata sul vento),
     sb = 1 senza Barcola (oltre le 2 settimane di Windguru), p = 1 con una centralina a mare
     mancata. Un giorno con una centralina a mare in errore resta { e: tentativi, t: ms }
     e si riprova dopo 20 minuti; al 4° tentativo si tiene la media delle altre (p = 1).
   Lo riempie il cron (completaRiepilogo) dal 1° settembre 2026 a ieri: i giorni già nel
   registro salvato si leggono e basta, al massimo UN giorno da ricostruire per giro (limite
   di 50 sottorichieste del piano gratuito). Ogni giorno nuovo entra dopo mezzanotte, quando
   Windguru ha ancora Barcola: è così che lo storico resta completo. */
const RIEP_DAL = '2026-09-01';
const RIEP_CHIAVE = 'riepilogo';
const RIEP_RIPROVA_MS = 20 * 60000, RIEP_TENTATIVI = 3, RIEP_LETTI = 8;
const RIEP_SOGLIA = 15;
// giorno già fatto con la finestra e i campi di adesso (gli altri si rifanno)
const riepFatto = x => !!x && !x.e && x.v === REG_VERSIONE;

function sintesiGiorno(reg) {
  const campo = reg.serie[0].dati.filter(Boolean);
  const out = { v: REG_VERSIONE, n: campo.length };
  if (campo.length) {
    let sx = 0, sy = 0;
    campo.forEach(v => { if (v[2] != null) { sx += v[0] * Math.sin(v[2] * Math.PI / 180); sy += v[0] * Math.cos(v[2] * Math.PI / 180); } });
    out.m = r1(campo.reduce((a, v) => a + v[0], 0) / campo.length);
    if (sx || sy) out.d = Math.round((Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360);
  }
  // raffica: il picco più alto della giornata tra le centraline a mare
  reg.serie.forEach(sr => {
    if (!REG_STAZIONI.some(s => s.id === sr.id && s.campo)) return;
    sr.dati.forEach(v => { if (v && v[1] != null && !(out.r >= v[1])) { out.r = v[1]; out.rs = sr.id; } });
  });
  out.q = campo.filter(v => v[0] > RIEP_SOGLIA).length;
  if (reg.senza && reg.senza.indexOf('barcola') !== -1) out.sb = 1;
  return out;
}
// contano solo le centraline che entrano nella media sul campo (Mambo o Monte Grisa no)
const erroriMare = reg => Object.keys(reg.errori || {}).filter(id => REG_STAZIONI.some(s => s.id === id && s.campo));

async function completaRiepilogo(env) {
  const ieri = sposta(roma(Date.now()).giorno, -1), ora = Date.now();
  const riep = (await env.DATI.get(RIEP_CHIAVE, { type: 'json' })) || { giorni: {} };
  let letti = 0, costruito = false, fatti = 0;
  for (let g = RIEP_DAL; g <= ieri && letti < RIEP_LETTI; g = sposta(g, 1)) {
    const prima = riep.giorni[g];
    if (riepFatto(prima) || (prima && prima.e && ora - prima.t <= RIEP_RIPROVA_MS)) continue;
    letti++;
    let reg = await env.DATI.get('registro:' + g, { type: 'json' });
    if (!reg || !reg.completo || reg.versione !== REG_VERSIONE) {
      if (costruito) continue;
      costruito = true;
      reg = await costruisciRegistro(env, g);
      await salvaRegistro(env, reg);
    }
    const err = erroriMare(reg), tentativi = (prima && prima.e) || 0;
    riep.giorni[g] = (err.length && tentativi < RIEP_TENTATIVI) ? { e: tentativi + 1, t: ora } :
      Object.assign(sintesiGiorno(reg), err.length ? { p: 1 } : {});
    fatti++;
  }
  if (fatti) await env.DATI.put(RIEP_CHIAVE, JSON.stringify(riep));
  return fatti + ' giorni';
}

/* per la pagina: i giorni fatti (senza i campi interni) e quanti mancano ancora */
async function riepilogo(env) {
  const riep = (await env.DATI.get(RIEP_CHIAVE, { type: 'json', cacheTtl: 60 })) || { giorni: {} };
  const ieri = sposta(roma(Date.now()).giorno, -1), giorni = {};
  let mancanti = 0;
  for (let g = RIEP_DAL; g <= ieri; g = sposta(g, 1)) {
    const x = riep.giorni[g];
    if (!riepFatto(x)) mancanti++;
    if (x && !x.e) giorni[g] = x;
  }
  return { dal: RIEP_DAL, fino: ieri, giorni, mancanti, aggiornato: new Date().toISOString() };
}

function json(obj, extra) {
  return new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...(extra || {}) },
  });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const esito = await aggiorna(env).catch(err => { console.warn('aggiorna: ' + err); return 'errore'; });
      // un passo del riepilogo solo a minuti pari e quando il payload non è cambiato (cioè
      // senza il registro di oggi da ricostruire): così si resta sotto le 50 sottorichieste
      if (esito === 'invariato' && new Date(event.scheduledTime).getUTCMinutes() % 2 === 0) {
        await completaRiepilogo(env).catch(err => console.warn('riepilogo: ' + err));
      }
    })());
  },

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const indirizzo = new URL(request.url), params = indirizzo.searchParams;

    if (indirizzo.pathname === '/registro') {
      const giorno = params.get('giorno') || roma(Date.now()).giorno;
      if (!giornoValido(giorno)) return json({ errore: 'giorno non valido (YYYY-MM-DD)' });
      try {
        return json(await registro(env, ctx, giorno), { 'Cache-Control': 'public, max-age=60' });
      } catch (err) {
        return json({ giorno, errore: 'registro non disponibile: ' + err });
      }
    }

    if (indirizzo.pathname === '/riepilogo') {
      try {
        return json(await riepilogo(env), { 'Cache-Control': 'public, max-age=300' });
      } catch (err) {
        return json({ errore: 'riepilogo non disponibile: ' + err });
      }
    }

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
