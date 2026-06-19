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
  monteGrisa: { postaja: 'montegrisa' },
  muggia:     { postaja: 'muggia' },
  preluka:    { id: 149, postaja: 'preluka' },
  dajla:      { id: 39,  postaja: 'dajla' },
  liznjan:    { id: 74,  postaja: 'liznjan' },
  savudrija:  { id: 124, postaja: 'savudrija' },
  premantura: { id: 86,  postaja: 'stupice' }
};

var BARCOLA_URL = 'https://www.windguru.cz/int/iapi.php?q=station_data_current&id_station=5307';
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
  // ultima richiesta: stazione Windguru di Barcola (richiede Referer windguru.cz)
  requests.push({ url: BARCOLA_URL, headers: { Referer: 'https://www.windguru.cz/station/5307' }, muteHttpExceptions: true });

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

/** Test manuale dall'editor */
function test() {
  Logger.log(doGet().getContent());
}
