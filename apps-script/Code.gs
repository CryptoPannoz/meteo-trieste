/**
 * Meteo Trieste Proxy
 * Legge i dati delle centraline da vetercek.com e li espone come JSON
 * per la pagina https://github.com/CryptoPannoz/meteo-trieste
 *
 * Endpoint: doGet -> { monteGrisa: [...], muggia: [...], updated: ISO }
 * Ogni riga: { ora, direzione, kt, sunki, temp }
 */

var STATIONS = {
  monteGrisa: 'montegrisa',
  muggia: 'muggia'
};

var MAX_ROWS = 6;

function doGet() {
  var out = {};
  for (var key in STATIONS) {
    try {
      out[key] = scrapeStation(STATIONS[key]);
    } catch (e) {
      out[key] = [];
      out[key + 'Error'] = String(e);
    }
  }
  out.updated = new Date().toISOString();
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function scrapeStation(postaja) {
  var url = 'https://vetercek.com/danes/index.php?postaja=' + postaja;
  var html = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true }).getContentText();

  var tableMatch = html.match(/<table[\s\S]*?<\/table>/);
  if (!tableMatch) throw new Error('Tabella non trovata per ' + postaja);

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
