/**
 * Vento Trieste — sostenitori automatici da PayPal (20 ott 2026).
 *
 * Alberto: "ogni volta che mi arriva una donazione PayPal viene inserito automaticamente
 * tra i donatori... tutta automatica: ogni pagamento 'Hai ricevuto denaro' finisce
 * direttamente tra i sostenitori".
 *
 * Come funziona: PayPal manda un'email (assistenza@paypal.it, oggetto "Hai ricevuto
 * denaro") con il nome di chi paga: "Ciao Libero Professionista Carlo Valle ti ha inviato
 * 5,00 € EUR". Questa web app legge quelle email (Gmail in SOLA LETTURA, nessuna modifica
 * alla casella), ne ricava i nomi e li restituisce come JSON; footer-widgets.js li
 * aggiunge in coda all'elenco scritto a mano.
 *
 *   GET ?           → { sostenitori: ["Nome Cognome", …], aggiornato, dal }
 *   GET ?diag=1     → in più: email lette, ultimo errore
 *
 * Solo i nomi escono da qui: niente importi, email o date dei pagamenti.
 * Gmail si rilegge al massimo ogni AGGIORNA_MIN minuti, alla prima richiesta che arriva
 * dopo (niente trigger: il budget dei trigger del conto lo usa il proxy dei dati).
 *
 * DAL: prima di questa data l'elenco è quello scritto a mano in footer-widgets.js
 * (l'ultimo è Carlo Valle, 15 ott 2026). Le email più vecchie non si leggono: prima di
 * fine giugno 2026 "Hai ricevuto denaro" erano pagamenti che non c'entrano col sito.
 *
 * Togliere qualcuno senza toccare il codice: editor → ⚙️ Impostazioni progetto →
 * Proprietà script → "esclusi" = nomi separati da virgola (maiuscole e accenti non contano).
 *
 * Deploy: vedi README.md in questa cartella.
 */

var DAL = '2026-10-16T00:00:00+02:00';
var AGGIORNA_MIN = 15;
var QUERY = 'from:assistenza@paypal.it subject:"Hai ricevuto denaro"';
var ESCLUSI_FISSI = ['alberto broggi'];       // giroconti dal proprio conto
var MAX_LETTURE = 60;                         // email nuove lette per giro, al massimo

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var ultimo = Number(props.getProperty('aggiornato')) || 0;
  if (Date.now() - ultimo > AGGIORNA_MIN * 60000) {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(2000)) {
      try { aggiorna(); } finally { lock.releaseLock(); }
    }
  }
  var out = { sostenitori: elenco(), aggiornato: new Date(Number(props.getProperty('aggiornato')) || 0).toISOString(), dal: DAL.slice(0, 10) };
  if (e && e.parameter && e.parameter.diag) {
    out.emailLette = Object.keys(props.getProperties()).filter(function (k) { return k.indexOf('m_') === 0; }).length;
    out.errore = props.getProperty('errore') || null;
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* Legge le email PayPal nuove e salva per ognuna "m_<id>" = [nome, ms]. Il momento del
   tentativo si segna subito: se Gmail non risponde (o l'autorizzazione è stata revocata)
   si riprova tra AGGIORNA_MIN minuti, non a ogni visita. */
function aggiorna() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('aggiornato', String(Date.now()));
  try {
    var dopo = Math.floor(Date.parse(DAL) / 1000);
    var gia = props.getProperties(), nuovi = {}, letture = 0, pagina = null;
    do {
      var r = Gmail.Users.Messages.list('me', { q: QUERY + ' after:' + dopo, maxResults: 100, pageToken: pagina });
      (r.messages || []).forEach(function (m) {
        if (gia['m_' + m.id] != null || letture >= MAX_LETTURE) return;
        letture++;
        var msg = Gmail.Users.Messages.get('me', m.id, { format: 'minimal' });
        nuovi['m_' + m.id] = JSON.stringify([nomeDa(msg.snippet), Number(msg.internalDate) || 0]);
      });
      pagina = r.nextPageToken;
    } while (pagina && letture < MAX_LETTURE);
    if (Object.keys(nuovi).length) props.setProperties(nuovi);
    props.deleteProperty('errore');
  } catch (err) {
    props.setProperty('errore', new Date().toISOString() + ' ' + String(err).slice(0, 300));
    console.warn('aggiorna: ' + err);
  }
}

/* Nomi in ordine di arrivo, senza doppioni (chi dona due volte compare una volta) né esclusi. */
function elenco() {
  var tutte = PropertiesService.getScriptProperties().getProperties();
  var esclusi = ESCLUSI_FISSI.concat(String(tutte.esclusi || '').split(',')).map(chiave);
  var righe = [];
  Object.keys(tutte).forEach(function (k) {
    if (k.indexOf('m_') !== 0) return;
    try { var v = JSON.parse(tutte[k]); if (v[0]) righe.push(v); } catch (e) {}
  });
  righe.sort(function (a, b) { return a[1] - b[1]; });
  var visti = {}, nomi = [];
  righe.forEach(function (v) {
    var c = chiave(v[0]);
    if (!c || visti[c] || esclusi.indexOf(c) !== -1) return;
    visti[c] = true;
    nomi.push(v[0]);
  });
  return nomi;
}

/* "Libero Professionista, hai ricevuto 5,00 € EUR. Ciao Libero Professionista Carlo Valle
   ti ha inviato 5,00 € EUR …": il saluto ripete il nome del conto, che si toglie. */
function nomeDa(snippet) {
  var s = decodifica(snippet || '');
  var m = s.match(/^(.+?), hai ricevuto[\s\S]*?Ciao\s+(.+?)\s+ti ha inviato/);
  var nome = '';
  if (m) {
    nome = m[2];
    if (nome.indexOf(m[1] + ' ') === 0) nome = nome.slice(m[1].length + 1);
  } else {
    m = s.match(/Ciao\s+(.+?)\s+ti ha inviato/);
    if (m) nome = m[1];
  }
  nome = nome.replace(/\s+/g, ' ').trim();
  if (!nome || nome.length > 60 || /[0-9@<>]/.test(nome)) return '';
  return maiuscole(nome);
}

/* PayPal riporta il nome come l'ha scritto chi paga: "paolo bastiani", "luca Barbaresco",
   "MARIO ROSSI" → "Paolo Bastiani", "Luca Barbaresco", "Mario Rossi". */
function maiuscole(nome) {
  if (nome === nome.toUpperCase()) nome = nome.toLowerCase();
  return nome.replace(/(^|[\s'’-])(\S)/g, function (t, sep, c) { return sep + c.toUpperCase(); });
}

function chiave(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function decodifica(s) {
  return s.replace(/&#(\d+);/g, function (t, n) { return String.fromCharCode(Number(n)); })
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/* Da lanciare UNA volta dall'editor (▶ Esegui) per autorizzare la lettura di Gmail:
   legge subito le email e scrive nel log i nomi trovati. */
function autorizza() {
  aggiorna();
  var props = PropertiesService.getScriptProperties();
  console.log('Errore: ' + (props.getProperty('errore') || 'nessuno'));
  console.log('Sostenitori automatici dal ' + DAL.slice(0, 10) + ': ' + JSON.stringify(elenco()));
}
