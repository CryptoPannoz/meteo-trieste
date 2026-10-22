/* spinta-bora.js — Spinta della Bora con grafico (13 ott 2026).
   Alberto: "ricostruisci con un grafico la spinta della bora, rendila leggibile".

   Che cosa misura: la differenza di pressione al livello del mare (MSLP) tra Maribor, oltre
   l'altipiano, e Trieste. Qui la leggiamo come SPINTA = Maribor − Trieste: più è alta, più
   l'aria fredda accumulata sul continente spinge verso il golfo. È la stessa grandezza del
   "Grafico della Bora" di profiwetter (Trieste − Maribor) col segno girato: lì la bora sta
   sotto lo zero, qui sale. Prima il box mostrava "−5,2 hPa" e una barra che cresceva verso
   destra con il numero che scendeva: ora numero, colore e grafico vanno nella stessa direzione.

   Fasce (le soglie che il sito usava già): sotto 3,5 debole · 3,5–5 genesi · 5–8 consistente ·
   da 8 forte.

   Dati: Open-Meteo, UNA richiesta per i due punti: "current" (passo 15 min, stima di modello
   per adesso) + serie oraria 12 h indietro / 36 h avanti. Non sono misure di stazione: la
   finestra lo dice. Con la serie si legge anche la tendenza ("in aumento, soglia verso le 21").

   Uso: le pagine chiamano SpintaBora.aggiorna() (la loro caricaDeltaBora delega qui).
   Riempie #barcolaLive (home) e .bora-delta (pagine spot): il titolo resta quello della pagina
   (footer-widgets.js lo rinomina e aggiunge "SOLO BORA · NE"), il resto del box è nostro.
   Riscrive anche la finestra #modalDeltaBora. Italiano, sloveno su <html lang="sl">. */
(function () {
  "use strict";
  if (window.SpintaBora) return;

  var sl = (document.documentElement.lang || "").indexOf("sl") === 0;
  var SOGLIE = [3.5, 5, 8];
  var ORE_PRIMA = 12, ORE_DOPO = 36;
  var MARIBOR = [46.5547, 15.6459], TRIESTE = [45.6495, 13.7768];

  var T = sl ? {
    fasce: ["Ni potiska", "Šibek potisk", "Nastanek burje", "Občutna burja", "Močna burja"],
    sotto: ["tlak je višji nad zalivom", "pod pragom burje", "", "", ""],
    corte: ["šibka", "nastanek", "občutna", "močna"],
    sale: "narašča", cala: "upada", stabile: "stabilno",
    soglia: "prag burje", picco: "vrh", sottoSoglia: "pod pragom", resta: "ostaja nad pragom naslednjih 24 ur",
    niente: "burja ni napovedana v naslednjih 24\u00a0urah", quasi: "narašča, a ostaja pod pragom",
    verso: "okoli", domani: "jutri",
    prima: "zadnjih 12 h", ora: "zdaj", dopo: "naslednjih 36 h · napoved",
    previsione: "napoved",
    info: "ℹ️ Razlaga in vir", agg: "posod.",
    errore: "⚠️ Razlika tlaka trenutno ni na voljo.",
    aria: "Potisk burje v zadnjih 12 urah in napoved za naslednjih 36 ur",
    giorni: ["ned", "pon", "tor", "sre", "čet", "pet", "sob"],
    titolo: "Potisk burje: kako brati",
    modal:
      "<p>To je razlika zračnega tlaka na morski gladini med <strong>Mariborom</strong> (onkraj planote) in <strong>Trstom</strong>. Ko je na drugi strani Krasa tlak višji, se hladen in težek zrak prelije proti morju: to je burja. <strong>Višja kot je številka, močneje potiska burja.</strong></p>",
    legenda: [
      ["pod 3,5", "Šibek potisk", "ne zadošča za burjo: če piha, je navadno drug veter (zmorec, jugo, maestral)."],
      ["3,5–5", "Nastanek burje", "prag je presežen: burja se vklaplja, prvi sunki s SV."],
      ["5–8", "Občutna burja", "burja je vzpostavljena, sunki so odločni."],
      ["nad 8", "Močna burja", "močni sunki, previdnost na morju in v mestu."]
    ],
    grafico: "<p><strong>Graf:</strong> polna črta je zadnjih 12 ur, črtkana napoved za naslednjih 36 ur, navpična črta je zdaj. Dotakni se grafa za uro in vrednost.</p>",
    note: "<p class=\"guida-meta\">Pragovi so okvirni: šteje tudi, koliko hladnega zraka je v višinah. Tlak napove, postaje potrdijo: beri ga skupaj s surfometrom.</p>" +
      "<p class=\"guida-meta\"><strong>Graf burje</strong> v napovedih (profiwetter.ch, model DWD) kaže isto razliko za 6 dni, a z obratnim predznakom (Trst − Maribor): tam je burja pod ničlo, prag je črtkana črta pri −4.</p>",
    fonte: "Vir: <a href=\"https://open-meteo.com\" target=\"_blank\" rel=\"noopener\">Open-Meteo</a>, tlak na morski gladini (MSLP), ocena modela vsakih 15 minut, ne meritev postaje",
    differenza: "Potisk = Maribor − Trst",
    guida: "", chiudi: "Zapri",
    mappaTitolo: "Ni burje · veter zdaj", mappaBadge: "ZALIV · ISTRA",
    mappaSotto: "Potisk burje je pod ničlo: burje ni. Tu je, kje piha zdaj, od zaliva do Istre.",
    mappaSpinta: "Potisk burje", mappaGrafico: "📈 Graf potiska", mappaTorna: "🗺️ Ni burje: pokaži zemljevid",
    mappaIstria: "📍 Spoti v Istri",
    mappaFonte: "Izmerjeni podatki postaj, ne napoved · dotakni se številke za podrobnosti · obala © <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a> contributors · relief Copernicus EU-DEM, USGS, NOAA",
    mappaQui: "🗺️ Zdaj ni burje: zemljevid je na vrhu strani, namesto potiska burje.", mappaVai: "Na zemljevid ↑"
  } : {
    fasce: ["Nessuna spinta", "Spinta debole", "Genesi della Bora", "Bora consistente", "Bora forte"],
    sotto: ["pressione più alta sul golfo", "sotto la soglia della bora", "", "", ""],
    corte: ["debole", "genesi", "consistente", "forte"],
    sale: "in aumento", cala: "in calo", stabile: "stabile",
    soglia: "soglia bora", picco: "picco", sottoSoglia: "sotto soglia", resta: "resta sopra soglia nelle prossime 24\u00a0h",
    niente: "nessuna bora prevista nelle prossime 24\u00a0h", quasi: "in aumento, ma sotto la soglia",
    verso: "verso le", domani: "domani",
    prima: "ultime 12 h", ora: "ora", dopo: "prossime 36 h · previsione",
    previsione: "previsione",
    info: "ℹ️ Spiegazione e fonte", agg: "agg.",
    errore: "⚠️ Spinta della Bora momentaneamente non disponibile.",
    aria: "Spinta della Bora nelle ultime 12 ore e previsione per le prossime 36 ore",
    giorni: ["dom", "lun", "mar", "mer", "gio", "ven", "sab"],
    titolo: "Spinta della Bora: come si legge",
    modal:
      "<p>È la differenza di pressione al livello del mare tra <strong>Maribor</strong> (oltre l'altipiano, in Slovenia) e <strong>Trieste</strong>. Quando dall'altra parte del Carso c'è più pressione, l'aria fredda e pesante trabocca verso il mare: è la bora. <strong>Più il numero è alto, più la bora spinge.</strong></p>",
    legenda: [
      ["sotto 3,5", "Spinta debole", "non basta per la bora: se c'è vento, di solito è un altro (brezza, scirocco, maestrale)."],
      ["3,5–5", "Genesi della Bora", "soglia superata: la bora si sta innescando, arrivano i primi rinforzi da NE."],
      ["5–8", "Bora consistente", "bora ben stabilita e raffiche decise: condizioni impegnative in acqua."],
      ["oltre 8", "Bora forte", "raffiche violente: attenzione in mare e in città."]
    ],
    grafico: "<p><strong>Il grafico:</strong> la linea piena sono le ultime 12 ore, quella tratteggiata la previsione delle prossime 36; la riga verticale è adesso. Tocca il grafico per leggere ora e valore.</p>",
    note: "<p class=\"guida-meta\">Le soglie sono indicative: conta anche quanta aria fredda c'è in quota. La pressione anticipa, le centraline confermano: leggi questo box insieme al surfometro.</p>" +
      "<p class=\"guida-meta\">Il <strong>Grafico della Bora</strong> nelle Previsioni (profiwetter.ch, modello DWD) mostra la stessa differenza per 6 giorni, ma col segno opposto (Trieste − Maribor): lì la bora è sotto lo zero e la soglia è la riga tratteggiata a −4.</p>",
    fonte: "Fonte: <a href=\"https://open-meteo.com\" target=\"_blank\" rel=\"noopener\">Open-Meteo</a>, pressione al livello del mare (MSLP), stima di modello aggiornata ogni 15 minuti, non una misura di stazione",
    differenza: "Spinta = Maribor − Trieste",
    guida: "<p class=\"sb-guida-link\"><a href=\"/guida/spinta-bora/\">📖 Approfondisci nella guida →</a></p>", chiudi: "Chiudi",
    mappaTitolo: "Niente bora · il vento adesso", mappaBadge: "GOLFO · ISTRIA",
    mappaSotto: "La spinta della bora è sotto zero: niente bora. Ecco dove soffia adesso, dal Golfo all'Istria.",
    mappaSpinta: "Spinta della Bora", mappaGrafico: "📈 Grafico della spinta", mappaTorna: "🗺️ Niente bora: mostra la mappa",
    mappaIstria: "📍 Spot Istria",
    mappaFonte: "Dati osservati dalle centraline, non una previsione · tocca un numero per il dettaglio · costa © <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a> contributors · rilievo Copernicus EU-DEM, USGS, NOAA",
    mappaQui: "🗺️ Adesso non c'è bora: la mappa è salita in cima alla pagina, al posto della Spinta della Bora.", mappaVai: "Vai alla mappa ↑"
  };

  function fascia(v) {
    if (v < 0) return 0;
    if (v < SOGLIE[0]) return 1;
    if (v < SOGLIE[1]) return 2;
    if (v < SOGLIE[2]) return 3;
    return 4;
  }
  var CLASSI = ["nulla", "debole", "genesi", "consistente", "forte"];
  function fmt(v) { return (v < 0 ? "−" : "") + Math.abs(v).toFixed(1).replace(".", ","); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------- box ---------------- */
  var boxes = [];
  function preparaBox(box) {
    if (box.__sb) return box.__sb;
    // il titolo della pagina resta; tutto il resto del box (verdetto, numero, barra, frase, fonte) lo
    // sostituiamo. La riga della fonte (#deltaBoraStato) va nella finestra, come faceva footer-widgets.js.
    var titolo = box.matches(".bora-delta") ? box.querySelector(".bd-titolo") : box.querySelector("h2");
    var stato = document.getElementById("deltaBoraStato");
    var contenitore = titolo ? titolo.parentNode : box;
    Array.prototype.slice.call(contenitore.children).forEach(function (el) {
      if (el !== titolo) el.remove();
    });
    var ui = document.createElement("div");
    ui.className = "sb";
    ui.innerHTML =
      '<div class="sb-ora">' +
        '<div class="tws-hero bd-hero sb-hero"><span class="bd-sign sb-segno"></span><span class="lcd"><span class="lcd-ghost sb-ghost">8.8</span><span class="lcd-lit sb-num">–</span></span><span class="u">hPa</span></div>' +
        '<div class="sb-stato"><strong class="sb-verdetto">–</strong><span class="sb-trend"></span></div>' +
      '</div>' +
      '<div class="sb-grafico" role="img" aria-label="' + esc(T.aria) + '"><svg aria-hidden="true"></svg><div class="sb-tip" hidden></div></div>' +
      '<div class="sb-legenda" aria-hidden="true"><span class="sb-leg-prima">' + T.prima + '</span><span class="sb-leg-dopo">' + T.dopo + '</span></div>' +
      '<button type="button" class="bora-note sb-info" aria-haspopup="dialog">' + T.info + '</button>';
    contenitore.appendChild(ui);
    var info = ui.querySelector(".sb-info");
    info.addEventListener("click", apriFinestra);
    var rif = {
      box: box, ui: ui, segno: ui.querySelector(".sb-segno"), ghost: ui.querySelector(".sb-ghost"),
      num: ui.querySelector(".sb-num"), verdetto: ui.querySelector(".sb-verdetto"), trend: ui.querySelector(".sb-trend"),
      grafico: ui.querySelector(".sb-grafico"), svg: ui.querySelector("svg"), tip: ui.querySelector(".sb-tip"), info: info
    };
    box.__sb = rif;
    box.classList.add("sb-box");
    boxes.push(rif);
    preparaInterazione(rif);
    if ("ResizeObserver" in window) {
      var larghezza = 0;
      new ResizeObserver(function () {
        var w = Math.round(rif.grafico.clientWidth);
        if (w && w !== larghezza) { larghezza = w; if (ultimo) disegna(rif, ultimo); }
      }).observe(rif.grafico);
    }
    preparaFinestra(stato);
    return rif;
  }

  /* ---------------- finestra "Spiegazione e fonte" ---------------- */
  var finestraPronta = false;
  function apriFinestra() {
    var m = document.getElementById("modalDeltaBora");
    if (m) m.style.display = "block";
  }
  function preparaFinestra(stato) {
    if (finestraPronta) return;
    var m = document.getElementById("modalDeltaBora");
    var c = m && m.querySelector(".contenuto");
    if (!c) return;
    finestraPronta = true;
    var x = c.querySelector(".modal-x");
    var h3 = c.querySelector("h3");
    if (!stato) { stato = document.createElement("p"); stato.id = "deltaBoraStato"; }
    stato.className = "stato sb-fonte";
    var legenda = T.legenda.map(function (r, i) {
      return '<div><i class="sb-c' + (i + 1) + '"></i><span><strong>' + r[0] + " · " + r[1] + "</strong> — " + r[2] + "</span></div>";
    }).join("");
    c.innerHTML = "";
    if (x) c.appendChild(x);
    if (!h3) { h3 = document.createElement("h3"); h3.id = "deltaBoraTitolo"; }
    h3.textContent = T.titolo;
    c.appendChild(h3);
    var corpo = document.createElement("div");
    corpo.className = "sb-finestra";
    corpo.innerHTML = T.modal +
      '<div class="statgrid sb-live"><div class="statbox"><span class="etichetta">Maribor (SLO)</span><span class="valore" data-sb="mb">–<span class="unita"> hPa</span></span></div>' +
      '<div class="statbox"><span class="etichetta">' + (sl ? "Trst (ITA)" : "Trieste (ITA)") + '</span><span class="valore" data-sb="ts">–<span class="unita"> hPa</span></span></div></div>' +
      '<p class="guida-meta sb-diff" data-sb="diff">' + T.differenza + '</p>' +
      '<div class="bd-legenda sb-scala">' + legenda + "</div>" + T.grafico + T.note;
    c.appendChild(corpo);
    c.appendChild(stato);
    if (T.guida) c.insertAdjacentHTML("beforeend", T.guida);
    var piede = document.createElement("div");
    piede.style.cssText = "text-align:right;margin-top:1rem;";
    piede.innerHTML = '<button type="button">' + T.chiudi + "</button>";
    piede.querySelector("button").addEventListener("click", function () { m.style.display = "none"; });
    c.appendChild(piede);
  }

  /* ---------------- dati ---------------- */
  var ultimo = null, inCorso = null;
  function scarica() {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + MARIBOR[0] + "," + TRIESTE[0] +
      "&longitude=" + MARIBOR[1] + "," + TRIESTE[1] +
      "&current=pressure_msl&hourly=pressure_msl&past_hours=" + ORE_PRIMA + "&forecast_hours=" + ORE_DOPO +
      "&timezone=Europe%2FRome";
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (!Array.isArray(j) || j.length < 2) throw new Error("risposta inattesa");
      var mb = j[0], ts = j[1];
      var tempi = mb.hourly.time, serie = [];
      for (var i = 0; i < tempi.length; i++) {
        var a = mb.hourly.pressure_msl[i], b = ts.hourly.pressure_msl[i];
        serie.push(a == null || b == null ? null : Math.round((a - b) * 10) / 10);
      }
      var pMb = mb.current.pressure_msl, pTs = ts.current.pressure_msl;
      var adesso = mb.current.time;                      // "2026-10-13T14:30", ora di Roma
      // posizione di "adesso" sull'asse orario (indice frazionario)
      var t0 = Date.parse(tempi[0] + ":00Z"), tn = Date.parse(adesso + ":00Z");
      var xOra = (tn - t0) / 3600000;
      return {
        tempi: tempi, serie: serie, xOra: xOra, adesso: adesso,
        pMb: pMb, pTs: pTs, ora: Math.round((pMb - pTs) * 10) / 10
      };
    });
  }

  function valoreIn(d, x) {                              // interpolazione lineare sulla serie oraria
    var i = Math.floor(x), f = x - i;
    var a = d.serie[i], b = d.serie[i + 1];
    if (a == null) return b;
    if (b == null || f === 0) return a;
    return a + (b - a) * f;
  }

  function giornoDi(s) { return s.slice(0, 10); }
  function quando(d, i) {
    var t = d.tempi[i], ora = t.slice(11, 13);
    var oggi = giornoDi(d.adesso);
    var dom = new Date(Date.parse(oggi + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    var g = giornoDi(t);
    var giorno = g === oggi ? "" : g === dom ? T.domani + " " : T.giorni[new Date(g + "T12:00:00Z").getUTCDay()] + " ";
    return giorno + T.verso + " " + ora + (sl ? "h" : "");
  }

  function tendenza(d) {
    var v = d.ora, S = SOGLIE[0];
    var prima = valoreIn(d, Math.max(0, d.xOra - 3));
    var delta = prima == null ? 0 : v - prima;
    var parola = delta > 0.6 ? T.sale : delta < -0.6 ? T.cala : T.stabile;
    var freccia = delta > 0.6 ? "↗" : delta < -0.6 ? "↘" : "→";
    var da = Math.ceil(d.xOra), a = Math.min(d.serie.length - 1, Math.floor(d.xOra + 24));
    var picco = null, inizio = null, fine = null;
    for (var i = da; i <= a; i++) {
      var s = d.serie[i];
      if (s == null) continue;
      if (!picco || s > picco.v) picco = { v: s, i: i };
      if (inizio === null && v < S && s >= S) inizio = i;
      if (fine === null && v >= S && s < S) fine = i;
    }
    var testo;
    if (v >= S) {
      if (picco && picco.v > v + 0.8) testo = parola + " · " + T.picco + " " + fmt(picco.v) + " hPa " + quando(d, picco.i);
      else if (fine !== null) testo = parola + " · " + T.sottoSoglia + " " + quando(d, fine);
      else testo = parola + " · " + T.resta;
    } else if (inizio !== null) {
      testo = T.soglia + " " + quando(d, inizio) + (picco && picco.v >= SOGLIE[1] ? " · " + T.picco + " " + fmt(picco.v) + " hPa" : "");
      freccia = "↗";
    } else if (picco && picco.v > v + 1) {
      testo = T.quasi + " (" + T.picco + " " + fmt(picco.v) + " hPa)";
      freccia = "↗";
    } else {
      testo = T.niente;
    }
    return freccia + " " + testo;
  }

  /* ---------------- grafico ---------------- */
  var NS = "http://www.w3.org/2000/svg";
  function disegna(rif, d) {
    var W = Math.max(240, Math.round(rif.grafico.clientWidth || 320));
    // in home sul telefono più basso (22 ott 2026): Surfometro e Spinta stanno nella prima schermata
    var corto = rif.box.id === "barcolaLive" && window.matchMedia && window.matchMedia("(max-width: 700px)").matches;
    var H = corto ? 100 : 132, top = 8, basso = 18, sx = 22, dx = 6;
    var n = d.serie.length;
    var valori = d.serie.filter(function (v) { return v != null; }).concat([d.ora]);
    var yMax = Math.max(10, Math.ceil(Math.max.apply(null, valori) + 1));
    var yMin = Math.min(-2, Math.floor(Math.min.apply(null, valori) - 0.5));
    var X = function (i) { return sx + (W - sx - dx) * i / (n - 1); };
    var Y = function (v) { return top + (H - top - basso) * (yMax - v) / (yMax - yMin); };
    var p = [];
    var uid = "sbg" + Math.random().toString(36).slice(2, 7);

    // gradiente verticale con cambi netti alle soglie: la linea prende il colore della fascia
    var stops = [[yMin, 1], [SOGLIE[0], 1], [SOGLIE[0], 2], [SOGLIE[1], 2], [SOGLIE[1], 3], [SOGLIE[2], 3], [SOGLIE[2], 4], [yMax, 4]];
    p.push('<defs><linearGradient id="' + uid + '" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="' + Y(yMin) + '" y2="' + Y(yMax) + '">' +
      stops.map(function (s) {
        var off = Math.max(0, Math.min(1, (s[0] - yMin) / (yMax - yMin)));
        return '<stop offset="' + off.toFixed(4) + '" style="stop-color:var(--sb-c' + s[1] + ')"/>';
      }).join("") + "</linearGradient></defs>");

    // fasce di intensità sopra la soglia
    [[SOGLIE[0], SOGLIE[1], 2], [SOGLIE[1], SOGLIE[2], 3], [SOGLIE[2], yMax, 4]].forEach(function (f) {
      var y1 = Y(Math.min(f[1], yMax)), y2 = Y(f[0]);
      p.push('<rect class="sb-fascia sb-f' + f[2] + '" x="' + sx + '" y="' + y1.toFixed(1) + '" width="' + (W - sx - dx) + '" height="' + (y2 - y1).toFixed(1) + '"/>');
      if (y2 - y1 >= 10) p.push('<text class="sb-nome sb-t' + f[2] + '" x="' + (W - dx - 4) + '" y="' + ((y1 + y2) / 2 + 3.2).toFixed(1) + '" text-anchor="end">' + T.corte[f[2] - 1] + "</text>");
    });
    // zero e soglia
    p.push('<line class="sb-zero" x1="' + sx + '" x2="' + (W - dx) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '"/>');
    p.push('<line class="sb-soglia" x1="' + sx + '" x2="' + (W - dx) + '" y1="' + Y(SOGLIE[0]).toFixed(1) + '" y2="' + Y(SOGLIE[0]).toFixed(1) + '"/>');
    [0, SOGLIE[0], SOGLIE[1], SOGLIE[2]].forEach(function (v) {
      if (v > yMax) return;
      p.push('<text class="sb-asse" x="' + (sx - 4) + '" y="' + (Y(v) + 3.2).toFixed(1) + '" text-anchor="end">' + String(v).replace(".", ",") + "</text>");
    });

    // ore sull'asse x: ogni 6 h, a mezzanotte il giorno
    for (var i = 0; i < n; i++) {
      var hh = +d.tempi[i].slice(11, 13);
      if (hh % 6) continue;
      var x = X(i);
      if (x < sx + 8 || x > W - dx - 8) continue;
      var lab = hh === 0 ? T.giorni[new Date(d.tempi[i].slice(0, 10) + "T12:00:00Z").getUTCDay()] : String(hh).padStart(2, "0");
      if (hh === 0) p.push('<line class="sb-notte" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + top + '" y2="' + (H - basso) + '"/>');
      p.push('<text class="sb-asse' + (hh === 0 ? " sb-giorno" : "") + '" x="' + x.toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle">' + lab + "</text>");
    }

    // linea: piena nel passato, tratteggiata nel futuro; area tenue sotto
    function tratto(da, a) {
      var s = "", aperto = false;
      for (var k = da; k <= a; k++) {
        var v = d.serie[k];
        if (v == null) { aperto = false; continue; }
        s += (aperto ? "L" : "M") + X(k).toFixed(1) + " " + Y(v).toFixed(1);
        aperto = true;
      }
      return s;
    }
    var iOra = Math.min(n - 1, Math.max(0, Math.floor(d.xOra)));
    var xOra = X(Math.min(n - 1, Math.max(0, d.xOra))), yOra = Y(d.ora);
    var passato = tratto(0, iOra) + "L" + xOra.toFixed(1) + " " + yOra.toFixed(1);
    var futuro = "M" + xOra.toFixed(1) + " " + yOra.toFixed(1) + tratto(iOra + 1, n - 1).replace(/^M/, "L");
    var area = "M" + X(0).toFixed(1) + " " + Y(0).toFixed(1) + tratto(0, n - 1).replace(/^M/, "L") + "L" + X(n - 1).toFixed(1) + " " + Y(0).toFixed(1) + "Z";
    p.push('<path class="sb-area" d="' + area + '" fill="url(#' + uid + ')"/>');
    p.push('<path class="sb-linea sb-futuro" d="' + futuro + '" stroke="url(#' + uid + ')"/>');
    p.push('<path class="sb-linea" d="' + passato + '" stroke="url(#' + uid + ')"/>');

    // adesso
    p.push('<line class="sb-adesso" x1="' + xOra.toFixed(1) + '" x2="' + xOra.toFixed(1) + '" y1="' + top + '" y2="' + (H - basso) + '"/>');
    p.push('<text class="sb-adesso-t" x="' + (xOra + 4).toFixed(1) + '" y="' + (top + 8) + '">' + T.ora + "</text>");
    p.push('<circle class="sb-punto sb-p' + Math.max(1, fascia(d.ora)) + '" cx="' + xOra.toFixed(1) + '" cy="' + yOra.toFixed(1) + '" r="4.5"/>');
    // cursore del tocco
    p.push('<line class="sb-cursore" x1="0" x2="0" y1="' + top + '" y2="' + (H - basso) + '" visibility="hidden"/>');
    p.push('<circle class="sb-cursore-p" r="3.5" cx="0" cy="0" visibility="hidden"/>');

    rif.svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    rif.svg.setAttribute("width", W);
    rif.svg.setAttribute("height", H);
    rif.svg.innerHTML = p.join("");
    rif.geo = { X: X, Y: Y, n: n, W: W, sx: sx, dx: dx, d: d };
    // legenda: "ultime 12 h" sotto la parte piena, "previsione" sotto quella tratteggiata
    var leg = rif.ui.querySelector(".sb-legenda");
    if (leg) leg.style.setProperty("--sb-ora", (xOra / W * 100).toFixed(1) + "%");
  }

  function preparaInterazione(rif) {
    function mostra(ev) {
      var g = rif.geo;
      if (!g) return;
      var r = rif.svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) * (g.W / r.width);
      var i = Math.round((px - g.sx) / (g.W - g.sx - g.dx) * (g.n - 1));
      i = Math.max(0, Math.min(g.n - 1, i));
      var v = g.d.serie[i];
      if (v == null) return;
      var x = g.X(i), y = g.Y(v);
      var lin = rif.svg.querySelector(".sb-cursore"), pt = rif.svg.querySelector(".sb-cursore-p");
      lin.setAttribute("x1", x); lin.setAttribute("x2", x); lin.setAttribute("visibility", "visible");
      pt.setAttribute("cx", x); pt.setAttribute("cy", y); pt.setAttribute("visibility", "visible");
      pt.setAttribute("class", "sb-cursore-p sb-p" + Math.max(1, fascia(v)));
      var t = g.d.tempi[i];
      var oggi = giornoDi(g.d.adesso);
      var g2 = giornoDi(t);
      var giorno = g2 === oggi ? "" : T.giorni[new Date(g2 + "T12:00:00Z").getUTCDay()] + " ";
      rif.tip.innerHTML = "<strong>" + fmt(v) + " hPa</strong> · " + giorno + t.slice(11, 16) +
        (i > g.d.xOra ? " · " + T.previsione : "") +
        "<small>" + T.fasce[fascia(v)] + "</small>";
      rif.tip.hidden = false;
      var pos = x / g.W * 100;
      rif.tip.style.left = Math.max(18, Math.min(82, pos)) + "%";
    }
    function nascondi() {
      rif.tip.hidden = true;
      var lin = rif.svg.querySelector(".sb-cursore"), pt = rif.svg.querySelector(".sb-cursore-p");
      if (lin) lin.setAttribute("visibility", "hidden");
      if (pt) pt.setAttribute("visibility", "hidden");
    }
    var timer = null;
    rif.grafico.addEventListener("pointermove", function (ev) { clearTimeout(timer); mostra(ev); });
    rif.grafico.addEventListener("pointerdown", function (ev) { clearTimeout(timer); mostra(ev); });
    rif.grafico.addEventListener("pointerleave", function () { timer = setTimeout(nascondi, 1800); });
    rif.grafico.addEventListener("pointerup", function (ev) { if (ev.pointerType !== "mouse") { clearTimeout(timer); timer = setTimeout(nascondi, 2600); } });
  }

  function scriviBox(rif, d) {
    var v = d.ora, f = fascia(v);
    rif.box.dataset.fascia = CLASSI[f];
    var abs = Math.abs(v).toFixed(1);
    rif.segno.textContent = v < 0 ? "−" : "";
    rif.ghost.textContent = abs.replace(/[0-9]/g, "8");
    rif.num.textContent = abs;
    rif.verdetto.textContent = T.fasce[f];
    rif.verdetto.className = "sb-verdetto sb-v" + f;
    rif.trend.textContent = tendenza(d);
    rif.info.textContent = T.info + " · " + T.agg + " " + d.adesso.slice(11, 16);
    if (!modoMappa(rif, d)) disegna(rif, d);
  }

  /* ---------------- niente bora: la mappa al posto della spinta (20 ott 2026) ----------------
     Alberto: "quando c'è scirocco e la spinta della bora è addirittura negativa non ha senso
     mostrarla: al suo posto ci sia ben visibile la mappa delle centraline in golfo, così si
     va a surfare in Istria". Solo in home (#barcolaLive accanto alla mappa #mappaGolfo):
     con la spinta sotto zero spostiamo nel box la mappa del Golfo e dell'Istria (lo stesso
     SVG di mappa-golfo.js, con la sua legenda) e la spinta resta in una riga. Nella tendina
     "Mappa e centraline" la sezione della mappa si nasconde e resta un rimando in cima. Isteresi: si entra sotto 0 e si
     torna alla spinta da +0,5, per non far saltare il box a ogni aggiornamento.
     Un pulsante riporta il grafico della spinta (scelta ricordata per la visita). */
  var MAPPA_ENTRA = 0, MAPPA_ESCI = 0.5, CHIAVE_SPINTA = "vt-sb-spinta-forzata";
  function spintaForzata() { try { return sessionStorage.getItem(CHIAVE_SPINTA) === "1"; } catch (e) { return false; } }
  function conta(nome) { if (window.vtConta) window.vtConta(nome); }   // eventi GoatCounter (eventi.js)
  function forzaSpinta(si) {
    try { if (si) sessionStorage.setItem(CHIAVE_SPINTA, "1"); else sessionStorage.removeItem(CHIAVE_SPINTA); } catch (e) {}
  }

  function preparaMappa(rif) {
    if (rif.mappa) return rif.mappa;
    var svgMappa = document.getElementById("mappaGolfo");
    var canvas = svgMappa && svgMappa.closest(".mappa-canvas");
    var sezione = canvas && canvas.parentNode;
    var legenda = sezione && sezione.querySelector(".mappa-legenda");
    if (!canvas) return null;
    var m = document.createElement("div");
    m.className = "sb-mappa";
    m.innerHTML =
      '<h2 class="sb-mappa-titolo">' + T.mappaTitolo + ' <span class="bora-only-badge">' + T.mappaBadge + "</span></h2>" +
      '<p class="sb-mappa-sotto">' + T.mappaSotto + "</p>" +
      '<div class="sb-mappa-posto"></div>' +
      '<p class="stato sb-mappa-fonte">' + T.mappaFonte + "</p>" +
      '<div class="sb-mappa-spinta"><span class="sb-mappa-num"></span><span class="sb-mappa-trend"></span></div>' +
      '<div class="sb-mappa-azioni">' +
        (document.getElementById("istria") && window.apriSpotIstria ? '<button type="button" class="bora-note sb-mappa-istria">' + T.mappaIstria + "</button>" : "") +
        '<button type="button" class="bora-note sb-mappa-grafico">' + T.mappaGrafico + "</button>" +
      "</div>";
    rif.ui.parentNode.appendChild(m);
    // nella tendina la sezione della mappa si nasconde e lascia un rimando in cima alla pagina
    var qui = document.createElement("p");
    qui.className = "sb-mappa-qui";
    qui.hidden = true;
    qui.innerHTML = T.mappaQui + ' <a href="#vento">' + T.mappaVai + "</a>";
    sezione.parentNode.insertBefore(qui, sezione);
    // nel box della spinta, quando la si è chiesta senza bora: il ritorno alla mappa
    var torna = document.createElement("button");
    torna.type = "button";
    torna.className = "bora-note sb-torna-mappa";
    torna.hidden = true;
    torna.textContent = T.mappaTorna;
    rif.ui.appendChild(torna);

    var istria = m.querySelector(".sb-mappa-istria");
    if (istria) istria.addEventListener("click", function (ev) { conta("spinta: spot istria"); window.apriSpotIstria(ev); });
    m.querySelector(".sb-mappa-grafico").addEventListener("click", function () {
      conta("spinta: grafico");
      forzaSpinta(true);
      if (ultimo) scriviBox(rif, ultimo);
    });
    torna.addEventListener("click", function () {
      conta("spinta: torna alla mappa");
      forzaSpinta(false);
      if (ultimo) scriviBox(rif, ultimo);
    });
    rif.mappa = {
      el: m, posto: m.querySelector(".sb-mappa-posto"), canvas: canvas, legenda: legenda, qui: qui, torna: torna,
      sezione: sezione, dopo: (legenda || canvas).nextElementSibling,
      num: m.querySelector(".sb-mappa-num"), trend: m.querySelector(".sb-mappa-trend"), dentro: false
    };
    return rif.mappa;
  }

  function spostaMappa(mp, dentro) {
    if (mp.dentro === dentro) return;
    mp.dentro = dentro;
    if (dentro) {
      mp.posto.appendChild(mp.canvas);
      if (mp.legenda) mp.posto.appendChild(mp.legenda);
    } else {
      mp.sezione.insertBefore(mp.canvas, mp.dopo);
      if (mp.legenda) mp.sezione.insertBefore(mp.legenda, mp.dopo);
    }
    mp.sezione.classList.toggle("sb-mappa-via", dentro);
    mp.qui.hidden = !dentro;
    // la mappa si apre sempre sul Golfo (Alberto, 20 ott 2026); Istria e Tutto con i pulsanti
  }

  // true se il box mostra la mappa (il grafico allora non si disegna)
  function modoMappa(rif, d) {
    if (rif.box.id !== "barcolaLive") return false;
    var mp = preparaMappa(rif);
    if (!mp) return false;
    rif.senzaBora = rif.senzaBora ? d.ora < MAPPA_ESCI : d.ora < MAPPA_ENTRA;
    var mappa = rif.senzaBora && !spintaForzata();
    spostaMappa(mp, mappa);
    rif.box.classList.toggle("sb-senza-bora", mappa);
    var hero = rif.box.closest(".hero");
    if (hero) hero.classList.toggle("hero-senza-bora", mappa);
    mp.torna.hidden = !rif.senzaBora || mappa;
    if (mappa) {
      mp.num.innerHTML = T.mappaSpinta + " <strong>" + fmt(d.ora) + " hPa</strong> · " + T.fasce[fascia(d.ora)] + " · " + T.agg + " " + d.adesso.slice(11, 16);
      mp.trend.textContent = tendenza(d);
    }
    return mappa;
  }

  function scriviFinestra(d) {
    var m = document.getElementById("modalDeltaBora");
    if (!m) return;
    var mb = m.querySelector('[data-sb="mb"]'), ts = m.querySelector('[data-sb="ts"]'), df = m.querySelector('[data-sb="diff"]');
    if (mb) mb.innerHTML = d.pMb.toFixed(1) + '<span class="unita"> hPa</span>';
    if (ts) ts.innerHTML = d.pTs.toFixed(1) + '<span class="unita"> hPa</span>';
    if (df) df.innerHTML = T.differenza + " = <strong>" + fmt(d.ora) + " hPa</strong>";
    var stato = document.getElementById("deltaBoraStato");
    if (stato) stato.innerHTML = T.fonte + " · " + T.agg + " " + d.adesso.slice(11, 16);
  }

  function aggiorna() {
    var trovati = document.querySelectorAll("#barcolaLive, .bora-delta");
    Array.prototype.forEach.call(trovati, preparaBox);
    if (!boxes.length) return Promise.resolve();
    if (inCorso) return inCorso;
    inCorso = scarica().then(function (d) {
      ultimo = d;
      boxes.forEach(function (rif) { scriviBox(rif, d); });
      scriviFinestra(d);
    }).catch(function () {
      boxes.forEach(function (rif) {
        if (!ultimo) { rif.verdetto.textContent = "–"; rif.trend.textContent = T.errore; }
      });
      var stato = document.getElementById("deltaBoraStato");
      if (stato && !ultimo) stato.innerHTML = T.errore;
    }).then(function () { inCorso = null; });
    return inCorso;
  }

  window.SpintaBora = { aggiorna: aggiorna, apri: apriFinestra };
})();
