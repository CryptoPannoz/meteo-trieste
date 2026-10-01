/* registro-vento.js — Registro del vento del Golfo di Trieste (1 ott 2026).

   Dalle 8 alle 18, un valore ogni 15 minuti per Barcola, Trieste molo, Muggia, boa Paloma,
   Monte Grisa e boa Mambo, più la media sul campo di regata della Barcolana. Ogni casella
   = i 15 minuti che finiscono a quell'ora: vento medio, raffica massima, direzione (nodi).
   I dati li prepara il Worker Cloudflare (cloudflare-worker/dati, /registro?giorno=).

   Usato da /registro/ (pagina di Vento Trieste) e da /barcolana2026/ (sezione a tendina).
   Autonomo: stili, testi IT/EN (lingua da <html data-lang>), frecce e colori suoi; prende
   i colori della pagina dalle variabili CSS quando ci sono (--line, --surface, --label…).

   Uso:
     var rv = RegistroVento.monta(elemento, {
       giorno: "YYYY-MM-DD",        // giorno iniziale (default: oggi)
       attendi: true,               // non scarica finché non si chiama rv.carica() (tendina chiusa)
       nomeCampo: ["Campo di regata", "Race course"]
     });
     RegistroVento.ridisegna();     // dopo un cambio di lingua
   Gli id interni (regGiorno, regCsv…) sono quelli che conta /eventi.js: una sola istanza per pagina. */
(function () {
  "use strict";
  var URL_REG = "https://ventotrieste-dati.bebroggi.workers.dev/registro";
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
    st.textContent =
      ".rv-ctrl{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:.2rem 0 .5rem}" +
      ".rv-ctrl button,.rv-ctrl input{margin:0;min-height:38px;padding:.3rem .65rem;border:1px solid var(--line,#c8d8dc);border-radius:3px;" +
        "background:var(--surface,#fff);color:var(--ink,#16232c);font:inherit;font-size:.85rem;font-weight:700;cursor:pointer}" +
      ".rv-ctrl button:disabled{opacity:.45;cursor:default}" +
      ".rv-ctrl #regCsv{margin-left:auto}" +
      ".rv-stato,.rv-nota{margin:.3rem 0 .5rem;font-size:.76rem;line-height:1.45;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-wrap{max-height:70vh;overflow:auto;border:1px solid var(--line,#c8d8dc);border-radius:3px;-webkit-overflow-scrolling:touch}" +
      ".rv-tab{width:100%;min-width:760px;border-collapse:collapse;font-size:.82rem;font-variant-numeric:tabular-nums;margin:0}" +
      ".rv-tab th,.rv-tab td{padding:.3rem .45rem;border-bottom:1px solid var(--line,#c8d8dc);text-align:left;white-space:nowrap;color:var(--ink,#16232c);background:transparent}" +
      ".rv-tab thead th{position:sticky;top:0;z-index:2;white-space:normal;line-height:1.2;vertical-align:bottom;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;" +
        "font-weight:800;color:var(--bcn-title,var(--sea,#16232c));background:var(--bcn-th,var(--surface-soft,#eef3f5))}" +
      ".rv-tab th:first-child,.rv-tab td:first-child{position:sticky;left:0;z-index:1;background:var(--surface,#fff);font-weight:800}" +
      ".rv-tab thead th:first-child{z-index:3;background:var(--bcn-th,var(--surface-soft,#eef3f5))}" +
      ".rv-tab .campo{border-left:2px solid var(--bc-boa,var(--sea,#075d70));border-right:2px solid var(--bc-boa,var(--sea,#075d70))}" +
      ".rv-tab td.v{background:color-mix(in srgb,var(--c) 16%,transparent)}" +
      ".rv-tab td b{font-size:.92rem}" +
      ".rv-tab td small{color:var(--label,var(--muted,#5f7280));font-weight:600}" +
      ".rv-tab th small{font-weight:600;text-transform:none;letter-spacing:0}" +
      ".rv-freccia{width:.95rem;height:.95rem;vertical-align:-.18rem;margin:0 .1rem 0 .25rem;color:var(--bcn-arrow,var(--sea,#075d70))}" +
      ".rv-tab td i{font-style:normal;font-size:.72rem;color:var(--slate-2,var(--muted,#5f7280));font-weight:700}" +
      ".rv-tab tr.adesso td{box-shadow:inset 0 2px 0 var(--bc-boa,var(--sea,#075d70)),inset 0 -2px 0 var(--bc-boa,var(--sea,#075d70))}";
    document.head.appendChild(st);
  }

  function monta(root, opz) {
    opz = opz || {};
    stili();
    var r = { root: root, opz: opz, giorno: opz.giorno || oggiRoma(), dati: null, caricato: false, ultimo: 0 };
    root.innerHTML =
      '<div class="rv-ctrl">' +
        '<button type="button" id="regPrima">◀</button>' +
        '<input type="date" id="regGiorno" min="2024-01-01">' +
        '<button type="button" id="regDopo">▶</button>' +
        '<button type="button" id="regOggi"></button>' +
        '<button type="button" id="regCsv"></button>' +
      '</div>' +
      '<p class="rv-stato" id="regStato" aria-live="polite"></p>' +
      '<div class="rv-wrap"><table class="rv-tab" id="regTab"></table></div>' +
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
    istanze.push(r);
    testi(r);
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

  function disegna(r) {
    var d = r.dati, tab = r.$("regTab"), st = r.$("regStato");
    if (!d || !d.serie) { tab.innerHTML = ""; return; }
    var oggi = oggiRoma(), ora = oraRoma(), eOggi = d.giorno === oggi, futuro = d.giorno > oggi, iAdesso = -1;
    // quarto d'ora in corso: l'ultimo già chiuso (alle 10:07 è la riga delle 10:00)
    if (eOggi) d.slot.forEach(function (h, i) { if (h <= ora) iAdesso = i; });
    var html = "<thead><tr><th>" + tr("Ora", "Time") + "</th>" + d.serie.map(function (sr) {
      return '<th class="' + (sr.id === "campo" ? "campo" : "") + '">' + nomeSerie(r, sr) + (sr.oraria ? " <small>(" + tr("oraria", "hourly") + ")</small>" : "") + "</th>";
    }).join("") + "</tr></thead><tbody>";
    html += d.slot.map(function (h, i) {
      var dopo = futuro || (eOggi && i > iAdesso);
      return '<tr class="' + (i === iAdesso ? "adesso" : "") + '"><td>' + h + "</td>" + d.serie.map(function (sr) {
        var v = sr.dati[i], cls = sr.id === "campo" ? "campo" : "";
        if (!v) return '<td class="' + cls + '">' + (dopo || (sr.oraria && h.slice(3) !== "00") ? "" : "–") + "</td>";
        var forte = v[0] >= 8;
        return '<td class="' + cls + (forte ? " v" : "") + '"' + (forte ? ' style="--c:' + colore(v[0]) + '"' : "") + "><b>" + num(v[0], 1) + "</b>" +
          (v[1] != null ? "<small>/" + num(v[1], 0) + "</small>" : "") +
          (v[2] != null ? freccia(v[2]) + "<i>" + cardinale(v[2]) + "</i>" : "") + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody>";
    tab.innerHTML = html;
    var n = d.serie[0].dati.filter(Boolean).length;
    st.textContent = futuro ? tr("Giorno futuro: il registro si riempie dalle 8 di quel giorno.", "Future day: the log fills up from 8:00 that day.") :
      (n ? "" : tr("Nessun dato per questo giorno. ", "No data for this day. ")) +
      (eOggi ? tr("Oggi: si aggiorna da solo ogni 5 minuti. ", "Today: updates itself every 5 minutes. ") : "") +
      tr("Aggiornato alle ", "Updated at ") + oraLocale(d.aggiornato) +
      (d.errori ? tr(" · alcune fonti non hanno risposto, riprova più tardi", " · some sources did not respond, try again later") : "");
  }

  function carica(r, giorno) {
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
