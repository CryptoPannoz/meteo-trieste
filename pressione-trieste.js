/* pressione-trieste.js — badge "Pressione in aumento / stabile / in calo" (22 ott 2026).
   Alberto: "un amico dice che il vento è più consistente quando la pressione è in calo: trova la
   pressione di Trieste e metti un badge in alto". Il badge sta nel surfometro della home, accanto
   a quello del vento, e porta all'articolo /guida/pressione/ (che racconta cosa dicono i dati: a
   Trieste, con la bora, il vento forte arriva con la pressione in AUMENTO).

   Dati: Protezione Civile FVG, stazione 212 Trieste molo (la stessa del vento di Trieste molo),
   sensore 17 = pressione in hPa, un valore ogni 15 minuti, orari UTC. L'API ha CORS aperto: la
   leggiamo dal browser come fa la home per Paloma. Licenza CC BY 4.0, dicitura nella tendina
   "Fonte dati" del surfometro (regola ARPA del 1 ott 2026).

   Tendenza = valore di adesso − valore di 3 ore prima (la tendenza barometrica dei meteorologi).
   Da +1 hPa "in aumento", fino a −1 "in calo", in mezzo "stabile": su settembre-ottobre 2026 a
   Trieste molo la pressione è stabile il 73% del tempo, in calo e in aumento il 13% ciascuno.
   Dato più vecchio di ETA_MAX minuti o senza il valore di 3 ore prima: niente badge (dati freschi).

   Uso: VTPressione.badge() → html del badge, "" se non c'è un dato buono;
        VTPressione.aggiorna() → scarica e riscrive i badge già in pagina. */
(function () {
  "use strict";
  if (window.VTPressione) return;

  var API = "https://monitor.protezionecivile.fvg.it/api/stations/212/measures?sensor_id=17";
  var SOGLIA = 1.0;          // hPa in 3 ore
  var ETA_MAX = 45;          // minuti
  var GUIDA = "/guida/pressione/";
  var NOMI = { su: "Pressione in aumento", stabile: "Pressione stabile", giu: "Pressione in calo" };
  var GRADI = { su: -45, stabile: 0, giu: 45 };   // freccia →, ruotata verso l'alto o verso il basso
  var stato = null, inCorso = null;

  function utc(ms) { return new Date(ms).toISOString().slice(0, 19).replace("T", " "); }
  function num(v, dec) { return Math.abs(v).toFixed(dec).replace(".", ","); }
  function segno(v) { return v > 0 ? "+" : v < 0 ? "−" : "±"; }
  function ora(ms) {
    return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  }

  function leggi(j) {
    var m = (j && j.measures || []).filter(function (x) { return typeof x.value === "number" && x.dt; })
      .map(function (x) { return { t: Date.parse(x.dt.replace(" ", "T") + "Z"), p: x.value }; })
      .sort(function (a, b) { return a.t - b.t; });
    if (!m.length) return null;
    var ultimo = m[m.length - 1];
    if (Date.now() - ultimo.t > ETA_MAX * 60000) return null;
    // il valore di 3 ore prima (o il più vicino entro 15 minuti)
    var prima = null, scarto = Infinity;
    m.forEach(function (x) {
      var d = Math.abs(x.t - (ultimo.t - 3 * 3600000));
      if (d <= 15 * 60000 && d < scarto) { prima = x; scarto = d; }
    });
    if (!prima) return null;
    var delta = Math.round((ultimo.p - prima.p) * 10) / 10;
    return { p: ultimo.p, delta: delta, t: ultimo.t, classe: delta >= SOGLIA ? "su" : delta <= -SOGLIA ? "giu" : "stabile" };
  }

  function badge() {
    if (!stato) return "";
    var s = stato;
    var dettaglio = segno(s.delta) + num(s.delta, 1) + " hPa in 3 h";
    var titolo = NOMI[s.classe] + " a Trieste molo: " + num(s.p, 1) + " hPa, " + dettaglio + " (agg. " + ora(s.t) +
      "). Fonte: Protezione Civile della Regione Friuli Venezia Giulia, dati elaborati. Tocca per leggere cosa significa per il vento.";
    return '<a class="pressione-badge pb-' + s.classe + '" href="' + GUIDA + '" title="' + titolo + '" aria-label="' + titolo + '">' +
      '<svg class="pb-freccia" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(' + GRADI[s.classe] + 'deg)">' +
      '<path d="M4 12h15m-5-5 5 5-5 5"/></svg>' +
      "<span>" + NOMI[s.classe] + '</span><span class="pb-num">' + dettaglio + "</span></a>";
  }

  // riscrive i badge già in pagina; se il surfometro è stato disegnato prima che arrivasse il
  // dato, il badge si aggiunge in fondo al verdetto (al prossimo disegno lo mette la home)
  function riscrivi() {
    var html = badge(), presenti = document.querySelectorAll(".pressione-badge");
    if (presenti.length) {
      Array.prototype.forEach.call(presenti, function (el) { if (html) el.outerHTML = html; else el.remove(); });
      return;
    }
    var verd = document.getElementById("verdettoBig");
    if (html && verd && verd.textContent.trim() && verd.textContent.trim() !== "—") verd.insertAdjacentHTML("beforeend", html);
  }

  function aggiorna() {
    if (inCorso) return inCorso;
    var adesso = Date.now();
    var url = API + "&from=" + encodeURIComponent(utc(adesso - 4 * 3600000)) + "&to=" + encodeURIComponent(utc(adesso + 15 * 60000));
    inCorso = fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      stato = leggi(j);
    }).catch(function () {
      // senza risposta si tiene il dato di prima finché è fresco
      if (stato && Date.now() - stato.t > ETA_MAX * 60000) stato = null;
    }).then(function () { riscrivi(); inCorso = null; });
    return inCorso;
  }

  window.VTPressione = { badge: badge, aggiorna: aggiorna };
})();
