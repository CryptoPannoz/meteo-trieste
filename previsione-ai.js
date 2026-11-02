/* Vento Trieste_AI — la previsione dell'AI in cima a Previsioni, Lite e Pro (2 nov 2026).
   Alberto: "appena si apre, un box blu con scritto Vento Trieste_AI, un pulsante Informazioni e il
   risultato di quello che viene mandato su Telegram", "specificando chiaramente che le previsioni
   sono per Barcola". È la previsione delle 21 del bot @Ventotrieste_AI_bot, in prova (beta).
   I dati vengono dal Worker ventotrieste-previsioni, GET /domani (solo la previsione: niente
   manuale, regole o nomi). Si chiede quando si apre Previsioni, non a ogni visita.
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

  function disegna(d) {
    if (!contato && window.vtConta) { contato = true; window.vtConta("ai:box-visto"); }
    if (!d || d.vuota || !d.fasce) {
      box.innerHTML = '<p class="ai-vuota">Nessuna previsione per oggi. La prossima stasera alle ' + e((d && d.sera) || "21:00") + ".</p>";
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
    box.innerHTML =
      '<p class="ai-titolo">Previsione ' + (oggi ? "di oggi" : "di domani") + " · " + e(d.data) + " · <b>" + e(d.spot) + "</b></p>" +
      '<p class="ai-esito"><b>' + e(d.esito) + "</b> · " + e(d.giudizio.sim) + " " + e(d.giudizio.nome) + (d.raffiche ? " · " + e(d.raffiche) : "") + "</p>" +
      '<div class="ai-tabella" role="table" aria-label="Previsione fascia per fascia: ore, vento medio, media-raffica, direzione, giudizio">' + righe + "</div>" +
      (d.commento ? '<p class="ai-commento">' + e(d.commento) + "</p>" : "") +
      (note ? '<details class="ai-fasce"><summary>Fascia per fascia</summary><ul>' + note + "</ul></details>" : "") +
      '<p class="ai-quando">' + (oggi ? "Fatta ieri sera" : "Fatta stasera") + " alle " + e(d.sera) + " · previsione automatica in prova · solo per Barcola</p>";
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
