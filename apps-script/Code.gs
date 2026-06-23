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

function doGet() {
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

  var responses = UrlFetchApp.fetchAll(requests);

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
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
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
