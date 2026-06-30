/**
 * Meteo Trieste Proxy
 * Legge i dati delle centraline da vetercek.com e li espone come JSON
 * per la pagina https://github.com/CryptoPannoz/meteo-trieste
 *
 * Endpoint: doGet -> { monteGrisa, muggia, preluka, dajla, liznjan, savudrija, barcola, updated }
 * Ogni riga centralina: { ora, direzione, kt, sunki, temp }
 * barcola: dati correnti stazione Windguru 5307 (Terrapieno di Barcola)
 *
 * Le richieste vengono fatte in parallelo con UrlFetchApp.fetchAll.
 * Alcuni spot dell'Istria richiedono il parametro id (senza, vetercek
 * restituisce la stazione sbagliata).
 */

var STATIONS = {
  monteGrisa:  { postaja: 'montegrisa' },
  muggia:      { postaja: 'muggia' },
  marinajulia: { id: 91, postaja: 'monfalcone4' },
  zusterna:   { id: 147, postaja: 'kjdbum' },
  preluka:    { id: 149, postaja: 'preluka' },
  dajla:      { id: 39,  postaja: 'dajla' },
  liznjan:    { id: 74,  postaja: 'liznjan' },
  savudrija:  { id: 124, postaja: 'savudrija' },
  premantura: { id: 86,  postaja: 'stupice' }
};

var BARCOLA_URL = 'https://www.windguru.cz/int/iapi.php?q=station_data_current&id_station=5307';
var OSMER_URL = 'https://www.osmer.fvg.it/previsioni.php?ln=';
// Boa oceanografica Vida (NIB, Pirano): pagina dati leggera (solo blocco <pre>)
var PIRAN_URL = 'https://www.nib.si/mbp/en/oceanographic-data-and-measurements/buoy-2/live-data-2?tmpl=component';
var MAX_ROWS = 10;

function stationUrl(s) {
  var q = (s.id ? 'id=' + s.id + '&' : '') + 'postaja=' + s.postaja;
  return 'https://vetercek.com/danes/index.php?' + q;
}

/* Serie giornaliera delle visite da GoatCounter (ultimi 30 giorni).
   La API key sta nelle Script Properties (GC_API_KEY), mai nel repo.
   Risultato in cache 3h per non chiamare l'API a ogni richiesta. */
function fetchGoatViews() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('gc_views');
  if (cached) return JSON.parse(cached);

  var key = PropertiesService.getScriptProperties().getProperty('GC_API_KEY');
  if (key) key = key.trim();
  if (!key) return { series: [], error: 'no_key' };

  var end = new Date();
  function fmt(d) { return d.toISOString().slice(0, 10); }
  // GoatCounter dà 404 se lo start è troppo indietro (oltre il limite/retention).
  // Provo range via via più stretti e tengo il primo che risponde 200: così parte
  // "dall'inizio" entro il massimo consentito. Gli zeri iniziali li tolgo dopo.
  var giorni = [365, 180, 120, 90, 45];
  var data = null, lastErr = '';
  for (var i = 0; i < giorni.length; i++) {
    var start = new Date(end.getTime() - giorni[i] * 24 * 3600 * 1000);
    var url = 'https://ventotrieste.goatcounter.com/api/v0/stats/total'
            + '?start=' + fmt(start) + '&end=' + fmt(end);
    try {
      var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) { data = JSON.parse(resp.getContentText()); break; }
      lastErr = 'http_' + resp.getResponseCode();
    } catch (err) { lastErr = String(err); }
  }
  if (!data) return { series: [], error: lastErr || 'fail' };

  var series = (data.stats || []).map(function (s) { return { d: s.day, n: s.daily || 0 }; });
  while (series.length && series[0].n === 0) series.shift(); // zeri iniziali → parte dai dati reali
  var somma = series.reduce(function (a, b) { return a + b.n; }, 0);
  var out = { series: series, total: (data.total != null ? data.total : somma) };
  cache.put('gc_views', JSON.stringify(out), 3 * 3600);
  return out;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // Endpoint separato per il grafico visite (GoatCounter), cache 3h, key server-side.
  if (e && e.parameter && e.parameter.views) {
    return jsonOut(fetchGoatViews());
  }
  // Qualsiasi imprevisto deve comunque restituire JSON: se doGet lancia, Apps Script
  // risponde con una pagina HTML d'errore (HTTP 200) che il frontend non sa parsare,
  // e l'intera pagina finisce in "Dati non disponibili".
  try {
    return jsonOut(buildData());
  } catch (fatal) {
    return jsonOut({ fatal: String(fatal), updated: new Date().toISOString() });
  }
}

function buildData() {
  var out = {};
  var keys = Object.keys(STATIONS);

  var requests = keys.map(function (k) {
    return { url: stationUrl(STATIONS[k]), muteHttpExceptions: true, followRedirects: true };
  });
  // penultima: stazione Windguru di Barcola (richiede Referer windguru.cz)
  requests.push({ url: BARCOLA_URL, headers: { Referer: 'https://www.windguru.cz/station/5307' }, muteHttpExceptions: true });
  // penultima+1: bollettino testuale OSMER FVG
  requests.push({ url: OSMER_URL, muteHttpExceptions: true, followRedirects: true });
  // ultima: boa Vida NIB (Pirano). nib.si invia una catena cert incompleta -> disattivo la validazione
  requests.push({ url: PIRAN_URL, muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false });

  var responses = fetchAllResilient(requests);

  keys.forEach(function (k, i) {
    try {
      out[k] = parseStation(responses[i].getContentText(), k);
    } catch (e) {
      out[k] = [];
      out[k + 'Error'] = String(e);
    }
  });

  try {
    var b = JSON.parse(responses[keys.length].getContentText());
    if (!b || b['return'] === 'error') throw new Error(b && b.message ? b.message : 'risposta non valida');
    out.barcola = b;
  } catch (e) {
    out.barcola = null;
    out.barcolaError = String(e);
  }

  try {
    out.osmer = parseOsmer(responses[keys.length + 1].getContentText());
  } catch (e) {
    out.osmer = [];
    out.osmerError = String(e);
  }

  try {
    out.piran = parsePiran(responses[keys.length + 2].getContentText());
  } catch (e) {
    out.piran = null;
    out.piranError = String(e);
  }

  out.updated = new Date().toISOString();
  return out;
}

/* ---------- fetch resiliente -------------------------------------------------
   UrlFetchApp.fetchAll è ATOMICA: se anche una sola URL è irraggiungibile a
   livello di rete (DNS/connessione/timeout — NON un codice HTTP, quelli li
   assorbe muteHttpExceptions) l'INTERO batch lancia eccezione. Senza protezione
   una sola fonte morta (es. vetercek.com giù) annienta tutta la risposta,
   comprese le fonti sane (Barcola/OSMER/boa). Qui isoliamo il guasto al singolo
   host: le fonti sane rispondono comunque, solo quelle morte restano vuote. */
function fetchAllResilient(requests) {
  try {
    return UrlFetchApp.fetchAll(requests);            // happy path: un'unica batch parallela
  } catch (batchErr) {
    var out = new Array(requests.length);
    var badHost = hostFromMessage(String(batchErr));  // l'eccezione cita l'URL colpevole
    var retry = [];
    requests.forEach(function (req, i) {
      if (badHost && hostOf(req.url) === badHost) out[i] = errorResponse(String(batchErr));
      else retry.push(i);
    });
    if (retry.length === requests.length) {
      // host non identificabile dal messaggio: degrado per gruppi-host (termina sempre)
      return fetchByHostGroup(requests);
    }
    if (retry.length) {
      try {
        var res = UrlFetchApp.fetchAll(retry.map(function (i) { return requests[i]; }));
        retry.forEach(function (i, j) { out[i] = res[j]; });
      } catch (e2) {                                   // un secondo host è giù
        var rest = fetchByHostGroup(retry.map(function (i) { return requests[i]; }));
        retry.forEach(function (i, j) { out[i] = rest[j]; });
      }
    }
    return out;
  }
}

/* Ritenta ogni host in un batch separato: un host morto fallisce solo il proprio
   gruppo, gli altri rispondono. Le URL di uno stesso host condividono la sorte
   (se l'host è giù sono giù tutte), quindi un solo batch per host. */
function fetchByHostGroup(requests) {
  var out = new Array(requests.length), groups = {};
  requests.forEach(function (req, i) {
    var h = hostOf(req.url);
    (groups[h] = groups[h] || []).push(i);
  });
  Object.keys(groups).forEach(function (h) {
    var idx = groups[h];
    try {
      var res = UrlFetchApp.fetchAll(idx.map(function (i) { return requests[i]; }));
      idx.forEach(function (i, j) { out[i] = res[j]; });
    } catch (groupErr) {
      idx.forEach(function (i) { out[i] = errorResponse(String(groupErr)); });
    }
  });
  return out;
}

function hostOf(url) {
  var m = String(url).match(/^https?:\/\/([^\/]+)/i);
  return m ? m[1].toLowerCase() : String(url);
}
function hostFromMessage(msg) {
  var m = msg.match(/https?:\/\/([^\/\s"')]+)/i);
  return m ? m[1].toLowerCase() : null;
}
/* Risposta-fantoccio per una richiesta fallita: imita l'interfaccia di
   HTTPResponse ma lancia se letta, così i try/catch a valle la trattano come le
   altre fonti rotte (out[k] = [] + ...Error). */
function errorResponse(msg) {
  return {
    getContentText: function () { throw new Error(msg); },
    getResponseCode: function () { return 0; }
  };
}

function parseStation(html, label) {
  var tableMatch = html.match(/<table[\s\S]*?<\/table>/);
  if (!tableMatch) throw new Error('Tabella non trovata per ' + label);

  var rows = [];
  var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  var tr;
  while ((tr = trRe.exec(tableMatch[0])) !== null && rows.length < MAX_ROWS + 1) {
    var cells = [];
    var tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    var td;
    while ((td = tdRe.exec(tr[1])) !== null) {
      cells.push(td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    }
    rows.push(cells);
  }

  // riga 0 = intestazione (nome stazione, smer, vel, sunki, tmp, ...)
  return rows.slice(1).map(function (c) {
    return {
      ora: c[0] || '-',
      direzione: c[1] || '-',
      kt: c[2] || '-',
      sunki: c[3] || '-',
      temp: c[4] || '-'
    };
  });
}

/* Bollettino OSMER FVG: estrae i pannelli oggi/domani/dopodomani con il testo descrittivo */
function parseOsmer(html) {
  var out = [];
  var giorni = { oggi: 1, domani: 1, dopodomani: 1 };
  var re = /panel-heading">([^<]+)<\/div>([\s\S]*?)(?=panel-heading">|$)/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var titolo = m[1].trim().toLowerCase();
    if (!giorni[titolo]) continue;
    var blocco = m[2];
    var t = blocco.match(/text-justify sipadd">([\s\S]*?)<\/div>/);
    if (!t) continue;
    var dm = blocco.match(/<strong>([^<]+)<\/strong>/);
    out.push({
      giorno: titolo,
      data: dm ? decodeEnt(dm[1].trim()) : '',
      testo: decodeEnt(t[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
    });
  }
  return out;
}

/* Boa Vida (NIB Pirano): estrae i valori live dal blocco <pre> della pagina.
   Vento e raffica sono in m/s; la conversione in nodi avviene nel frontend. */
function parsePiran(html) {
  function val(re) { var m = html.match(re); return m ? m[1] : null; }
  function num(re) { var v = val(re); return v == null ? null : parseFloat(v); }
  var d = {
    time:     val(/Date and time:<\/b>\s*([\d:\s-]+?)\s*\(/),
    airTemp:  num(/Air:<\/b>[\s\S]*?Temperature:\s*([\d.]+)/),
    wind:     num(/Wind speed:\s*([\d.]+)/),        // m/s
    gust:     num(/Wind gust up to:\s*([\d.]+)/),   // m/s
    dir:      num(/Wind direction:\s*([\d.]+)/),
    seaTemp:  num(/Temperature at the sea surface \(depth 2\.5 m\):\s*([\d.]+)/),
    salinity: num(/Salinity at the sea surface \(depth 2\.5 m\):\s*([\d.]+)/),
    waveH:    num(/Wave height:\s*([\d.]+)/),
    wavePer:  num(/Mean period:\s*([\d.]+)/)
  };
  if (d.wind == null && d.airTemp == null && d.seaTemp == null) {
    throw new Error('Nessun dato boa NIB trovato');
  }
  return d;
}

function decodeEnt(s) {
  return s
    .replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é')
    .replace(/&igrave;/g, 'ì').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
    .replace(/&ccedil;/g, 'ç').replace(/&deg;/g, '°').replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** Test manuale dall'editor */
function test() {
  Logger.log(doGet().getContent());
}
