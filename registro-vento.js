/* registro-vento.js — Registro del vento del Golfo di Trieste (1 ott 2026).

   Dalle 6 alle 19 (fino al 2 ott 2026: 8-18), un valore ogni 15 minuti per Barcola, Trieste
   molo, Muggia, boa Paloma, Monte Grisa e boa Mambo, più la media sul campo di regata della Barcolana. Ogni casella
   = i 15 minuti che finiscono a quell'ora: vento medio, raffica massima, direzione (nodi).
   I dati li prepara il Worker Cloudflare (cloudflare-worker/dati, /registro?giorno=).

   Usato da /registro/ (pagina di Vento Trieste) e da /barcolana2026/ (sezione a tendina).
   Autonomo: stili, testi IT/EN (lingua da <html data-lang>), frecce e colori suoi; prende
   i colori della pagina dalle variabili CSS quando ci sono (--line, --surface, --label…).

   Giornate surfabili (2 ott 2026, solo con l'opzione riepilogo): la prima colonna (media sul
   campo / in golfo) sopra SOGLIA nodi per almeno ORE_SURF ore dei quarti d'ora 6-19. Sopra la
   tabella un grafico per mese o settimana: per ogni giorno la raffica massima (il picco più
   alto tra le centraline a mare) e, dentro, la media della giornata; il surfista 🏄‍♂️ sulle giornate surfabili, contate sopra il grafico (dati
   dal Worker, /riepilogo). Sotto i bottoni la stessa sintesi del giorno mostrato.
   Meteo del giorno (sopra le colonne): sole, sole e nuvole, nuvoloso o pioggia, dal Worker
   (pioggia e radiazione solare di Trieste molo, Protezione Civile FVG).

   Uso:
     var rv = RegistroVento.monta(elemento, {
       giorno: "YYYY-MM-DD",        // giorno iniziale (default: oggi)
       attendi: true,               // non scarica finché non si chiama rv.carica() (tendina chiusa)
       nomeCampo: ["Campo di regata", "Race course"],
       riepilogo: true,             // grafico delle giornate surfabili e sintesi del giorno
       finestra: ["08:00", "18:00"],// mostra (e scarica) solo questi orari del registro
       senzaSurf: true,             // grafico senza surfista, soglia e conto delle giornate (Barcolana)
       periodo: "30",               // grafico sugli ultimi 30 giorni invece di Mese/Settimana
       evento: { giorno: "2026-10-11", segno: "⛵", nome: ["giorno della Barcolana", "Barcolana race day"] }
     });
     RegistroVento.ridisegna();     // dopo un cambio di lingua
   Gli id interni (regGiorno, regCsv…) sono quelli che conta /eventi.js: una sola istanza per pagina. */
(function () {
  "use strict";
  var URL_REG = "https://ventotrieste-dati.bebroggi.workers.dev/registro";
  var URL_RIEP = "https://ventotrieste-dati.bebroggi.workers.dev/riepilogo";
  var SOGLIA = 12;           // nodi: la media del quarto d'ora deve stare SOPRA questo valore… (15 fino al 2 ott sera)
  var ORE_SURF = 4;          // …per almeno queste ore (16 quarti d'ora) = giornata surfabile (6 fino al 2 ott sera)
  var MIN_QUARTI = 26;       // quarti d'ora con un dato (su 53) perché il giorno valga
  var MARE = ["barcola", "trieste", "muggia", "paloma"];   // centraline a mare: da qui il picco di raffica
  // colori del grafico, verificati con validate_palette (contrasto e daltonismo, tutti e tre insieme).
  // Sono variabili CSS: una pagina scura le ridefinisce (home: --rv-media #3a72cc, --rv-raffica
  // #1fa7a0, --rv-surf #e4475d, validati sul fondo scuro #151b21).
  var C_MEDIA = "var(--rv-media,#1f5f99)", C_RAFFICA = "var(--rv-raffica,#2b9cb0)", C_SURF = "var(--rv-surf,#d9364a)";
  var ORA_FINE = "19";       // fine del registro (Worker REG_ULTIMA), per "il giorno si chiude alle…"
  var FASCE = [[8, "#7d8b97"], [15, "#12a58a"], [25, "#e8830c"], [35, "#d9364a"], [Infinity, "#a2358f"]];
  var CARD = {
    it: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"],
    en: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
  };
  var FONTE_PC = '<a href="https://monitor.protezionecivile.fvg.it/" target="_blank" rel="noopener">Protezione Civile della Regione Friuli Venezia Giulia</a> · ' +
    '<a href="https://creativecommons.org/licenses/by/4.0/deed.it" target="_blank" rel="noopener">CC BY 4.0</a>';
  var istanze = [], grafici = [];

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
      /* giornate surfabili: grafico sopra il registro e sintesi del giorno mostrato */
      ".rv-riep{margin:0 0 1rem;padding:.7rem .8rem .2rem;border:1px solid " + BORDO + ";border-radius:3px;background:var(--surface-soft,#f3f7f8)}" +
      ".rv-riep h3{margin:0;font-size:1rem;color:var(--bcn-title,var(--ink,#16232c))}" +
      ".rv-riep .rv-nota{margin:.15rem 0 .55rem}" +
      ".rv-graf-testa{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.45rem .8rem;margin:.2rem 0 .6rem}" +
      ".rv-seg{display:inline-flex;border:1px solid " + BORDO + ";border-radius:3px;overflow:hidden}" +
      ".rv-seg button{margin:0;min-height:36px;padding:.25rem .8rem;border:0;background:var(--surface,#fff);color:var(--ink,#16232c);font:inherit;font-size:.82rem;font-weight:700;cursor:pointer}" +
      ".rv-seg button+button{border-left:1px solid " + BORDO + "}" +
      ".rv-seg button[aria-pressed=true]{background:var(--bcn-btn,var(--sea,#075d70));color:var(--bcn-btn-ink,#fff)}" +
      ".rv-per{display:flex;align-items:center;gap:.35rem}" +
      ".rv-per button{margin:0;min-width:38px;min-height:36px;padding:.2rem .5rem;border:1px solid " + BORDO + ";border-radius:3px;background:var(--surface,#fff);color:var(--ink,#16232c);font:inherit;font-weight:700;cursor:pointer}" +
      ".rv-per button:disabled{opacity:.4;cursor:default}" +
      ".rv-per strong{min-width:10rem;text-align:center;font-size:.92rem;color:var(--ink,#16232c)}" +
      ".rv-conto{display:flex;align-items:center;flex-wrap:wrap;gap:.2rem .45rem;margin:0 0 .55rem;font-size:.9rem;font-weight:700;color:var(--ink,#16232c)}" +
      ".rv-conto strong{font-size:1.6rem;line-height:1}" +
      ".rv-conto em{font-style:normal;font-size:.8rem;font-weight:600;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-surfista{display:inline-block;flex:0 0 auto;font-style:normal;font-size:1rem;line-height:1}" +
      ".rv-conto .rv-surfista{font-size:1.35rem}" +
      /* grafico: colonne in HTML (bottoni), griglia e soglia sotto; l'altezza include l'asse x */
      ".rv-plot{position:relative;height:170px;margin:0 .1rem 0 1.9rem}" +
      ".rv-gl{position:absolute;left:0;right:0;height:0;border-top:1px solid color-mix(in srgb," + BORDO + " 70%,transparent)}" +
      ".rv-gl span{position:absolute;right:100%;top:-.45rem;padding-right:.4rem;font-size:.66rem;line-height:1;font-weight:600;color:var(--label,var(--muted,#5f7280));font-variant-numeric:tabular-nums}" +
      ".rv-gl.base{border-top-color:" + BORDO + "}" +
      ".rv-gl.soglia{border-top:2px dashed " + C_SURF + ";z-index:2;pointer-events:none}" +
      ".rv-gl.soglia span{font-weight:800;color:var(--ink,#16232c)}" +
      ".rv-colonne{position:absolute;inset:0;display:flex}" +
      ".rv-col{position:relative;flex:1 1 0;min-width:0;margin:0;padding:0;border:0;border-radius:3px 3px 0 0;background:transparent;cursor:pointer}" +
      ".rv-col:disabled{cursor:default}" +
      ".rv-col:hover:not(:disabled),.rv-col[aria-pressed=true]{background:color-mix(in srgb," + C_MEDIA + " 8%,transparent)}" +
      ".rv-col:focus-visible{outline:2px solid " + ACC + ";outline-offset:-2px}" +
      /* colonna = raffica massima (dietro) con dentro la media (davanti), separate da 2px di sfondo */
      ".rv-col i{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:72%;max-width:24px;min-height:2px;border-radius:4px 4px 0 0;background:" + C_RAFFICA + "}" +
      ".rv-col i.med{background:" + C_MEDIA + ";border-radius:0;box-shadow:0 -2px 0 var(--surface-soft,#f3f7f8);z-index:1}" +
      ".rv-col i.med.sola{border-radius:4px 4px 0 0;box-shadow:none}" +
      ".rv-col.oggi i{opacity:.4}" +
      ".rv-col b{position:absolute;left:50%;transform:translateX(-50%);font-size:17px;line-height:1;font-weight:400;z-index:3;pointer-events:none}" +
      ".rv-col.oggi b{opacity:.55}" +
      ".rv-col small{position:absolute;left:50%;transform:translateX(-50%);font-size:.7rem;font-weight:800;color:var(--ink,#16232c);white-space:nowrap;z-index:3}" +
      ".rv-assex{display:flex;margin:.3rem .1rem 0 1.9rem;font-size:.66rem;font-weight:600;color:var(--label,var(--muted,#5f7280));font-variant-numeric:tabular-nums}" +
      ".rv-assex span{flex:1 1 0;min-width:0;text-align:center;white-space:nowrap;overflow:visible}" +
      /* direzione media sotto l'asse: freccia (dove va) e sigla (da dove viene) per ogni giorno */
      ".rv-dirx{position:relative;display:flex;margin:.3rem .1rem 0 1.9rem;font-size:.58rem;font-weight:800;line-height:1.1;color:var(--slate-2,var(--muted,#5f7280))}" +
      ".rv-dirx>b{position:absolute;right:100%;top:.05rem;padding-right:.4rem;font-size:.6rem;font-weight:700;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-dirx>span{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:.12rem;white-space:nowrap}" +
      ".rv-dirx>span.oggi{opacity:.5}" +
      ".rv-dirx i{font-style:normal}" +
      /* meteo del giorno sopra il grafico (icone a tratto: sole ambra, gocce blu, nuvole grigie) */
      ".rv-meteo{display:flex;margin:0 .1rem .3rem 1.9rem;color:var(--slate-2,var(--muted,#5f7280))}" +
      ".rv-meteo>span{flex:1 1 0;min-width:0;display:flex;justify-content:center}" +
      ".rv-meteo>span.oggi{opacity:.55}" +
      ".rv-meteo-ico{width:min(18px,100%);height:auto;aspect-ratio:1;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}" +
      ".rv-meteo.sett .rv-meteo-ico{width:24px}" +
      ".rv-legenda .rv-meteo-ico,.rv-meteo-txt .rv-meteo-ico{width:16px;color:var(--slate-2,var(--muted,#5f7280))}" +
      ".rv-legenda .rv-meteo-ico+.rv-meteo-ico{margin-left:-.2rem}" +
      ".rv-meteo-txt{display:inline-flex;align-items:center;gap:.25rem}" +
      ".rv-dirx .rv-freccia{width:.85rem;height:.85rem;margin:0;vertical-align:0}" +
      ".rv-dirx.sett{font-size:.72rem}.rv-dirx.sett .rv-freccia{width:1rem;height:1rem}" +
      "@media (max-width:700px){.rv-dirx.mese .rv-freccia{width:.62rem;height:.62rem}.rv-dirx.mese i{writing-mode:vertical-rl;transform:rotate(180deg);font-size:.54rem}}" +
      ".rv-legenda{display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin:.55rem 0 0;font-size:.74rem;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-legenda span{display:inline-flex;align-items:center;gap:.35rem}" +
      ".rv-k-media,.rv-k-raffica{display:inline-block;width:9px;height:12px;border-radius:2px 2px 0 0;background:" + C_MEDIA + "}" +
      ".rv-k-raffica{background:" + C_RAFFICA + "}" +
      ".rv-k-soglia{display:inline-block;width:18px;border-top:2px dashed " + C_SURF + "}" +
      ".rv-lettura{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .55rem;min-height:2.6rem;margin:.5rem 0 0;padding:.45rem .6rem;border:1px solid " + BORDO + ";border-radius:3px;background:var(--surface,#fff);font-size:.88rem;color:var(--ink,#16232c)}" +
      ".rv-lettura span{font-weight:700}" +
      ".rv-lettura em{font-style:normal;font-size:.8rem;font-weight:600;color:var(--slate-2,var(--muted,#5f7280))}" +
      ".rv-lettura .rv-vai{margin:0 0 0 auto;min-height:32px;display:inline-flex;align-items:center;padding:.2rem .6rem;border:1px solid " + BORDO + ";border-radius:3px;" +
        "background:var(--surface-soft,#f3f7f8);color:var(--ink,#16232c);font-size:.78rem;font-weight:700;text-decoration:none}" +
      ".rv-lettura button{margin:0 0 0 auto;min-height:32px;padding:.2rem .6rem;border:1px solid " + BORDO + ";border-radius:3px;background:var(--surface-soft,#f3f7f8);color:var(--ink,#16232c);font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}" +
      ".rv-mesi{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin:.7rem 0 .2rem;padding-top:.6rem;border-top:1px solid " + BORDO + ";font-size:.74rem;font-weight:700;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-mesi button{display:inline-flex;align-items:center;gap:.35rem;margin:0;min-height:34px;padding:.2rem .65rem;border:1px solid " + BORDO + ";border-radius:999px;background:var(--surface,#fff);color:var(--ink,#16232c);font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}" +
      ".rv-mesi button[aria-pressed=true]{border-color:var(--bcn-btn,var(--sea,#075d70));box-shadow:inset 0 0 0 1px var(--bcn-btn,var(--sea,#075d70))}" +
      "@media (max-width:700px){.rv-plot{height:150px}.rv-per strong{min-width:0}.rv-col small{font-size:.64rem}.rv-col b{font-size:12px}.rv-meteo.sett~.rv-plot .rv-col b{font-size:17px}}" +
      ".rv-media{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .55rem;margin:.1rem 0 .6rem;font-size:.9rem;color:var(--ink,#16232c)}" +
      ".rv-media span{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--label,var(--muted,#5f7280))}" +
      ".rv-media strong{font-size:1.05rem}" +
      ".rv-media em{font-style:normal;font-size:.8rem;font-weight:600;color:var(--slate-2,var(--muted,#5f7280))}" +
      ".rv-ctrl{scroll-margin-top:calc(var(--rv-top,0px) + .5rem)}" +
      ".rv-badge{display:inline-flex;align-items:center;gap:.35rem;padding:.15rem .55rem;border:1px solid " + BORDO + ";border-radius:999px;background:var(--surface,#fff);" +
        "font-size:.76rem;font-weight:800;color:var(--ink,#16232c)}" +
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
      (opz.riepilogo ? '<section class="rv-riep" id="regRiep" aria-label="Giornate surfabili" hidden></section>' : "") +
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
    if (opz.riepilogo) ascoltaGrafico(r);
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
      "<b>Meteo del giorno</b> (icone sopra il grafico): pioggia e radiazione solare misurate a Trieste molo, stessa fonte. " +
      "<b>Monte Grisa</b>: Vetercek, registrata da Vento Trieste dal 30 settembre 2026 (in quota, fuori dalla media). " +
      "<b>Boa Mambo</b>: OGS, un dato all'ora pubblicato con 1-2 ore di ritardo.",
      "<b>" + nomeCampo[1] + "</b>: average of the sea-level stations (Barcola, Trieste pier, Muggia, Paloma) weighted by distance from the centre of the Barcolana course. " +
      "<b>Barcola</b>: Windguru, 5-minute averages; a 0/0 reading means the anemometer is stuck and is not counted. " +
      "<b>Trieste pier, Muggia, Paloma buoy</b>: Source: " + FONTE_PC + " · processed data. " +
      "<b>Day's weather</b> (icons above the chart): rain and solar radiation measured at Trieste pier, same source. " +
      "<b>Monte Grisa</b>: Vetercek, recorded by Vento Trieste since 30 September 2026 (high up, not in the average). " +
      "<b>Mambo buoy</b>: OGS, one reading per hour published 1-2 hours late.");
  }

  function nomeSerie(r, sr) {
    var nc = r.opz.nomeCampo || ["Campo di regata", "Race course"];
    return { campo: tr(nc[0], nc[1]), trieste: tr("Trieste molo", "Trieste pier"), paloma: tr("Boa Paloma", "Paloma buoy"), mambo: tr("Boa Mambo", "Mambo buoy") }[sr.id] || sr.nome;
  }

  /* ---- giornate surfabili ---- */
  function locale() { return lingua() === "en" ? "en-GB" : "it-IT"; }
  function dataFmt(g, o) {
    o.timeZone = "UTC";
    var s = new Intl.DateTimeFormat(locale(), o).format(new Date(g.length === 7 ? g + "-15T12:00:00Z" : g + "T12:00:00Z"));
    return (lingua() === "it" && o.month === "long") ? s.replace(/^1 /, "1° ") : s;    // "1° settembre"
  }

  // sintesi di un giorno dal registro, calcolata come nel Worker (sintesiGiorno): dalla prima
  // colonna m = media dei quarti d'ora, q = quarti d'ora con la media sopra SOGLIA,
  // d = direzione prevalente (media vettoriale pesata sul vento); r = picco di raffica più alto
  // tra le centraline a mare e rs = dove
  function sintesiReg(reg) {
    var v = reg.serie[0].dati.filter(Boolean), sx = 0, sy = 0, q = 0, out;
    if (!v.length) return null;
    v.forEach(function (x) {
      if (x[2] != null) { sx += x[0] * Math.sin(x[2] * Math.PI / 180); sy += x[0] * Math.cos(x[2] * Math.PI / 180); }
      if (x[0] > SOGLIA) q++;
    });
    out = { m: Math.round(v.reduce(function (a, x) { return a + x[0]; }, 0) / v.length * 10) / 10, n: v.length, r: null, rs: null, q: q,
      d: (sx || sy) ? Math.round((Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360) : null };
    if (reg.meteo && reg.meteo.tipo) { out.mt = reg.meteo.tipo; out.pr = reg.meteo.pioggia; }
    reg.serie.forEach(function (sr) {
      if (MARE.indexOf(sr.id) === -1) return;
      sr.dati.forEach(function (x) { if (x && x[1] != null && !(out.r >= x[1])) { out.r = x[1]; out.rs = sr.id; } });
    });
    return out;
  }
  function nomeMare(id) {
    return { barcola: "Barcola", trieste: tr("Trieste molo", "Trieste pier"), muggia: "Muggia", paloma: tr("Boa Paloma", "Paloma buoy") }[id] || "";
  }
  var SOLE_C = "var(--rv-sole,#d99a00)", GOCCE_C = C_MEDIA;
  // giornata surfabile: il surfista della schermata di caricamento della home (era un pallino rosso)
  var SURFISTA = '<i class="rv-surfista" aria-hidden="true">\ud83c\udfc4\u200d\u2642\ufe0f</i>';
  var NUVOLA = function (y) { return '<path d="M6.5 ' + y + 'h11a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 6.5 ' + y + 'z"/>'; };
  var METEO = {
    sole: { nome: ["sole", "sunny"], svg: '<g stroke="' + SOLE_C + '"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/></g>' },
    variabile: { nome: ["sole e nuvole", "sun and clouds"], svg: '<g stroke="' + SOLE_C + '"><circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1.5M2.5 8.5H4M4.3 4.3l1 1M12.7 4.3l-1 1"/></g>' + NUVOLA(20) },
    nuvoloso: { nome: ["nuvoloso", "cloudy"], svg: NUVOLA(18.5) },
    pioggia: { nome: ["pioggia", "rain"], svg: NUVOLA(14) + '<g stroke="' + GOCCE_C + '"><path d="M8.5 17l-1.2 3.5M12.5 17l-1.2 3.5M16.5 17l-1.2 3.5"/></g>' }
  };
  function iconaMeteo(tipo) {
    var m = METEO[tipo];
    return m ? '<svg class="rv-meteo-ico" viewBox="0 0 24 24" aria-hidden="true">' + m.svg + "</svg>" : "";
  }
  function nomeMeteo(x) {
    var m = METEO[x.mt];
    return m ? tr(m.nome[0], m.nome[1]) + (x.mt === "pioggia" && x.pr ? " " + num(x.pr, x.pr < 10 ? 1 : 0) + " mm" : "") : "";
  }
  function surfabile(q) { return q != null && q >= ORE_SURF * 4; }
  function ore(q) {                  // quarti d'ora -> "6 h 30", "45 min"
    var h = Math.floor(q / 4), mm = (q % 4) * 15;
    return h ? h + " h" + (mm ? " " + mm : "") : mm + " min";
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

  /* ---- grafico delle giornate surfabili ----
     Una colonna per giorno: alta fino alla raffica massima, con dentro (in blu) la media della
     giornata; linea tratteggiata = SOGLIA (12 nodi); surfista = giornata surfabile (media sopra i 12
     per almeno ORE_SURF ore). Mese o settimana (lun-dom), con le frecce per spostarsi.
     Oggi è una colonna chiara ("finora") e non entra nel conto finché il giorno non è chiuso.
     Toccare una colonna apre quel giorno nel registro qui sotto (senza far scorrere la pagina:
     la riga di lettura ha il bottone per andarci). */
  function maiuscola(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function lunedi(g) { return sposta(g, -((new Date(g + "T12:00:00Z").getUTCDay() + 6) % 7)); }
  function spostaMese(g, n) { var t = new Date(g.slice(0, 7) + "-01T12:00:00Z"); t.setUTCMonth(t.getUTCMonth() + n); return t.toISOString().slice(0, 10); }
  function periodo(per) {             // i giorni (YYYY-MM-DD) del mese o della settimana di per.rif
    if (per.tipo === "trenta") { for (var k = 29, gg = []; k >= 0; k--) gg.push(sposta(per.rif, -k)); return gg; }   // i 30 giorni che finiscono a per.rif
    var g0 = per.tipo === "sett" ? lunedi(per.rif) : per.rif.slice(0, 8) + "01";
    var n = per.tipo === "sett" ? 7 : Number(sposta(spostaMese(g0, 1), -1).slice(8)), out = [];
    for (var i = 0; i < n; i++) out.push(sposta(g0, i));
    return out;
  }
  function nomePeriodo(per, gg) {
    if (per.tipo === "trenta") return dataFmt(gg[0], { day: "numeric", month: "short" }) + " – " + dataFmt(gg[gg.length - 1], { day: "numeric", month: "short", year: "numeric" });
    if (per.tipo !== "sett") return maiuscola(dataFmt(per.rif.slice(0, 7), { month: "long", year: "numeric" }));
    return dataFmt(gg[0], { day: "numeric", month: "short" }) + " – " + dataFmt(gg[6], { day: "numeric", month: "short", year: "numeric" });
  }
  // un giorno nel grafico: dal riepilogo se è chiuso, per oggi dal registro caricato ("finora")
  function datoGiorno(r, g) {
    var x = r.riep && r.riep.giorni[g];
    if (x && x.m != null && x.n >= MIN_QUARTI) return { m: x.m, r: x.r, rs: x.rs, q: x.q, d: x.d, mt: x.mt, pr: x.pr, surf: surfabile(x.q) };
    var o = r.oggi;
    if (o && o.g === g && g === oggiRoma()) return { m: o.m, r: o.r, rs: o.rs, q: o.q, d: o.d, mt: o.mt, pr: o.pr, oggi: true, surf: surfabile(o.q) };
    return null;
  }
  function nomeGiorno(g) { return maiuscola(dataFmt(g, { weekday: "long", day: "numeric", month: "long" })); }

  function lettura(r, g) {
    var x = datoGiorno(r, g), vai = g !== r.giorno ? "" : r.opz.soloGrafico ? (r.opz.linkRegistro === false ? "" :     // linkRegistro: false = niente link (Barcolana)
      '<a class="rv-vai" href="' + (r.opz.linkRegistro || "/registro/") + "?giorno=" + g + '">' + tr("Apri nel registro →", "Open in the log →") + "</a>") :
      '<button type="button" data-rv-vai>' + tr("Vedi il registro ↓", "See the log ↓") + "</button>";
    if (!x) return "<span>" + nomeGiorno(g) + "</span><em>" + (g > oggiRoma() ? tr("ancora da venire", "still to come") : tr("nessuna media per questo giorno", "no average for this day")) + "</em>" + vai;
    return "<span>" + nomeGiorno(g) + "</span>" + sintesi(x, r) + nomeEvento(r, g) +
      (x.oggi ? "<em>· " + tr("finora, il giorno si chiude alle " + ORA_FINE, "so far, the day closes at " + ORA_FINE) + "</em>" : "") + vai;
  }
  // meteo, media, raffica, direzione, ore sopra la soglia e bollino: nella riga di lettura e sotto i bottoni
  function sintesi(x, r) {
    var surf = !(r && r.opz.senzaSurf);
    return (x.mt ? '<em class="rv-meteo-txt">' + iconaMeteo(x.mt) + nomeMeteo(x) + " ·</em>" : "") +
      "<em>" + tr("media", "mean") + "</em><strong>" + num(x.m, 1) + " kt</strong>" +
      (x.r != null ? "<em>" + tr("raffica max", "max gust") + "</em><strong>" + num(x.r, 0) + " kt</strong>" + (x.rs ? "<em>" + tr("a ", "at ") + nomeMare(x.rs) + "</em>" : "") : "") +
      (x.d != null ? "<em>" + tr("da ", "from ") + cardinale(x.d) + "</em>" : "") +
      (surf && x.q != null ? "<em>· " + (x.q ? ore(x.q) + tr(" sopra i ", " above ") + SOGLIA + " kt" : tr("mai sopra i ", "never above ") + SOGLIA + " kt") + "</em>" : "") +
      (surf && x.surf ? '<b class="rv-badge">' + SURFISTA + (x.oggi ? tr("Già surfabile", "Already surfable") : tr("Giornata surfabile", "Surfable day")) + "</b>" : "");
  }
  // il giorno dell'evento (opzione evento: la Barcolana) ha il suo segno sopra la colonna
  function eEvento(r, g) { return !!(r.opz.evento && r.opz.evento.giorno === g); }
  function nomeEvento(r, g) {
    return eEvento(r, g) ? '<b class="rv-badge">' + r.opz.evento.segno + " " + tr(r.opz.evento.nome[0], r.opz.evento.nome[1]) + "</b>" : "";
  }
  function letturaBase(r) {
    var gg = periodo(r.per);
    return gg.indexOf(r.giorno) !== -1 ? lettura(r, r.giorno) :
      "<em>" + tr("Passa sopra una colonna o toccala per vedere media, raffica " + (r.opz.senzaSurf ? "e direzione" : "e ore di vento") + " del giorno" + (r.opz.soloGrafico ? "." : ", e aprirlo nel registro."),
        "Hover or tap a column to see that day's mean, gust and " + (r.opz.senzaSurf ? "direction" : "hours of wind") + (r.opz.soloGrafico ? "." : ", and open it in the log.")) + "</em>";
  }

  function disegnaRiep(r) {
    var box = r.$("regRiep"), j = r.riep;
    if (!box || !j) return;
    var oggi = oggiRoma();
    if (!r.per) {
      // all'apertura sempre Mese, il mese in corso (Alberto, 2 ott 2026); se la pagina si apre
      // su un giorno preciso (/registro/?giorno=…), il mese di quel giorno
      r.per = { tipo: r.opz.periodo === "30" ? "trenta" : "mese", rif: (r.giorno && r.giorno < oggi && r.giorno >= j.dal) ? r.giorno : oggi };
      r.seguito = r.giorno;
    }
    // se il giorno del registro cambia (frecce, calendario) e cade fuori, il grafico lo segue
    if (r.giorno !== r.seguito) { r.seguito = r.giorno; if (periodo(r.per).indexOf(r.giorno) === -1 && r.giorno >= j.dal) r.per.rif = r.giorno; }

    var gg = periodo(r.per), dati = gg.map(function (g) { return datoGiorno(r, g); });
    var max = 0, surf = 0, chiusi = 0, conSurf = !r.opz.senzaSurf, cls = r.per.tipo === "sett" ? "sett" : "mese";
    dati.forEach(function (x) {
      if (!x) return;
      if (!x.oggi) { chiusi++; if (x.surf) surf++; }
      max = Math.max(max, x.m, x.r || 0);
    });
    var yMax = Math.max(20, Math.ceil(max / 5) * 5 + 5), passo = yMax > 30 ? 10 : 5;
    var pct = function (v) { return (Math.min(v, yMax) / yMax * 100).toFixed(2) + "%"; };
    var griglia = "";
    // le tacche troppo vicine alla soglia perdono il numero (il 12 si sovrapponeva al 10)
    for (var t = 0; t <= yMax; t += passo) if (!conSurf || t !== SOGLIA) griglia += '<div class="rv-gl' + (t ? "" : " base") + '" style="bottom:' + pct(t) + '">' +
      (conSurf && Math.abs(t - SOGLIA) < yMax * 0.09 ? "" : "<span>" + t + "</span>") + "</div>";
    if (conSurf) griglia += '<div class="rv-gl soglia" style="bottom:' + pct(SOGLIA) + '"><span>' + SOGLIA + "</span></div>";

    var colonne = gg.map(function (g, i) {
      var x = dati[i], cima = x ? pct(Math.max(x.m, x.r || 0)) : "0%";
      var desc = nomeGiorno(g) + ": " + (x ? tr("media ", "mean ") + num(x.m, 1) + tr(" nodi", " knots") +
          (x.r != null ? tr(", raffica massima ", ", max gust ") + num(x.r, 0) : "") + (conSurf && x.q ? ", " + ore(x.q) + tr(" sopra i ", " above ") + SOGLIA : "") +
          (x.oggi ? tr(", finora", ", so far") : "") + (conSurf && x.surf ? tr(", giornata surfabile", ", surfable day") : "") +
          (eEvento(r, g) ? ", " + tr(r.opz.evento.nome[0], r.opz.evento.nome[1]) : "") :
        (g > oggi ? tr("ancora da venire", "still to come") : tr("nessun dato", "no data")));
      return '<button type="button" class="rv-col' + (x && x.oggi ? " oggi" : "") + '" data-rv-giorno="' + g + '"' + (g > oggi ? " disabled" : "") +
        ' aria-pressed="' + (g === r.giorno) + '" aria-label="' + desc + '">' +
        (x && x.r != null ? '<i style="height:' + pct(x.r) + '"></i>' : "") +
        (x ? '<i class="med' + (x.r != null ? "" : " sola") + '" style="height:' + pct(x.m) + '"></i>' : "") +
        (x && conSurf && x.surf ? '<b style="bottom:calc(' + cima + ' + 3px)">\ud83c\udfc4\u200d\u2642\ufe0f</b>' : "") +
        (x && eEvento(r, g) ? '<b style="bottom:calc(' + cima + ' + 3px)">' + r.opz.evento.segno + "</b>" : "") +
        // in settimana c'è spazio: sopra il surfista quante ore sopra la soglia
        (x && x.surf && r.per.tipo === "sett" ? '<small style="bottom:calc(' + cima + ' + 23px)">' + ore(x.q) + "</small>" : "") + "</button>";
    }).join("");
    var assex = gg.map(function (g) {
      var dd = Number(g.slice(8));
      return "<span>" + (r.per.tipo === "sett" ? dataFmt(g, { weekday: "short" }).replace(".", "") + " " + dd :
        r.per.tipo === "trenta" && dd === 1 ? dataFmt(g, { day: "numeric", month: "short" }).replace(".", "").replace(/^1° /, "1 ") :
        r.per.tipo === "trenta" && dd >= 29 ? "" :            // il 30 si accavallava a "1 ott" sul telefono
        ((dd === 1 || dd % 5 === 0) && dd < 31 ? dd : "")) + "</span>";
    }).join("");
    // sopra il grafico, il meteo di ogni giorno
    var meteo = dati.map(function (x) {
      return '<span' + (x && x.oggi ? ' class="oggi"' : "") + ">" + (x && x.mt ? iconaMeteo(x.mt) : "") + "</span>";
    }).join("");
    // sotto l'asse, la direzione media di ogni giorno (sul telefono, in vista mese, la sigla è in verticale)
    var dirx = dati.map(function (x) {
      return '<span' + (x && x.oggi ? ' class="oggi"' : "") + ">" + (x && x.d != null ? freccia(x.d) + "<i>" + cardinale(x.d) + "</i>" : "") + "</span>";
    }).join("");

    // tutti i mesi registrati, per saltare da uno all'altro (e vederne il conto)
    var mesi = {}, ordine = [], senzaB = null;
    Object.keys(j.giorni).sort().forEach(function (g) {
      var x = j.giorni[g], k = g.slice(0, 7);
      if (x.m == null || !(x.n >= MIN_QUARTI)) return;
      if (!(k in mesi)) { mesi[k] = 0; ordine.unshift(k); }
      if (surfabile(x.q)) mesi[k]++;
      if (x.sb) senzaB = g;
    });
    if (ordine.indexOf(oggi.slice(0, 7)) === -1 && oggi.slice(0, 7) >= j.dal.slice(0, 7)) { mesi[oggi.slice(0, 7)] = 0; ordine.unshift(oggi.slice(0, 7)); }

    var nomeC = (r.opz.nomeCampo || ["Campo di regata", "Race course"])[lingua() === "en" ? 1 : 0];
    var primo = r.per.tipo === "trenta" ? j.dal : periodo({ tipo: r.per.tipo, rif: j.dal })[0], inCorso = gg.indexOf(oggi) !== -1;
    var giorni = function (n) { return n + " " + (n === 1 ? tr("giorno", "day") : tr("giorni", "days")); };
    box.innerHTML = "<h3>" + (conSurf ? tr("Giornate surfabili", "Surfable days") : tr("Il vento giorno per giorno", "The wind day by day")) + "</h3>" +
      '<p class="rv-nota">' + (!conSurf ? tr(
        "Ogni colonna è un giorno, dalle 6 alle 19: in blu la <b>media</b> della colonna «" + nomeC + "», sopra fino alla <b>raffica massima</b>, il picco più alto tra Barcola, Trieste molo, Muggia e Paloma. " +
          (r.opz.soloGrafico ? "Tocca un giorno per leggerne media, raffica e direzione." : "Tocca un giorno per aprirlo nel registro qui sotto."),
        "Each column is one day, 6:00-19:00: the <b>mean</b> of the «" + nomeC + "» column in blue, topped up to the <b>max gust</b>, the highest peak among Barcola, Trieste pier, Muggia and Paloma. " +
          (r.opz.soloGrafico ? "Tap a day to read its mean, gust and direction." : "Tap a day to open it in the log below.")) : tr(
        "Ogni colonna è un giorno, dalle 6 alle 19: in blu la <b>media</b> della colonna «" + nomeC + "», sopra fino alla <b>raffica massima</b>, il picco più alto tra Barcola, Trieste molo, Muggia e Paloma. " +
          SURFISTA + " = <b>giornata surfabile</b>: la media è stata sopra i " + SOGLIA + " nodi per almeno " + ORE_SURF + " ore.",
        "Each column is one day, 6:00-19:00: the <b>mean</b> of the «" + nomeC + "» column in blue, topped up to the <b>max gust</b>, the highest peak among Barcola, Trieste pier, Muggia and Paloma. " +
          SURFISTA + " = <b>surfable day</b>: the mean stayed above " + SOGLIA + " knots for at least " + ORE_SURF + " hours.")) +
      (j.mancanti ? " <b>" + tr("Sto completando lo storico: mancano ancora " + giorni(j.mancanti) + ".", "Still filling in the history: " + giorni(j.mancanti) + " to go.") + "</b>" : "") + "</p>" +
      '<div class="rv-graf-testa">' +
        (r.per.tipo === "trenta" ? "" : '<div class="rv-seg" role="group" aria-label="' + tr("Periodo", "Period") + '">' +
          '<button type="button" data-rv-tipo="mese" aria-pressed="' + (r.per.tipo === "mese") + '">' + tr("Mese", "Month") + "</button>" +
          '<button type="button" data-rv-tipo="sett" aria-pressed="' + (r.per.tipo === "sett") + '">' + tr("Settimana", "Week") + "</button></div>") +
        '<div class="rv-per"><button type="button" data-rv-sposta="-1"' + (gg[0] > primo ? "" : " disabled") + ' aria-label="' + tr("Periodo precedente", "Previous period") + '">◀</button>' +
          "<strong>" + nomePeriodo(r.per, gg) + "</strong>" +
          '<button type="button" data-rv-sposta="1"' + (gg[gg.length - 1] < oggi ? "" : " disabled") + ' aria-label="' + tr("Periodo successivo", "Next period") + '">▶</button></div>' +
      "</div>" +
      (!conSurf ? "" : '<div class="rv-conto">' + SURFISTA + '<strong>' + surf + "</strong> " + (surf === 1 ? tr("giornata surfabile", "surfable day") : tr("giornate surfabili", "surfable days")) +
        " <em>" + tr("su ", "out of ") + giorni(chiusi) + (chiusi === 1 ? tr(" registrato", " recorded") : tr(" registrati", " recorded")) + (inCorso ? " · " + tr("in corso", "so far") : "") + "</em></div>") +
      '<div class="rv-meteo ' + cls + '" aria-hidden="true">' + meteo + "</div>" +
      '<div class="rv-plot">' + griglia + '<div class="rv-colonne" role="group" aria-label="' + tr("Media e raffica di ogni giorno", "Mean and gust of each day") + '">' + colonne + "</div></div>" +
      '<div class="rv-assex" aria-hidden="true">' + assex + "</div>" +
      '<div class="rv-dirx ' + cls + '" aria-hidden="true"><b>' + tr("da", "from") + "</b>" + dirx + "</div>" +
      '<div class="rv-legenda"><span><i class="rv-k-media"></i>' + tr("media del giorno", "daily mean") + "</span>" +
        '<span><i class="rv-k-raffica"></i>' + tr("raffica massima", "max gust") + "</span>" +
        (conSurf ? '<span><i class="rv-k-soglia"></i>' + SOGLIA + " kt</span>" : "") +
        "<span>" + freccia(67.5) + tr("ENE = direzione media, da dove viene", "ENE = mean direction, where it comes from") + "</span>" +
        "<span>" + ["sole", "variabile", "nuvoloso", "pioggia"].map(iconaMeteo).join("") + tr("sole · sole e nuvole · nuvoloso · pioggia", "sunny · sun and clouds · cloudy · rain") + "</span>" +
        (conSurf ? '<span>' + SURFISTA + tr("giornata surfabile (" + ORE_SURF + " h sopra i " + SOGLIA + " kt)", "surfable day (" + ORE_SURF + " h above " + SOGLIA + " kt)") + "</span>" : "") +
        (r.opz.evento ? "<span>" + r.opz.evento.segno + " " + tr(r.opz.evento.nome[0], r.opz.evento.nome[1]) + "</span>" : "") + "</div>" +
      '<div class="rv-lettura" id="regLettura" aria-live="polite">' + letturaBase(r) + "</div>" +
      (ordine.length > 1 && r.per.tipo !== "trenta" ? '<div class="rv-mesi">' + tr("Mesi:", "Months:") + " " + ordine.map(function (k) {
        return '<button type="button" data-rv-mese="' + k + '" aria-pressed="' + (r.per.tipo === "mese" && r.per.rif.slice(0, 7) === k) + '">' +
          maiuscola(dataFmt(k, { month: "long", year: "numeric" })) + ' ' + SURFISTA + mesi[k] + "</button>";
      }).join("") + "</div>" : "") +
      (senzaB ? '<p class="rv-nota">' + tr("Fino al " + dataFmt(senzaB, { day: "numeric", month: "long" }) + " la media è senza Barcola: Windguru ne conserva lo storico solo per due settimane.",
        "Until " + dataFmt(senzaB, { day: "numeric", month: "long" }) + " the average is without Barcola: Windguru only keeps two weeks of its history.") + "</p>" : "") +
      (r.opz.soloGrafico ? '<p class="rv-nota">' + tr(
        "Fonti: Barcola, Windguru. Trieste molo, Muggia, boa Paloma e meteo del giorno (pioggia e radiazione solare di Trieste molo): Fonte: " + FONTE_PC + " · dati elaborati.",
        "Sources: Barcola, Windguru. Trieste pier, Muggia, Paloma buoy and the day's weather (rain and solar radiation at Trieste pier): Source: " + FONTE_PC + " · processed data.") + "</p>" : "");
    box.hidden = false;
  }

  function ascoltaGrafico(r) {
    var box = r.$("regRiep");
    box.addEventListener("click", function (ev) {
      var t = ev.target.closest ? ev.target : null, b;
      if (!t) return;
      if ((b = t.closest("[data-rv-giorno]"))) {
        // solo grafico: il giorno si seleziona e basta (il link porta al registro); altrimenti si apre in tabella
        if (r.opz.soloGrafico) r.giorno = b.getAttribute("data-rv-giorno"); else carica(r, b.getAttribute("data-rv-giorno"));
        r.seguito = r.giorno; disegnaRiep(r); return;
      }
      if ((b = t.closest("[data-rv-vai]"))) { r.root.querySelector(".rv-ctrl").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if ((b = t.closest("[data-rv-mese]"))) { r.per = { tipo: "mese", rif: b.getAttribute("data-rv-mese") + "-01" }; disegnaRiep(r); return; }
      if ((b = t.closest("[data-rv-tipo]"))) {
        var gg = periodo(r.per), oggi = oggiRoma();
        r.per = { tipo: b.getAttribute("data-rv-tipo"), rif: gg.indexOf(r.giorno) !== -1 ? r.giorno : (gg[gg.length - 1] < oggi ? gg[gg.length - 1] : oggi) };
        disegnaRiep(r); return;
      }
      if ((b = t.closest("[data-rv-sposta]"))) {
        var n = Number(b.getAttribute("data-rv-sposta"));
        r.per.rif = r.per.tipo === "trenta" ? (sposta(r.per.rif, 30 * n) > oggiRoma() ? oggiRoma() : sposta(r.per.rif, 30 * n)) :
          r.per.tipo === "sett" ? sposta(lunedi(r.per.rif), 7 * n) : spostaMese(r.per.rif, n);
        disegnaRiep(r);
      }
    });
    // passando sopra (o col tab) la riga di lettura mostra quel giorno; uscendo torna al giorno aperto
    var mostra = function (ev) {
      var b = ev.target.closest ? ev.target.closest(".rv-col") : null;
      if (b && !b.disabled) r.$("regLettura").innerHTML = lettura(r, b.getAttribute("data-rv-giorno"));
    };
    var torna = function (ev) {
      var dove = ev.relatedTarget;
      if (dove && dove.closest && dove.closest(".rv-col")) return;
      if (r.$("regLettura") && r.per) r.$("regLettura").innerHTML = letturaBase(r);
    };
    box.addEventListener("pointerover", mostra);
    box.addEventListener("focusin", mostra);
    box.addEventListener("pointerout", function (ev) { if (ev.target.closest && ev.target.closest(".rv-col")) torna(ev); });
    box.addEventListener("focusout", function (ev) { if (ev.target.closest && ev.target.closest(".rv-col")) torna(ev); });
  }

  // sotto i bottoni: sintesi del giorno mostrato (per oggi, fino all'ultimo quarto d'ora)
  function rigaMedia(r, d, eOggi, fine) {
    var mg = sintesiReg(d), nomeC = nomeSerie(r, d.serie[0]);
    if (!mg) return "";
    if (!eOggi && mg.n < MIN_QUARTI) return '<div class="rv-media"><span>' + tr("La giornata", "The day") + "</span><em>" +
      tr("troppo pochi dati (" + mg.n + " quarti d'ora su " + d.slot.length + ")", "not enough data (" + mg.n + " of " + d.slot.length + " quarter-hours)") + "</em></div>";
    mg.surf = surfabile(mg.q); mg.oggi = eOggi;
    return '<div class="rv-media"><span>' + (eOggi ? tr("Oggi finora", "Today so far") : tr("La giornata", "The day")) +
      " · " + nomeC + " · " + d.slot[0] + "-" + d.slot[eOggi ? fine : d.slot.length - 1] + "</span>" + sintesi(mg, r) + "</div>";
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
    if (r.opz.riepilogo) {
      // la media di oggi finora fa la colonna chiara del grafico
      if (d && d.serie && d.giorno === oggiRoma()) { var mo = sintesiReg(d); r.oggi = mo ? { g: d.giorno, m: mo.m, r: mo.r, rs: mo.rs, q: mo.q, d: mo.d, mt: mo.mt, pr: mo.pr } : null; }
      disegnaRiep(r);                              // il giorno aperto si vede premuto nel grafico
    }
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
    st.textContent = futuro ? tr("Giorno futuro: il registro si riempie dalle " + d.slot[0] + " di quel giorno.", "Future day: the log fills up from " + d.slot[0] + " that day.") :
      (eOggi && fine < 0) ? tr("Il registro di oggi parte alle " + d.slot[0] + ".", "Today's log starts at " + d.slot[0] + ".") :
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

  // solo gli orari [da, a] del registro (opzione finestra), per tabella, riepilogo e CSV
  function taglia(d, fin) {
    if (!fin || !d.slot) return d;
    var tieni = d.slot.map(function (h) { return h >= fin[0] && h <= fin[1]; });
    var f = function (arr) { return arr.filter(function (x, i) { return tieni[i]; }); };
    return Object.assign({}, d, { slot: f(d.slot), serie: d.serie.map(function (sr) { return Object.assign({}, sr, { dati: f(sr.dati) }); }) });
  }

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
        r.dati = taglia(d, r.opz.finestra); r.ultimo = Date.now(); disegna(r);
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

  // oggi, dalle 5:45 alle 19:30, si rinnova ogni 5 minuti (scheda visibile e registro già aperto)
  function rinnova() {
    var o = oraRoma(), oggi = oggiRoma();
    istanze.forEach(function (r) {
      if (r.caricato && r.giorno === oggi && o >= "05:45" && o <= "19:30" && Date.now() - r.ultimo > 4 * 60000) carica(r);
    });
  }
  setInterval(function () { if (!document.hidden) rinnova(); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) rinnova(); });

  /* Solo il grafico delle giornate surfabili (home, sezione a tendina): niente tabella né
     comandi del giorno; toccando una colonna si legge il giorno e c'è il link al registro.
     Per la colonna chiara di oggi scarica anche il registro di oggi, e lo rinnova ogni 5
     minuti se la sezione è aperta e la scheda visibile.
       var g = RegistroVento.grafico(el, { attendi: true, nomeCampo: […], linkRegistro: "/registro/" });
       g.carica();   // quando la tendina si apre */
  function grafico(root, opz) {
    opz = opz || {};
    opz.soloGrafico = true;
    stili();
    root.innerHTML = '<section class="rv-riep" id="regRiep" aria-label="Giornate surfabili" hidden></section>';
    // giorno: il giorno selezionato all'apertura (Barcolana dopo la regata: l'11 ottobre, e il grafico finisce lì)
    var r = { root: root, opz: opz, giorno: opz.giorno || null, $: function (id) { return root.querySelector("#" + id); }, caricato: false, ultimoOggi: 0 };
    grafici.push(r);
    ascoltaGrafico(r);
    var oggi = function () {
      var g = oggiRoma();
      r.ultimoOggi = Date.now();
      return fetch(URL_REG + "?giorno=" + g + "&ts=" + Date.now()).then(function (x) { return x.json(); }).then(function (d) {
        if (!d || !d.serie || d.giorno !== g) return;
        var mo = sintesiReg(d);
        r.oggi = mo ? { g: g, m: mo.m, r: mo.r, rs: mo.rs, q: mo.q, d: mo.d, mt: mo.mt, pr: mo.pr } : null;
        if (r.riep) disegnaRiep(r);
      }).catch(function () {});
    };
    var carica = function () {
      if (r.caricato) return;
      r.caricato = true;
      caricaRiepilogo(r);
      oggi();
    };
    setInterval(function () {
      if (r.caricato && !document.hidden && root.offsetParent !== null && Date.now() - r.ultimoOggi > 4.5 * 60000) oggi();
    }, 60000);
    if (!opz.attendi) carica();
    return { carica: carica };
  }

  window.RegistroVento = {
    grafico: grafico,
    monta: monta,
    ridisegna: function () {
      istanze.forEach(function (r) { testi(r); disegna(r); });
      grafici.forEach(function (r) { if (r.riep) disegnaRiep(r); });     // solo grafico: dopo un cambio di lingua
    }
  };
})();
