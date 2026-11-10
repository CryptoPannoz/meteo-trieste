/* Vento Trieste_AI — la previsione dell'AI in cima a Previsioni, Lite e Pro (2 nov 2026).
   Alberto: "appena si apre, un box blu con scritto Vento Trieste_AI, un pulsante Informazioni e il
   risultato di quello che viene mandato su Telegram", "specificando chiaramente che le previsioni
   sono per Barcola". È la previsione della sera del bot @Ventotrieste_AI_bot: dal 10 nov 2026 parte
   quando finiscono le fasce, col buio (17:00 a novembre, 21:00 a fine giugno), non più alle 21.
   I dati vengono dal Worker ventotrieste-previsioni, GET /domani (la previsione e, dal 10 nov, la
   stessa tendina "Come l'ho fatta" del bot; niente testo o numeri delle regole, niente nomi). Si chiede quando si apre Previsioni, non a ogni visita.
   GoatCounter (eventi.js): "ai:box-visto" quando il box si riempie, una volta per pagina, e
   "ai:informazioni" per il pulsante; i clic sul link del bot li conta eventi.js. */
(function () {
  "use strict";
  var box = document.getElementById("aiPrevisione");
  var sezione = document.getElementById("previsioni");
  if (!box || !sezione) return;
  var locale = ["localhost", "127.0.0.1"].indexOf(location.hostname) !== -1;
  var API = (locale ? "http://localhost:8787" : "https://ventotrieste-previsioni.bebroggi.workers.dev") + "/domani";
  var chiesta = false, contato = false;

  function e(x) {
    return String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // il vento medio come barra, una tacca ogni 4 kt (12 kt = 3 tacche, 20 = piena), come nel bot
  function barra(kt) {
    var n = Math.max(0, Math.min(5, Math.round((kt || 0) / 4))), s = "";
    for (var i = 0; i < 5; i++) s += '<i class="' + (i < n ? "on" : "") + '"></i>';
    return '<span class="ai-barra" aria-hidden="true">' + s + "</span>";
  }
  // ora di Roma: per la previsione di oggi le fasce già finite si spengono
  function oraRoma() {
    return parseInt(new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }), 10);
  }

  /* "Maggiori approfondimenti" (10 nov 2026, Alberto: "invece di Fasce e metodo, maggiori
     approfondimenti con tutta la scrittura che di solito fai sul bot"): il commento, le note fascia per
     fascia, "Come l'ho fatta" fonte per fonte, il conto delle regole, l'alternativa in Istria e, in
     fondo, il metodo fisso con le fonti come nell'articolo della guida. */
  var METODO = '<h4>Come nasce la previsione</h4><ol class="ai-metodo">' +
    "<li><b>Al buio</b>, quando finiscono le fasce, l'AI legge il bollettino ARPA FVG - S.O.C. OSMER e GRN, ALADIN, i modelli e la Spinta della Bora.</li>" +
    "<li><b>Il manuale</b>: applica le regole scritte da Alberto con chi esce a Barcola.</li>" +
    "<li><b>Fascia per fascia</b>: vento medio, raffica, direzione e giudizio da ⛏️⛏️ a 🌪️, le raffiche a parte.</li>" +
    "<li><b>Il giorno dopo</b> la confronta con il vento misurato e con i feedback su Telegram: dagli errori nascono regole nuove, approvate da Alberto.</li>" +
    '</ol><a class="ai-guida" href="/guida/vento-trieste-ai/">Come l\'abbiamo fatta →</a>';

  function disegna(d) {
    if (!contato && window.vtConta) { contato = true; window.vtConta("ai:box-visto"); }
    if (!d || d.vuota || !d.fasce) {
      box.innerHTML = '<p class="ai-vuota">Nessuna previsione per oggi. La prossima stasera alle ' + e((d && d.sera) || "17:00") + ", quando finiscono le fasce.</p>";
      return;
    }
    var oggi = d.quando === "oggi", ora = oraRoma();
    var righe = d.fasce.map(function (f) {
      var kt = f.media + (f.raffica > f.media ? "-" + f.raffica : "");
      var passata = oggi && ora >= parseInt(f.alle, 10);
      return '<div class="ai-riga' + (passata ? " passata" : "") + '" role="row">' +
        '<span class="ai-ore" role="cell">' + e(f.dalle) + "-" + e(f.alle) + "</span>" +
        '<span role="cell">' + barra(f.media) + "</span>" +
        '<span class="ai-kt" role="cell">' + e(kt) + " kt</span>" +
        '<span class="ai-dir" role="cell">' + (f.cardinale ? e(f.cardinale) + ' <span class="ai-gradi">' + e(f.gradi) + "</span>" : "") + "</span>" +
        '<span class="ai-g" role="cell"' + (f.giudizio ? ' title="' + e(f.raffiche || "") + '"' : "") + ">" + e(f.giudizio || "") + "</span></div>";
    }).join("");
    var note = d.fasce.filter(function (f) { return f.raffiche || f.nota; }).map(function (f) {
      return "<li><b>" + e(f.dalle) + "-" + e(f.alle) + "</b> " + e([f.raffiche, f.nota].filter(Boolean).join(" · ")) + "</li>";
    }).join("");
    var app = d.approfondimenti || {};
    // il commento intero (sopra la tabella c'è solo la prima riga)
    var commento = (app.commento || []).slice(1).map(function (x) { return "<p>" + e(x) + "</p>"; }).join("");
    var come = (app.come || []).map(function (x) {
      return '<li class="ai-come-' + e(x.esito) + '"><span class="ai-segno" aria-hidden="true">' + e(x.segno) + "</span><span><b>" + e(x.fonte) + "</b>: " + e(x.testo) + "</span></li>";
    }).join("");
    var m = app.manuale;
    var conto = m ? '<p class="ai-conto">' + (m.versione ? "Manuale v" + e(m.versione) + " · " : "") + e(m.regole) + " regole: " + e(m.pro) + " a favore, " + e(m.contro) + " contro, " + e(m.neutre) + " neutre</p>" : "";
    var istria = app.istria && app.istria.length ? "<h4>" + e(app.istria[0]) + '</h4><pre class="ai-istria">' + app.istria.slice(1).map(e).join("\n") + "</pre>" : "";
    // il verdetto colorato: si esce verde, non si esce rosso, il resto ambra (2 nov sera, telefono)
    var verdetto = /^non\b/i.test(d.esito) ? "no" : /^si\b|^sì\b/i.test(d.esito) ? "si" : "forse";
    // per chi e per quando, nel sottotitolo sotto il nome: una riga in meno sul telefono
    var sotto = document.querySelector("#previsioneAi .ai-sotto");
    if (sotto) sotto.textContent = "Per " + d.spot + " · " + (oggi ? "oggi" : "domani") + ", " + d.data;
    box.innerHTML =
      '<p class="ai-esito"><b class="ai-verdetto ' + verdetto + '">' + e(d.esito) + "</b><span>" + e(d.giudizio.sim) + " " + e(d.giudizio.nome) + (d.raffiche ? " · " + e(d.raffiche) : "") + "</span></p>" +
      '<div class="ai-tabella" role="table" aria-label="Previsione fascia per fascia: ore, vento medio, media-raffica, direzione, giudizio">' + righe + "</div>" +
      (d.commento ? '<p class="ai-commento">' + e(d.commento) + "</p>" : "") +
      '<div class="ai-piede"><details class="ai-fasce"><summary>Maggiori approfondimenti</summary>' + commento +
        (note ? "<h4>Fascia per fascia</h4><ul>" + note + "</ul>" : "") +
        (come ? "<h4>Come l'ho fatta</h4><ul class=\"ai-come\">" + come + "</ul>" : "") + conto + istria +
        METODO + "</details>" +
      '<span class="ai-quando" title="Previsione automatica, solo per Barcola">' + (oggi ? "Fatta ieri alle " : "Fatta stasera alle ") + e(d.sera) + "</span></div>";
  }

  function chiedi() {
    if (chiesta || !sezione.open) return;
    chiesta = true;
    fetch(API, { cache: "default" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(disegna)
      .catch(function () {
        chiesta = false;   // alla prossima apertura riprova
        box.innerHTML = '<p class="ai-vuota">Previsione AI non disponibile in questo momento.</p>';
      });
  }
  sezione.addEventListener("toggle", chiedi);
  chiedi();

  window.apriInfoAi = function () {
    var m = document.getElementById("modalAi");
    if (m) m.style.display = "block";
    if (window.vtConta) window.vtConta("ai:informazioni");
  };
})();
