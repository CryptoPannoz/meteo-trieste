/* registro-vento.js — Registro del vento del Golfo di Trieste (1 ott 2026).

   Dalle 8 alle 18, un valore ogni 15 minuti per Barcola, Trieste molo, Muggia, boa Paloma,
   Monte Grisa e boa Mambo, più la media sul campo di regata della Barcolana. Ogni casella
   = i 15 minuti che finiscono a quell'ora: vento medio, raffica massima, direzione (nodi).
   I dati li prepara il Worker Cloudflare (cloudflare-worker/dati, /registro?giorno=).

   Usato da /registro/ (pagina di Vento Trieste) e da /barcolana2026/ (sezione a tendina).
   Autonomo: stili, testi IT/EN (lingua da <html data-lang>), frecce e colori suoi; prende
   i colori della pagina dalle variabili CSS quando ci sono (--line, --surface, --label…).

   Giorni ventosi (2 ott 2026, solo con l'opzione riepilogo): giorno ventoso = media della
   giornata sopra SOGLIA_VENTOSO nodi, dove la media della giornata è quella dei quarti d'ora
   8-18 della prima colonna (media sul campo / in golfo). Sopra la tabella il riepilogo mese
   per mese (dal Worker, /riepilogo), sotto i bottoni la media del giorno mostrato.

   Uso:
     var rv = RegistroVento.monta(elemento, {
       giorno: "YYYY-MM-DD",        // giorno iniziale (default: oggi)
       attendi: true,               // non scarica finché non si chiama rv.carica() (tendina chiusa)
       nomeCampo: ["Campo di regata", "Race course"],
       riepilogo: true              // riepilogo dei giorni ventosi e media della giornata
     });
     RegistroVento.ridisegna();     // dopo un cambio di lingua
   Gli id interni (regGiorno, regCsv…) sono quelli che conta /eventi.js: una sola istanza per pagina. */
(function () {
  "use strict";
  var URL_REG = "https://ventotrieste-dati.bebroggi.workers.dev/registro";
  var URL_RIEP = "https://ventotrieste-dati.bebroggi.workers.dev/riepilogo";
  var SOGLIA_VENTOSO = 15;   // nodi: media della giornata SOPRA questo valore = giorno ventoso
  var MIN_QUARTI = 20;       // quarti d'ora con un dato (su 41) perché la media del giorno valga
  var VENTOSO = "#e8830c";   // la fascia 15-25 nodi di FASCE
  var FASCE = [[8, "#7d8b97"], [15, "#12a58a"], [25, "#e8830c"], [35, "#d9364a"], [Infinity, "#a2358f"]];
  var CARD = {
    it: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"],
    en: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  };
  var FONTE_PC = '<a href="https://monitor.protezionecivile.fvg.it/" target="_blank" rel="noopener">Protezione Civile della Regione Friuli Venezia Giulia</a> · ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/deed.it" target="_blank" rel="noopener">CC BY 4.0</a>';
  var istanze = [];

  function lingua() { return document.documentElement.getAttribute("data-lang") === "en" ? "en" : "it"; }
  function tr(it, en) { return lingua() === "en" ? en : it; }
  function oggiRoma() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date()); }
  function oraRoma() { return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); }
  function sposta(g, d) { var t = new Date(g + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); }
  function num(v, dec) { var s = v.toFixed(dec); return lingua() === "en" ? s : s.replace(".", ","); }
  function colore(kt) { for (var i = 0; i < FASCE.length; i++) if (kt < FASCE[i][0]) return FASCE[i][1]; return FASCE[0][1]; }
  function cardinale(d) { return CARD[lingua()][Math.round(((d % 360) + 360) % 360 / 22.5) % 16]; }
  // freccia verso dove VA il vento (il path punta in basso: ruotato dei gradi di provenienza)
  function freccia(d) {
    return '<svg class="rv-freccia" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(' + Math.round(d) + 'deg)">' +
      '<path d="M12 3v17m-6-6 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function oraLocale(iso) {
    return new Date(iso).toLocaleTimeString(lingua() === "en" ? "en-GB" : "it-IT", { hour: "2-digit", minute: "2-digit" });
  }

  function stili() {
    if (document.getElementById("rvStili")) return;
    var st = document.createElement("style");
    st.id = "rvStili";
    var BORDO = "var(--line,#c8d8dc)", ACC = "var(--bc-boa,var(--sea,#075d70))", TH = "var(--bcn-th,var(--surface-soft,#eef3f5))";
    st.textContent =
      ".rv-ctrl{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:.2rem 0 .5rem}" +
      ".rv-ctrl button,.rv-ctrl input,.rv-tutto{margin:0;min-height:38px;padding:.3rem .65rem;border:1px solid " + BORDO + ";border-radius:3px;" +
        "background:var(--surface,#fff);color:var(--ink,#16232c);font:inherit;font-size:.85rem;font-weight:700;cursor:pointer}" +
      ".rv-ctrl button:disabled{opacity:.45;cursor:default}" +
      ".rv-ctrl #regCsv{margin-left:auto}" +
      ".rv-stato,.rv-nota{margin:.3rem 0 .5rem;font-size:.76rem;line-height:1.45;color:var(--label,var(--muted,#5f7280))}" +
      /* riepilogo dell'ultimo quarto d'ora, in cima */
      ".rv-ultimo{display:flex;flex-wrap:wrap;align-items:baseline;gap:.15rem .6rem;margin:.1rem 0 .6rem;padding:.6rem .75rem;border:1px solid " + BORDO + ";" +
        "border-left:4px solid " + ACC + ";border-radius:3px;background:var(--surface-soft,#f3f7f8)}" +
      ".rv-ultimo span{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-ultimo strong{font-size:1.25rem;color:var(--bcn-title,var(--ink,#16232c))}" +
      ".rv-ultimo em{font-style:normal;font-size:.85rem;color:var(--slate-2,var(--muted,#5f7280));font-weight:600}" +
      /* tabella completa (computer) */
      ".rv-wrap{max-height:70vh;overflow:auto;border:1px solid " + BORDO + ";border-radius:3px;-webkit-overflow-scrolling:touch}" +
      ".rv-tab{width:100%;border-collapse:collapse;font-size:.82rem;font-variant-numeric:tabular-nums;margin:0}" +
      ".rv-larga{min-width:760px}" +
      ".rv-tab th,.rv-tab td{padding:.3rem .45rem;border-bottom:1px solid " + BORDO + ";text-align:left;white-space:nowrap;color:var(--ink,#16232c);background:transparent}" +
      ".rv-tab thead th{position:sticky;top:0;z-index:2;white-space:normal;line-height:1.2;vertical-align:bottom;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;" +
        "font-weight:800;color:var(--bcn-title,var(--sea,#16232c));background:" + TH + "}" +
      ".rv-larga th:first-child,.rv-larga td:first-child{position:sticky;left:0;z-index:1;background:var(--surface,#fff);font-weight:800}" +
      ".rv-larga thead th:first-child{z-index:3;background:" + TH + "}" +
      ".rv-tab .campo{border-left:2px solid " + ACC + ";border-right:2px solid " + ACC + "}" +
      ".rv-tab td.v{background:color-mix(in srgb,var(--c) 16%,transparent)}" +
      ".rv-tab td b{font-size:.92rem}" +
      ".rv-tab td small{color:var(--label,var(--muted,#5f7280));font-weight:600}" +
      ".rv-tab th small{font-weight:600;text-transform:none;letter-spacing:0}" +
      ".rv-freccia{width:.95rem;height:.95rem;vertical-align:-.18rem;margin:0 .1rem 0 .25rem;color:var(--bcn-arrow,var(--sea,#075d70))}" +
      ".rv-tab td i{font-style:normal;font-size:.72rem;color:var(--slate-2,var(--muted,#5f7280));font-weight:700}" +
      ".rv-tab tr.adesso td{box-shadow:inset 0 -2px 0 " + ACC + "}" +
      ".rv-tab tr.adesso td:first-child{color:" + ACC + "}" +
      ".rv-tutto{display:block;width:100%;margin-top:.5rem}" +
      ".rv-tutto[hidden]{display:none}" +
      /* giorni ventosi: riepilogo dei mesi sopra il registro e media del giorno mostrato */
      ".rv-riep{margin:0 0 1rem;padding:.7rem .8rem .2rem;border:1px solid " + BORDO + ";border-radius:3px;background:var(--surface-soft,#f3f7f8)}" +
      ".rv-riep h3{margin:0;font-size:1rem;color:var(--bcn-title,var(--ink,#16232c))}" +
      ".rv-riep .rv-nota{margin:.15rem 0 .55rem}" +
      ".rv-mese{display:grid;grid-template-columns:minmax(12rem,max-content) 1fr;gap:.35rem 1rem;align-items:center;padding:.6rem 0;border-top:1px solid " + BORDO + "}" +
      ".rv-mese-nome{display:block;font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-mese-nome em{font-style:normal;font-weight:600;text-transform:none;letter-spacing:0}" +
      ".rv-mese-conto{font-size:.9rem;font-weight:700;color:var(--ink,#16232c)}" +
      ".rv-mese-conto strong{font-size:1.6rem;line-height:1.1;margin-right:.15rem}" +
      ".rv-mese-conto small{font-size:.78rem;font-weight:600;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-giorni{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;font-size:.78rem;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-giorni button{margin:0;min-height:36px;padding:.25rem .6rem;border:1px solid " + BORDO + ";border-left:4px solid " + VENTOSO + ";border-radius:3px;" +
        "background:color-mix(in srgb," + VENTOSO + " 14%,var(--surface,#fff));color:var(--ink,#16232c);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;white-space:nowrap}" +
      ".rv-giorni button.calmo{border-left-color:" + BORDO + ";background:var(--surface,#fff)}" +
      ".rv-giorni button[aria-pressed=true]{outline:2px solid " + ACC + ";outline-offset:1px}" +
      ".rv-giorni button i{font-style:normal;font-weight:600;color:var(--slate-2,var(--muted,#5f7280))}" +
      ".rv-media{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .55rem;margin:.1rem 0 .6rem;font-size:.9rem;color:var(--ink,#16232c)}" +
      ".rv-media span{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-media strong{font-size:1.05rem}" +
      ".rv-media em{font-style:normal;font-size:.8rem;font-weight:600;color:var(--slate-2,var(--muted,#5f7280))}" +
      ".rv-ctrl{scroll-margin-top:calc(var(--rv-top,0px) + .5rem)}" +
      ".rv-badge{display:inline-block;padding:.15rem .55rem;border:1px solid " + VENTOSO + ";border-radius:999px;background:color-mix(in srgb," + VENTOSO + " 18%,var(--surface,#fff));" +
        "font-size:.76rem;font-weight:800;color:var(--ink,#16232c)}" +
      "@media (max-width:700px){.rv-mese{grid-template-columns:1fr}}" +
      /* telefono: una centralina alla volta, tabella a 4 colonne che sta nello schermo;
         l'intestazione resta attaccata sotto la barra in alto (--rv-top) mentre si scorre la pagina */
      ".rv-mobile{display:none}" +
      ".rv-chips{display:flex;gap:.35rem;overflow-x:auto;padding:.1rem 0 .5rem;-webkit-overflow-scrolling:touch;scrollbar-width:none}" +
      ".rv-chips::-webkit-scrollbar{display:none}" +
      ".rv-chips button{flex:0 0 auto;margin:0;min-height:36px;padding:.3rem .7rem;border:1px solid " + BORDO + ";border-radius:999px;background:var(--surface,#fff);" +
        "color:var(--ink,#16232c);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;white-space:nowrap}" +
      ".rv-chips button[aria-pressed=true]{background:var(--bcn-btn,var(--sea,#075d70));border-color:var(--bcn-btn,var(--sea,#075d70));color:var(--bcn-btn-ink,#fff)}" +
      ".rv-stretta{font-size:.9rem;border:1px solid " + BORDO + "}" +
      ".rv-stretta thead th{top:var(--rv-top,0px)}" +
      ".rv-stretta th,.rv-stretta td{padding:.45rem .5rem}" +
      ".rv-stretta td:first-child{font-weight:800}" +
      ".rv-stretta td b{font-size:1.02rem}" +
      ".rv-solo-mobile{display:none}" +
      "@media (max-width:700px){.rv-wrap,.rv-solo-larga{display:none}.rv-mobile,.rv-solo-mobile{display:flex}.rv-mobile{display:block}}";
    document.head.appendChild(st);
  }

  function monta(root, opz) {
    opz = opz || {};
    stili();
    var serie = "campo";
    try { serie = localStorage.getItem("vt-registro-serie") || "campo"; } catch (e) {}
    var r = { root: root, opz: opz, giorno: opz.giorno || oggiRoma(), dati: null, caricato: false, ultimo: 0, serie: serie, tutto: false };
    root.innerHTML =
      (opz.riepilogo ? '<section class="rv-riep" id="regRiep" aria-label="Giorni ventosi" hidden></section>' : "") +
      '<div class="rv-ctrl">' +
        '<button type="button" id="regPrima">◀</button>' +
        '<input type="date" id="regGiorno" min="2024-01-01">' +
        '<button type="button" id="regDopo">▶</button>' +
        '<button type="button" id="regOggi"></button>' +
        '<button type="button" id="regCsv"></button>' +
      '</div>' +
      '<p class="rv-stato" id="regStato" aria-live="polite"></p>' +
      '<div id="regMedia"></div>' +
      '<div id="regUltimo"></div>' +
      '<div class="rv-wrap"><table class="rv-tab rv-larga" id="regTab"></table></div>' +
      '<div class="rv-mobile"><div class="rv-chips" id="regSerie" role="group"></div><table class="rv-tab rv-stretta" id="regTabM"></table></div>' +
      '<button type="button" class="rv-tutto" id="regTutto" hidden></button>' +
      '<p class="rv-nota" id="regNota"></p>';
    var $ = function (id) { return root.querySelector("#" + id); };
    r.$ = $;
    $("regGiorno").addEventListener("change", function () {
      var v = $("regGiorno").value;
      if (v) carica(r, v > oggiRoma() ? oggiRoma() : v);
    });
    $("regPrima").addEventListener("click", function () { carica(r, sposta(r.giorno, -1)); });
    $("regDopo").addEventListener("click", function () { var g = sposta(r.giorno, 1); if (g <= oggiRoma()) carica(r, g); });
    $("regOggi").addEventListener("click", function () { carica(r, oggiRoma()); });
    $("regCsv").addEventListener("click", function () { csv(r); });
    $("regTutto").addEventListener("click", function () { r.tutto = !r.tutto; disegna(r); });
    $("regSerie").addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-rv-serie]") : null;
      if (!b) return;
      r.serie = b.getAttribute("data-rv-serie");
      try { localStorage.setItem("vt-registro-serie", r.serie); } catch (e) {}
      disegna(r);
    });
    if (opz.riepilogo) $("regRiep").addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-rv-giorno]") : null;
      if (!b) return;
      carica(r, b.getAttribute("data-rv-giorno"));
      // porta in vista il registro, se i mesi lo hanno spinto in basso
      var c = root.querySelector(".rv-ctrl"), y = c.getBoundingClientRect().top;
      if (y < 0 || y > window.innerHeight * 0.45) c.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    istanze.push(r);
    misuraTop();
    testi(r);
    if (opz.riepilogo) caricaRiepilogo(r);
    if (!opz.attendi) carica(r);
    return { carica: function (g) { if (!r.caricato || g) carica(r, g); }, ridisegna: function () { testi(r); disegna(r); } };
  }

  function testi(r) {
    var $ = r.$, nomeCampo = r.opz.nomeCampo || ["Campo di regata", "Race course"];
    [["regPrima", tr("Giorno precedente", "Previous day")], ["regDopo", tr("Giorno successivo", "Next day")]].forEach(function (x) {
      $(x[0]).title = x[1]; $(x[0]).setAttribute("aria-label", x[1]);
    });
    $("regGiorno").setAttribute("aria-label", tr("Giorno", "Day"));
    $("regOggi").textContent = tr("Oggi", "Today");
    $("regCsv").textContent = "⬇ " + tr("Scarica CSV", "Download CSV");
    $("regNota").innerHTML = tr(
      "<b>" + nomeCampo[0] + "</b>: media delle centraline a mare (Barcola, Trieste molo, Muggia, Paloma) pesata sulla distanza dal centro del percorso della Barcolana. " +
      "<b>Barcola</b>: Windguru, medie a 5 minuti; quando l'anemometro segna 0/0 è fermo e non viene contato. " +
      "<b>Trieste molo, Muggia, boa Paloma</b>: Fonte: " + FONTE_PC + " · dati elaborati. " +
      "<b>Monte Grisa</b>: Vetercek, registrata da Vento Trieste dal 30 settembre 2026 (in quota, fuori dalla media). " +
      "<b>Boa Mambo</b>: OGS, un dato all'ora pubblicato con 1-2 ore di ritardo.",
      "<b>" + nomeCampo[1] + "</b>: average of the sea-level stations (Barcola, Trieste pier, Muggia, Paloma) weighted by distance from the centre of the Barcolana course. " +
      "<b>Barcola</b>: Windguru, 5-minute averages; a 0/0 reading means the anemometer is stuck and is not counted. " +
      "<b>Trieste pier, Muggia, Paloma buoy</b>: Source: " + FONTE_PC + " · processed data. " +
      "<b>Monte Grisa</b>: Vetercek, recorded by Vento Trieste since 30 September 2026 (high up, not in the average). " +
      "<b>Mambo buoy</b>: OGS, one reading per hour published 1-2 hours late.");
  }

  function nomeSerie(r, sr) {
    var nc = r.opz.nomeCampo || ["Campo di regata", "Race course"];
    return { campo: tr(nc[0], nc[1]), trieste: tr("Trieste molo", "Trieste pier"), paloma: tr("Boa Paloma", "Paloma buoy"), mambo: tr("Boa Mambo", "Mambo buoy") }[sr.id] || sr.nome;
  }

  /* ---- giorni ventosi ---- */
  function locale() { return lingua() === "en" ? "en-GB" : "it-IT"; }
  function dataFmt(g, o) {
    o.timeZone = "UTC";
    var s = new Intl.DateTimeFormat(locale(), o).format(new Date(g.length === 7 ? g + "-15T12:00:00Z" : g + "T12:00:00Z"));
    return (lingua() === "it" && o.month === "long") ? s.replace(/^1 /, "1° ") : s;    // "1° settembre"
  }

  // media della giornata: media dei quarti d'ora con un dato, arrotondata come nel Worker;
  // direzione prevalente = media vettoriale pesata sul vento
  function mediaGiorno(dati) {
    var v = dati.filter(Boolean), sx = 0, sy = 0;
    if (!v.length) return null;
    v.forEach(function (x) { if (x[2] != null) { sx += x[0] * Math.sin(x[2] * Math.PI / 180); sy += x[0] * Math.cos(x[2] * Math.PI / 180); } });
    return { m: Math.round(v.reduce(function (a, x) { return a + x[0]; }, 0) / v.length * 10) / 10, n: v.length,
      d: (sx || sy) ? Math.round((Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360) : null };
  }

  function caricaRiepilogo(r) {
    clearTimeout(r.tRiep);
    fetch(URL_RIEP + "?ts=" + Date.now())
      .then(function (x) { return x.json(); })
      .then(function (j) {
        if (!j || j.errore || !j.giorni) throw new Error("riepilogo");
        r.riep = j; disegnaRiep(r);
        // dopo il primo avvio il Worker completa lo storico un giorno alla volta
        if (j.mancanti) r.tRiep = setTimeout(function () { caricaRiepilogo(r); }, 120000);
      })
      .catch(function () {});   // senza riepilogo il registro funziona lo stesso
  }

  /* Mese per mese, dal più recente: quanti giorni ventosi su quanti giorni con dati, e i
     giorni ventosi come bottoni che aprono quel giorno nel registro. */
  function disegnaRiep(r) {
    var box = r.$("regRiep"), j = r.riep;
    if (!box || !j) return;
    var mesi = {}, ordine = [], senzaB = null, meseOggi = oggiRoma().slice(0, 7);
    var nomeC = (r.opz.nomeCampo || ["Campo di regata", "Race course"])[lingua() === "en" ? 1 : 0];
    Object.keys(j.giorni).sort().forEach(function (g) {
      var x = j.giorni[g];
      if (x.m == null || !(x.n >= MIN_QUARTI)) return;
      var k = g.slice(0, 7), giorno = { g: g, m: x.m, d: x.d };
      if (!mesi[k]) { mesi[k] = { tot: 0, ventosi: [], max: null }; ordine.unshift(k); }
      mesi[k].tot++;
      if (x.m > SOGLIA_VENTOSO) mesi[k].ventosi.push(giorno);
      if (!mesi[k].max || x.m > mesi[k].max.m) mesi[k].max = giorno;
      if (x.sb) senzaB = g;
    });
    var chip = function (x, calmo) {
      return '<button type="button" data-rv-giorno="' + x.g + '"' + (calmo ? ' class="calmo"' : "") + ' aria-pressed="' + (x.g === r.giorno) + '">' +
        dataFmt(x.g, { day: "numeric", month: "short" }) + " · " + num(x.m, 1) + " kt" + (x.d != null ? " <i>" + cardinale(x.d) + "</i>" : "") + "</button>";
    };
    var giorni = function (n) { return n + " " + (n === 1 ? tr("giorno", "day") : tr("giorni", "days")); };
    box.innerHTML = "<h3>" + tr("Giorni ventosi", "Windy days") + "</h3>" +
      '<p class="rv-nota">' + tr(
        "Un giorno è ventoso quando la <b>media della giornata</b> supera i " + SOGLIA_VENTOSO + " nodi: la media dei quarti d'ora dalle 8 alle 18 della colonna «" + nomeC + "». " +
          "Dati dal " + dataFmt(j.dal, { day: "numeric", month: "long", year: "numeric" }) + ". Tocca un giorno per aprirlo nel registro.",
        "A day is windy when the <b>daily average</b> is above " + SOGLIA_VENTOSO + " knots: the average of the 8:00-18:00 quarter-hours in the «" + nomeC + "» column. " +
          "Data since " + dataFmt(j.dal, { day: "numeric", month: "long", year: "numeric" }) + ". Tap a day to open it in the log.") +
      (j.mancanti ? " <b>" + tr("Sto completando lo storico: mancano ancora " + giorni(j.mancanti) + ".", "Still filling in the history: " + giorni(j.mancanti) + " to go.") + "</b>" : "") + "</p>" +
      ordine.map(function (k) {
        var M = mesi[k], n = M.ventosi.length;
        return '<div class="rv-mese"><div><span class="rv-mese-nome">' + dataFmt(k, { month: "long", year: "numeric" }) +
            (k === meseOggi ? " <em>· " + tr("in corso", "so far") + "</em>" : "") + "</span>" +
            '<span class="rv-mese-conto"><strong>' + n + "</strong> " + (n === 1 ? tr("giorno ventoso", "windy day") : tr("giorni ventosi", "windy days")) +
            " <small>" + tr("su ", "out of ") + giorni(M.tot) + "</small></span></div>" +
          '<div class="rv-giorni">' + (n ? M.ventosi.map(function (x) { return chip(x); }).join("") :
            tr("Nessuno. Il più ventoso:", "None. Windiest:") + " " + chip(M.max, true)) + "</div></div>";
      }).join("") +
      (senzaB ? '<p class="rv-nota">' + tr("Fino al " + dataFmt(senzaB, { day: "numeric", month: "long" }) + " la media è senza Barcola: Windguru ne conserva lo storico solo per due settimane.",
        "Until " + dataFmt(senzaB, { day: "numeric", month: "long" }) + " the average is without Barcola: Windguru only keeps two weeks of its history.") + "</p>" : "");
    box.hidden = !ordine.length && !j.mancanti;
  }

  // sotto i bottoni: media in golfo del giorno mostrato (per oggi, fino all'ultimo quarto d'ora)
  function rigaMedia(r, d, eOggi, fine) {
    var mg = mediaGiorno(d.serie[0].dati), nomeC = nomeSerie(r, d.serie[0]);
    if (!mg) return "";
    if (!eOggi && mg.n < MIN_QUARTI) return '<div class="rv-media"><span>' + tr("Media della giornata", "Daily average") + "</span><em>" +
      tr("troppo pochi dati (" + mg.n + " quarti d'ora su " + d.slot.length + ")", "not enough data (" + mg.n + " of " + d.slot.length + " quarter-hours)") + "</em></div>";
    var ventoso = mg.m > SOGLIA_VENTOSO;
    return '<div class="rv-media"><span>' + (eOggi ? tr("Media di oggi finora", "Today's average so far") : tr("Media della giornata", "Daily average")) +
      " · " + nomeC + " · 8:00-" + (eOggi ? d.slot[fine] : "18:00") + "</span><strong>" + num(mg.m, 1) + " kt</strong>" +
      (mg.d != null ? "<em>" + tr("da ", "from ") + cardinale(mg.d) + "</em>" : "") +
      (ventoso ? '<b class="rv-badge">' + (eOggi ? tr("Per ora è un giorno ventoso", "Windy day so far") : tr("Giorno ventoso", "Windy day")) + "</b>" :
        "<em>· " + tr("sotto i " + SOGLIA_VENTOSO + " nodi, non ventoso", "below " + SOGLIA_VENTOSO + " knots, not windy") + "</em>") + "</div>";
  }

  var RIGHE_BREVI = 12;   // ultime 3 ore; il resto con "Mostra tutta la giornata"

  function cella(v, cls, vuota) {
    if (!v) return '<td class="' + cls + '">' + vuota + "</td>";
    var forte = v[0] >= 8;
    return '<td class="' + cls + (forte ? " v" : "") + '"' + (forte ? ' style="--c:' + colore(v[0]) + '"' : "") + "><b>" + num(v[0], 1) + "</b>" +
      (v[1] != null ? "<small>/" + num(v[1], 0) + "</small>" : "") +
      (v[2] != null ? freccia(v[2]) + "<i>" + cardinale(v[2]) + "</i>" : "") + "</td>";
  }

  /* Righe dalla più recente: per oggi solo fino al quarto d'ora appena chiuso (niente righe
     vuote del pomeriggio), di default le ultime 3 ore. Su computer tutte le centraline; su
     telefono una alla volta, scelta coi bottoni, con l'intestazione sempre visibile. */
  function disegna(r) {
    var d = r.dati, $ = r.$, st = $("regStato");
    if (r.opz.riepilogo) disegnaRiep(r);           // il giorno aperto si vede premuto nei mesi
    if (!d || !d.serie) { $("regTab").innerHTML = ""; $("regTabM").innerHTML = ""; $("regUltimo").innerHTML = ""; $("regMedia").innerHTML = ""; $("regTutto").hidden = true; return; }
    var oggi = oggiRoma(), ora = oraRoma(), eOggi = d.giorno === oggi, futuro = d.giorno > oggi;
    var fine = d.slot.length - 1;
    if (eOggi) { fine = -1; d.slot.forEach(function (h, i) { if (h <= ora) fine = i; }); }
    if (futuro) fine = -1;
    var ordine = [];
    for (var i = fine; i >= 0; i--) ordine.push(i);
    var righe = r.tutto ? ordine : ordine.slice(0, RIGHE_BREVI);
    var vuota = function (sr, i) { return (sr.oraria && d.slot[i].slice(3) !== "00") ? "" : "–"; };

    // riepilogo: ultimo quarto d'ora con un dato per la serie mostrata (campo su computer)
    var mostra = d.serie.filter(function (sr) { return sr.id === r.serie; })[0] || d.serie[0];
    var riep = function (sr) {
      for (var k = 0; k < ordine.length; k++) { var v = sr.dati[ordine[k]]; if (v) return { i: ordine[k], v: v }; }
      return null;
    };
    var box = function (sr, cls) {
      var u = riep(sr);
      return u ? '<div class="rv-ultimo ' + cls + '"><span>' + (eOggi ? tr("Ultimo dato", "Latest") : tr("Ultimo dato del giorno", "Last reading of the day")) + " · " +
        d.slot[u.i] + " · " + nomeSerie(r, sr) + "</span><strong>" + num(u.v[0], 1) + " kt</strong><em>" +
        (u.v[1] != null ? tr("raffica ", "gust ") + num(u.v[1], 0) + " kt" : "") +
        (u.v[2] != null ? " · " + tr("da ", "from ") + cardinale(u.v[2]) + " " + freccia(u.v[2]) : "") + "</em></div>" : "";
    };
    $("regMedia").innerHTML = r.opz.riepilogo ? rigaMedia(r, d, eOggi, fine) : "";
    // su computer la media sul campo, su telefono la centralina scelta
    $("regUltimo").innerHTML = box(d.serie[0], "rv-solo-larga") + box(mostra, "rv-solo-mobile");

    // tabella completa
    $("regTab").innerHTML = "<thead><tr><th>" + tr("Ora", "Time") + "</th>" + d.serie.map(function (sr) {
      return '<th class="' + (sr.id === "campo" ? "campo" : "") + '">' + nomeSerie(r, sr) + (sr.oraria ? " <small>(" + tr("oraria", "hourly") + ")</small>" : "") + "</th>";
    }).join("") + "</tr></thead><tbody>" + righe.map(function (i) {
      return '<tr class="' + (eOggi && i === fine ? "adesso" : "") + '"><td>' + d.slot[i] + "</td>" + d.serie.map(function (sr) {
        return cella(sr.dati[i], sr.id === "campo" ? "campo" : "", vuota(sr, i));
      }).join("") + "</tr>";
    }).join("") + "</tbody>";

    // telefono: bottoni delle centraline + tabella della centralina scelta
    $("regSerie").innerHTML = d.serie.map(function (sr) {
      return '<button type="button" data-rv-serie="' + sr.id + '" aria-pressed="' + (sr.id === mostra.id) + '">' + nomeSerie(r, sr) + "</button>";
    }).join("");
    $("regSerie").setAttribute("aria-label", tr("Centralina", "Station"));
    $("regTabM").innerHTML = "<thead><tr><th>" + tr("Ora", "Time") + "</th><th>" + nomeSerie(r, mostra) + " <small>" + tr("medio", "mean") + "</small></th><th>" + tr("Raffica", "Gust") + "</th><th>" + tr("Da", "From") + "</th></tr></thead><tbody>" +
      righe.map(function (i) {
        var v = mostra.dati[i], cls = eOggi && i === fine ? "adesso" : "";
        if (!v) return '<tr class="' + cls + '"><td>' + d.slot[i] + '</td><td colspan="3">' + vuota(mostra, i) + "</td></tr>";
        var forte = v[0] >= 8, tinta = forte ? ' class="v" style="--c:' + colore(v[0]) + '"' : "";
        return '<tr class="' + cls + '"><td>' + d.slot[i] + "</td><td" + tinta + "><b>" + num(v[0], 1) + "</b></td><td>" +
          (v[1] != null ? num(v[1], 0) : "–") + "</td><td>" + (v[2] != null ? freccia(v[2]) + "<i>" + cardinale(v[2]) + "</i>" : "–") + "</td></tr>";
      }).join("") + "</tbody>";

    var piu = ordine.length - RIGHE_BREVI;
    $("regTutto").hidden = piu <= 0;
    $("regTutto").textContent = r.tutto ? tr("Mostra solo le ultime 3 ore", "Show only the last 3 hours") :
      tr("Mostra tutta la giornata (altri " + piu + " orari)", "Show the whole day (" + piu + " more)");

    var n = d.serie[0].dati.filter(Boolean).length;
    st.textContent = futuro ? tr("Giorno futuro: il registro si riempie dalle 8 di quel giorno.", "Future day: the log fills up from 8:00 that day.") :
      (eOggi && fine < 0) ? tr("Il registro di oggi parte alle 8:00.", "Today's log starts at 8:00.") :
      (n ? "" : tr("Nessun dato per questo giorno. ", "No data for this day. ")) +
      (eOggi ? tr("Oggi: si aggiorna da solo ogni 5 minuti. ", "Today: updates itself every 5 minutes. ") : "") +
      tr("Aggiornato alle ", "Updated at ") + oraLocale(d.aggiornato) +
      (d.errori ? tr(" · alcune fonti non hanno risposto, riprova più tardi", " · some sources did not respond, try again later") : "");
  }

  /* altezza della barra in alto (se resta fissa): l'intestazione della tabella su telefono
     si ferma subito sotto, invece di finirci dietro */
  function misuraTop() {
    var tb = document.querySelector(".topbar"), h = 0;
    if (tb) { var pos = getComputedStyle(tb).position; if (pos === "sticky" || pos === "fixed") h = Math.round(tb.getBoundingClientRect().height); }
    istanze.forEach(function (r) { r.root.style.setProperty("--rv-top", h + "px"); });
  }
  window.addEventListener("resize", function () { clearTimeout(misuraTop.t); misuraTop.t = setTimeout(misuraTop, 150); });

  function carica(r, giorno) {
    if (giorno && giorno !== r.giorno) r.tutto = false;
    if (giorno) r.giorno = giorno;
    r.caricato = true;
    var g = r.giorno, $ = r.$;
    $("regGiorno").value = g;
    $("regGiorno").max = oggiRoma();
    $("regDopo").disabled = g >= oggiRoma();
    if (!r.dati || r.dati.giorno !== g) $("regStato").textContent = tr("Carico il registro…", "Loading the log…");
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 45000) : null;
    return fetch(URL_REG + "?giorno=" + g + "&ts=" + Date.now(), ctl ? { signal: ctl.signal } : undefined)
      .then(function (x) { return x.json(); })
      .then(function (d) {
        if (r.giorno !== g) return;                // nel frattempo è stato scelto un altro giorno
        if (d.errore) throw new Error(d.errore);
        r.dati = d; r.ultimo = Date.now(); disegna(r);
      })
      .catch(function () {
        if (r.giorno !== g) return;
        $("regStato").textContent = tr("Registro al momento non disponibile, riprova tra poco.", "Log not available right now, please try again shortly.");
      })
      .then(function () { if (t) clearTimeout(t); });
  }

  function csv(r) {
    var d = r.dati;
    if (!d || !d.serie) return;
    var en = lingua() === "en", sep = en ? "," : ";";
    var n = function (v) { return v == null ? "" : (en ? String(v) : String(v).replace(".", ",")); };
    var intest = [en ? "Time" : "Ora"];
    d.serie.forEach(function (sr) {
      var nome = nomeSerie(r, sr);
      intest.push(nome + (en ? " mean kt" : " medio kt"), nome + (en ? " gust kt" : " raffica kt"), nome + (en ? " dir °" : " direzione °"));
    });
    var righe = [intest].concat(d.slot.map(function (h, i) {
      var riga = [h];
      d.serie.forEach(function (sr) { var v = sr.dati[i]; riga.push(v ? n(v[0]) : "", v ? n(v[1]) : "", v && v[2] != null ? String(v[2]) : ""); });
      return riga;
    }));
    var cella = function (c) { return (c.indexOf(sep) !== -1 || /["\n]/.test(c)) ? '"' + c.replace(/"/g, '""') + '"' : c; };
    var testo = "﻿" + (en ? "# Wind log " : "# Registro del vento ") + d.giorno + " · ventotrieste.info\n" +
      righe.map(function (riga) { return riga.map(cella).join(sep); }).join("\n") + "\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([testo], { type: "text/csv;charset=utf-8" }));
    a.download = "registro-vento-" + d.giorno + ".csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // oggi, dalle 7:45 alle 18:30, si rinnova ogni 5 minuti (scheda visibile e registro già aperto)
  function rinnova() {
    var o = oraRoma(), oggi = oggiRoma();
    istanze.forEach(function (r) {
      if (r.caricato && r.giorno === oggi && o >= "07:45" && o <= "18:30" && Date.now() - r.ultimo > 4 * 60000) carica(r);
    });
  }
  setInterval(function () { if (!document.hidden) rinnova(); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) rinnova(); });

  window.RegistroVento = {
    monta: monta,
    ridisegna: function () { istanze.forEach(function (r) { testi(r); disegna(r); }); }
  };
})();
