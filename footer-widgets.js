(function () {
  var doc = document.documentElement;
  var toggle = document.getElementById("themeToggle");
  var storageKey = "vento-trieste-theme";

  function temaSalvato() {
    try { return localStorage.getItem(storageKey); } catch (e) { return null; }
  }

  function salvaTema(tema) {
    try { localStorage.setItem(storageKey, tema); } catch (e) {}
  }

  function aggiornaToggle(tema) {
    if (!toggle) return;
    var chiaro = tema === "light";
    var labelChiaro = toggle.getAttribute("data-light-label") || "Chiaro";
    var labelScuro = toggle.getAttribute("data-dark-label") || "Scuro";
    var azione = chiaro ? labelScuro : labelChiaro;
    var icon = toggle.querySelector(".theme-toggle-icon");
    var label = toggle.querySelector(".theme-toggle-label");
    toggle.setAttribute("aria-pressed", String(chiaro));
    toggle.setAttribute("aria-label", azione);
    toggle.setAttribute("title", azione);
    if (icon) icon.textContent = chiaro ? "☾" : "☀";
    if (label) label.textContent = azione;
  }

  var tema = temaSalvato();
  if (tema !== "light" && tema !== "dark") tema = "dark";
  doc.setAttribute("data-theme", tema);
  aggiornaToggle(tema);

  if (toggle) {
    toggle.addEventListener("click", function () {
      var prossimo = doc.getAttribute("data-theme") === "light" ? "dark" : "light";
      doc.setAttribute("data-theme", prossimo);
      salvaTema(prossimo);
      aggiornaToggle(prossimo);
    });
  }
})();

/* Lite · Pro (28 ott 2026). Alberto: "Trieste è fantastica per chi mastica di meteo, per i principianti
   è troppo complicata". Accanto a Scuro/Chiaro un interruttore Lite · Pro. La Lite tiene il surfometro
   senza giudizio (vento medio, raffica, da dove arriva), la Spinta della Bora senza grafico (c'è bora o
   no), le webcam (in home senza Barcola e S.V.B.G.) e le previsioni (testo OSMER senza mappa, con icona
   e temperature di Open-Meteo, poi Aladin e Windguru); via mappa e centraline, radar, boe, registro, Spot Istria. Le regole stanno in footer-widgets.css sotto
   html.vt-lite; la classe la mette lo script in testa alla pagina, che mette anche html.vt-modi: solo
   quelle pagine hanno l'interruttore (per ora la home). Badge "Nuovo" che saltella fino al 15 nov 2026
   o finché la Lite non la si è provata. */
(function () {
  var doc = document.documentElement;
  var tema = document.getElementById("themeToggle");
  if (!tema || !doc.classList.contains("vt-modi") || document.body.classList.contains("bcn")) return;
  var CHIAVE = "vento-trieste-modo", PROVATA = "vt-lite-provata";
  var FINE_NUOVO = Date.parse("2026-11-15T00:00:00+01:00");
  var sl = doc.lang === "sl";
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function salva(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lite() { return doc.classList.contains("vt-lite"); }
  // ?lite / ?pro nel link: lo script in testa ha già scelto, qui si ricorda
  if (/[?&](lite|pro)\b/.test(location.search)) salva(CHIAVE, lite() ? "lite" : "pro");

  var sw = document.createElement("div");
  sw.className = "modo-switch";
  sw.setAttribute("role", "group");
  sw.setAttribute("aria-label", sl ? "Različica strani" : "Versione del sito");
  sw.innerHTML =
    '<button type="button" data-modo="lite" title="' + (sl ? "Preprosto: samo veter in napovedi" : "Semplice: solo vento e previsioni") + '">Lite</button>' +
    '<button type="button" data-modo="pro" title="' + (sl ? "Vsa orodja" : "Tutti gli strumenti") + '">Pro</button>';
  if (lite()) salva(PROVATA, "1");
  if (Date.now() < FINE_NUOVO && !leggi(PROVATA)) {
    sw.insertAdjacentHTML("beforeend", '<span class="modo-nuovo" aria-hidden="true">' + (sl ? "Novo" : "Nuovo") + "</span>");
  }
  tema.parentNode.insertBefore(sw, tema);

  function sync() {
    Array.prototype.forEach.call(sw.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String((b.getAttribute("data-modo") === "lite") === lite()));
    });
  }
  sync();
  sw.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-modo]");
    if (!b) return;
    var modo = b.getAttribute("data-modo");
    var nuovo = sw.querySelector(".modo-nuovo");
    if (nuovo && modo === "lite") { nuovo.remove(); salva(PROVATA, "1"); }
    if ((modo === "lite") === lite()) return;
    doc.classList.toggle("vt-lite", modo === "lite");
    salva(CHIAVE, modo);
    sync();
    if (window.SpintaBora && window.SpintaBora.ridisegna) window.SpintaBora.ridisegna();
    if (window.vtConta) window.vtConta("modo: " + modo);
    // si riparte dall'inizio: sotto, metà delle sezioni può essere appena sparita o comparsa
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();

(function () {
  var menuToggle = document.getElementById("menuToggle");
  var topnav = document.getElementById("topnav");
  if (!menuToggle || !topnav) return;

  function impostaMenu(aperto) {
    topnav.hidden = !aperto;
    menuToggle.setAttribute("aria-expanded", String(aperto));
    var icon = menuToggle.querySelector(".menu-toggle-icon");
    if (icon) icon.textContent = aperto ? "×" : "☰";
  }

  menuToggle.addEventListener("click", function (evento) {
    evento.stopPropagation();
    impostaMenu(topnav.hidden);
  });
  topnav.addEventListener("click", function (evento) {
    if (evento.target.closest("a")) impostaMenu(false);
  });
  document.addEventListener("click", function (evento) {
    if (!evento.target.closest(".topbar")) impostaMenu(false);
  });
  document.addEventListener("keydown", function (evento) {
    if (evento.key === "Escape") impostaMenu(false);
  });
})();

/* Gerarchia temporale condivisa: separa ciò che sta accadendo ora dalle
   previsioni senza cambiare dati, ID o integrazioni delle singole pagine. */
(function () {
  var doc = document.documentElement;
  var sl = doc.lang === "sl" ||
    ((document.getElementById("footerWidgets") || { dataset: {} }).dataset.lang === "sl");
  var main = document.querySelector("main");
  var hero = document.getElementById("vento");
  var forecast = document.getElementById("previsioni");
  if (!main || !hero || !forecast) return;

  function phase(kind, kicker, title, text) {
    var section = document.createElement("section");
    section.className = "meteo-phase meteo-phase--" + kind;
    section.setAttribute("aria-labelledby", "meteoPhase" + kind);
    section.innerHTML = '<span class="meteo-phase-kicker">' + kicker + '</span>' +
      '<div><h2 id="meteoPhase' + kind + '">' + title + '</h2><p>' + text + '</p></div>';
    return section;
  }

  var nowcastHeading = phase(
    "nowcast",
    sl ? "ZDAJ" : "ORA",
    "Nowcasting",
    sl ? "Opazovanja, slike v živo in trenutne razmere." : "Osservazioni, immagini live e condizioni in questo momento."
  );
  var heroCopy = hero.querySelector(":scope > .hero-copy");
  if (heroCopy) hero.insertBefore(nowcastHeading, heroCopy.nextSibling);
  else main.insertBefore(nowcastHeading, hero);

  /* Sulle pagine spot il gradiente live era storicamente dentro il grafico
     previsionale: torna accanto al Surfometro, dove il suo significato è attuale. */
  var pressure = document.querySelector(".bora-delta");
  var surfCard = document.getElementById("surfometroCard");
  if (pressure && surfCard && !hero.contains(pressure)) surfCard.appendChild(pressure);

  var pressureBoxes = [];
  var homePressure = document.getElementById("barcolaLive");
  if (homePressure) pressureBoxes.push(homePressure);
  if (pressure) pressureBoxes.push(pressure);
  pressureBoxes.forEach(function (box) {
    var title = box.matches(".bora-delta") ? box.querySelector(".bd-titolo") : box.querySelector("h2");
    if (!title || title.querySelector(".bora-only-badge")) return;
    title.textContent = sl ? "Potisk burje" : "Spinta della Bora";
    var badge = document.createElement("span");
    badge.className = "bora-only-badge";
    badge.textContent = sl ? "SAMO BURJA · SV" : "SOLO BORA · NE";
    title.appendChild(badge);
  });

  var map = document.getElementById("mappaVento");
  if (map && !map.hasAttribute("data-sum-fisso")) {   // la home ha già titolo e sottotitolo suoi
    var mapTitle = map.querySelector(":scope > .gruppo-sum .gruppo-sum-main > strong");
    var mapText = map.querySelector(":scope > .gruppo-sum .gruppo-sum-main > span");
    if (mapTitle) mapTitle.textContent = sl ? "🌬️ Zemljevid in postaje v živo" : "🌬️ Mappa e centraline live";
    if (mapText) mapText.textContent = sl ? "Izmerjeni podatki, ne napoved" : "Dati osservati dalle stazioni, non una previsione";
  }

  /* Il radar mostra osservazioni delle ultime ore: diventa una sezione live
     autonoma e viene rimosso dal contenitore Forecasting. */
  var radar = document.getElementById("radar");
  var radarLive = document.getElementById("radarLive");
  if (radar && !radarLive) {
    radarLive = document.createElement("details");
    radarLive.id = "radarLive";
    radarLive.className = "gruppo-collapse page-collapse" + (sl ? " page-collapse-sl" : "");
    radarLive.innerHTML = '<summary class="gruppo-sum"><span class="gruppo-sum-main">' +
      '<strong>' + (sl ? "🌧️ Radar padavin v živo" : "🌧️ Radar pioggia live") + '</strong>' +
      '<span>' + (sl ? "Opazovane padavine · ARSO, zadnje ure" : "Pioggia osservata · ARSO, ultime ore") + '</span>' +
      '</span></summary>';
    radar.parentNode.insertBefore(radarLive, radar);
    radarLive.appendChild(radar);
    // arrivando da un link (es. il menu in basso di una pagina spot senza radar: /#radarLive) si apre già
    if (location.hash === "#radarLive" || location.hash === "#radar") radarLive.open = true;
  }

  /* Webcam e radar sono "ora": stanno prima delle previsioni. Se la pagina le ha già messe prima
     (home, 13 ott 2026: subito dopo Mappa e centraline) restano lì e il radar va dopo le webcam. */
  var webcam = document.getElementById("webcam");
  var webcamPrima = webcam && webcam.parentNode === main &&
    (webcam.compareDocumentPosition(forecast) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (webcam && webcam.parentNode === main && !webcamPrima) main.insertBefore(webcam, forecast);
  if (radarLive) {
    if (webcam && webcam.parentNode === main) main.insertBefore(radarLive, webcam.nextSibling);
    else main.insertBefore(radarLive, forecast);
  }

  var forecastSummary = forecast.querySelector(":scope > .gruppo-sum .gruppo-sum-main > span");
  if (forecastSummary) {
    forecastSummary.textContent = sl ? "OSMER, burja, Aladin in Windguru" : "OSMER, Bora, Aladin e Windguru";
    // nella Lite le previsioni sono solo Aladin e Windguru (28 ott 2026)
    if (doc.classList.contains("vt-modi")) forecastSummary.innerHTML = '<span class="solo-pro">' + forecastSummary.textContent +
      '</span><span class="solo-lite">' + (sl ? "Vreme, Aladin in Windguru" : "Meteo, Aladin e Windguru") + "</span>";
  }
  main.insertBefore(phase(
    "forecast",
    sl ? "NASLEDNJE URE IN DNEVI" : "PROSSIME ORE E GIORNI",
    "Forecasting",
    sl ? "Bilteni in modeli za razvoj vremena." : "Bollettini e modelli per capire come evolverà il tempo."
  ), forecast);

  var nav = document.getElementById("topnav");
  if (nav) {
    function linkFor(hash) {
      return Array.prototype.find.call(nav.querySelectorAll(":scope > a"), function (link) {
        var href = link.getAttribute("href") || "";
        return href.slice(-hash.length) === hash;
      });
    }
    var forecastLink = linkFor("#previsioni");
    var radarLink = linkFor("#radarLive");
    if (!radarLink) {
      radarLink = document.createElement("a");
      radarLink.href = "#radarLive";
      radarLink.textContent = sl ? "Radar v živo" : "Radar live";
      nav.insertBefore(radarLink, forecastLink || nav.querySelector(".topnav-birra"));
    }
    var mapLink = linkFor("#mappaVento");
    if (mapLink) mapLink.textContent = sl ? "Zemljevid v živo" : "Mappa live";
    var supportLink = nav.querySelector(".topnav-birra");
    ["#vento", "#mappaVento", "#webcam", "#radarLive", "#previsioni", "#centraline", "#boe", "#istria"].forEach(function (hash) {
      var link = linkFor(hash);
      if (link) nav.insertBefore(link, supportLink || null);
    });
  }
})();

(function () {
  var doc = document.documentElement;
  var topbar = document.querySelector(".topbar");

  function aggiornaOffsetSezioni() {
    var altezza = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 0;
    doc.style.setProperty("--section-sticky-top", Math.max(8, altezza + 8) + "px");
  }

  aggiornaOffsetSezioni();
  window.addEventListener("resize", aggiornaOffsetSezioni, { passive: true });
  if (topbar && "ResizeObserver" in window) {
    new ResizeObserver(aggiornaOffsetSezioni).observe(topbar);
  }

  document.querySelectorAll(".gruppo-collapse").forEach(function (gruppo) {
    var titolo = gruppo.querySelector(".gruppo-sum");
    if (!titolo) return;
    titolo.addEventListener("click", function (evento) {
      if (!gruppo.open) return;
      var offset = parseFloat(getComputedStyle(doc).getPropertyValue("--section-sticky-top")) || 0;
      var gruppoTop = gruppo.getBoundingClientRect().top;
      var titoloTop = titolo.getBoundingClientRect().top;
      var bloccatoInAlto = gruppoTop < offset && Math.abs(titoloTop - offset) < 3;
      if (!bloccatoInAlto) return;

      evento.preventDefault();
      var destinazione = Math.max(0, window.scrollY + gruppoTop - offset);
      var overflowAnchorPrecedente = doc.style.overflowAnchor;
      function mantieniTitoloInVista() {
        window.scrollTo({ top: destinazione, left: 0, behavior: "auto" });
      }
      function correggiPosizioneTitolo() {
        var correzione = titolo.getBoundingClientRect().top - offset;
        if (Math.abs(correzione) > 1) {
          window.scrollBy({ top: correzione, left: 0, behavior: "auto" });
        }
      }
      doc.style.overflowAnchor = "none";
      mantieniTitoloInVista();
      requestAnimationFrame(function () {
        gruppo.open = false;
        titolo.focus({ preventScroll: true });
        mantieniTitoloInVista();
        requestAnimationFrame(function () {
          mantieniTitoloInVista();
        });
      });
      setTimeout(mantieniTitoloInVista, 60);
      setTimeout(function () {
        mantieniTitoloInVista();
        correggiPosizioneTitolo();
      }, 180);
      setTimeout(function () {
        doc.style.overflowAnchor = overflowAnchorPrecedente;
        requestAnimationFrame(correggiPosizioneTitolo);
      }, 320);
      setTimeout(correggiPosizioneTitolo, 460);
    });
  });
})();

/* Nota fonti compatta, stile surfometro: ogni riga di stato con id="stato…"
   (centraline e boe, su tutte le pagine) diventa un <details> chiuso col
   triangolino; nel summary resta visibile solo l'ultimo aggiornamento, dentro
   finiscono fonte, finestra e link posizione. Un MutationObserver tiene il
   riassunto allineato quando i render riscrivono la riga. */
(function () {
  var sl = document.documentElement.lang === "sl" ||
    ((document.getElementById("footerWidgets") || { dataset: {} }).dataset.lang === "sl");
  function minutiDa(hhmm) {
    var m = String(hhmm).match(/([0-2]?\d):(\d{2})/);
    if (!m) return null;
    var d = new Date();
    var min = (d - new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2])) / 60000;
    if (min < -5) min += 1440;
    return Math.max(Math.round(min), 0);
  }
  function etaTxt(min) {
    if (min == null) return "";
    if (min < 60) return " · " + min + " min " + (sl ? "nazaj" : "fa");
    var h = Math.floor(min / 60);
    return " · " + (sl ? "pred več kot " + h + " h" : "oltre " + h + (h === 1 ? " ora fa" : " ore fa"));
  }
  function riassunto(p) {
    var txt = p.textContent.replace(/\s+/g, " ").trim();
    var warn = txt.indexOf("⚠") !== -1;
    var icona = warn ? "⚠️ " : "🕒 ";
    var m = txt.match(/(?:agg|posod)\.\s*([0-2]?\d:\d{2})/);
    if (m) return icona + (sl ? "posod. " : "agg. ") + m[1] + etaTxt(minutiDa(m[1]));
    m = txt.match(/(?:Rilevazione|Meritev)\s+([^·(]{2,28}?)(?:\s*[·(]|$)/i);
    if (m) {
      // la boa Piran porta la data ISO ("2026-08-14 17:15"): nel riassunto basta l'ora
      var quando = m[1].trim().replace(/^\d{4}-\d{2}-\d{2}\s*/, "");
      return icona + (sl ? "meritev " : "rilev. ") + quando + etaTxt(minutiDa(quando));
    }
    m = txt.match(/([0-2]?\d:\d{2})/);          // es. "l'ultimo dato è delle 04:09 (oltre 9 ore fa)"
    if (m) {
      var par = txt.match(/\(([^)]+(?: fa|nazaj))\)/);
      return icona + (sl ? "posod. " : "agg. ") + m[1] + (par ? " · " + par[1] : "");
    }
    if (!txt) return "ℹ️ " + (sl ? "podrobnosti" : "dettagli");
    return (warn ? "⚠️ " : "ℹ️ ") + (sl ? "vir in podrobnosti" : "fonte e dettagli");
  }
  document.querySelectorAll('p.stato[id^="stato"]').forEach(function (p) {
    var det = document.createElement("details");
    det.className = "fonte-note";
    var sum = document.createElement("summary");
    det.appendChild(sum);
    p.parentNode.insertBefore(det, p);
    det.appendChild(p);
    // le righe statiche "Fonte: …" subito dopo (es. boe) entrano nello stesso dropdown
    var next = det.nextElementSibling;
    while (next && next.tagName === "P" && next.classList.contains("stato") && !/^stato/.test(next.id || "")) {
      var daSpostare = next;
      next = next.nextElementSibling;
      det.appendChild(daSpostare);
    }
    function sync() { sum.textContent = riassunto(p); }
    sync();
    new MutationObserver(sync).observe(p, { childList: true, subtree: true, characterData: true });
  });
})();

/* Pressione di bora compatta: verdetto, valore e scala restano sempre visibili;
   sotto c'è un solo pulsante "Spiegazione e fonte" che apre direttamente la
   finestra "Differenza di pressione e Bora" (8 ott 2026, Alberto: prima erano
   due clic, tendina e poi "come si legge"). Frase breve e riga della fonte
   salgono in testa alla finestra; il pulsante segue l'orario dei dati live. */
(function () {
  var sl = document.documentElement.lang === "sl" ||
    ((document.getElementById("footerWidgets") || { dataset: {} }).dataset.lang === "sl");
  var modal = document.getElementById("modalDeltaBora");
  var titolo = modal && modal.querySelector("h3");
  if (!titolo) return;
  document.querySelectorAll("#barcolaLive, .bora-delta").forEach(function (box) {
    var spiega = box.querySelector(".bd-spiega");
    var stato = box.querySelector("#deltaBoraStato");
    if (!spiega || !stato || box.querySelector(".bora-note")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bora-note";
    btn.setAttribute("aria-haspopup", "dialog");
    spiega.parentNode.insertBefore(btn, spiega);
    titolo.parentNode.insertBefore(stato, titolo.nextSibling);
    titolo.parentNode.insertBefore(spiega, stato);
    btn.addEventListener("click", function () { modal.style.display = "block"; });

    function sync() {
      // dentro la finestra il rimando "ℹ️ come si legge" non serve più (con il suo " · ")
      var info = stato.querySelector(".bd-info");
      if (info) {
        var prima = info.previousSibling;
        if (prima && prima.nodeType === 3) prima.textContent = prima.textContent.replace(/\s*·\s*$/, "");
        info.remove();
      }
      var testo = stato.textContent.replace(/\s+/g, " ").trim();
      var ora = testo.match(/(?:agg|posod)\.\s*([0-2]?\d:\d{2})/i);
      btn.textContent = (sl ? "ℹ️ Razlaga in vir" : "ℹ️ Spiegazione e fonte") +
        (ora ? " · " + (sl ? "posod. " : "agg. ") + ora[1] : "");
    }
    sync();
    new MutationObserver(sync).observe(stato, { childList: true, subtree: true, characterData: true });
  });
})();

/* Menu raggruppato (13 ott 2026, Alberto: "compatta e ragiona meglio su come costruire il menu").
   Prima era una colonna di 13 pulsanti a tutta larghezza in ordine sparso, con le guide nascoste
   dietro un "+". Ora il pannello è diviso per domanda:
     Sezioni  — dove vado in questa pagina (riquadri a 2 colonne con icona, i link reali della pagina)
     Spot     — le altre pagine locali, quella aperta evidenziata
     Guida    — una riga sola (20 ott 2026, Alberto: "compatta l'accesso alla guida"): la pastiglia
                "📖 Guida" verso il blog /guida/ (accesa anche dentro i suoi articoli), più mappa e
                registro a pagina intera. I capitoli non stanno più qui: sono articoli dell'indice.
     in fondo — Installa l'app e Offrimi una birra, affiancati.
   Il menu si costruisce dai link che ogni pagina ha già in <nav id="topnav">, quindi home, spot e
   pagina slovena restano allineati. data-menu-semplice sul nav lascia il vecchio elenco (Barcolana).
   La voce "Installa l'app" la creiamo qui con data-vt-app: vt-app.js la trova e non ne aggiunge
   un'altra (inserirla accanto alla birra, che ora sta in un gruppo, darebbe errore). */
(function () {
  var nav = document.getElementById("topnav");
  if (!nav || nav.hasAttribute("data-menu-semplice") || nav.querySelector(".mn-gruppo")) return;
  var doc = document.documentElement;
  var sl = doc.lang === "sl" ||
    ((document.getElementById("footerWidgets") || { dataset: {} }).dataset.lang === "sl");
  var T = sl ? {
    sezioni: "Razdelki", spot: "Spoti", guida: "Vodnik in orodja",
    guidaChip: "Vodnik", guidaTitolo: "Vodnik Vento Trieste (v italijanščini)",
    app: "Namesti aplikacijo", birra: "Plačaj mi pivo",
    mappaCentraline: "Zemljevid in postaje", radar: "Radar padavin", boe: "Boje in valovi"
  } : {
    sezioni: "Sezioni", spot: "Spot", guida: "Guida e strumenti",
    guidaChip: "Guida", guidaTitolo: "Guida di Vento Trieste: un articolo per strumento",
    app: "Installa l'app", birra: "Offrimi una birra",
    mappaCentraline: "Mappa e centraline", radar: "Radar pioggia", boe: "Boe e onde"
  };
  var ICONE = {
    vento: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h7"/>',
    mappa: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    webcam: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    radar: '<path d="M7 16a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.2A3.5 3.5 0 0 1 17 16H7z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>',
    onde: '<path d="M3 9c2 0 2.5-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/><path d="M3 15c2 0 2.5-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/>',
    previsioni: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    registro: '<path d="M5 20V10M10 20V4M15 20v-7M20 20V8"/>',
    spot: '<path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    guida: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    lago: '<path d="M3 16c2 0 2.5-1.5 4.5-1.5S10 16 12 16s2.5-1.5 4.5-1.5S19 16 21 16"/><path d="M5 12l4-6 3 4 2-2 5 4"/>',
    partner: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>',
    punto: '<circle cx="12" cy="12" r="3"/>'
  };
  function svg(nome) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONE[nome] || ICONE.punto) + "</svg>";
  }
  function hashDi(a) {
    var h = a.getAttribute("href") || "";
    var i = h.indexOf("#");
    return i < 0 ? h : h.slice(i);
  }
  function iconaPer(a) {
    var h = (a.getAttribute("href") || "").toLowerCase();
    if (/radar/.test(h)) return "radar";
    if (/mappa|centraline/.test(h)) return "mappa";
    if (/#vento/.test(h)) return "vento";
    if (/webcam/.test(h)) return "webcam";
    if (/boe|onde|mare/.test(h)) return "onde";
    if (/previsioni/.test(h)) return "previsioni";
    if (/registro/.test(h)) return "registro";
    if (/istria/.test(h)) return "spot";
    if (/lago/.test(h)) return "lago";
    if (/partner/.test(h)) return "partner";
    return "punto";
  }

  var birra = nav.querySelector(".topnav-birra");
  var sezioni = Array.prototype.filter.call(nav.querySelectorAll(":scope > a"), function (a) {
    return a !== birra && !a.hasAttribute("data-vt-app");
  });
  // centraline e mappa sono una sezione sola ("Mappa e centraline live"): basta una voce
  var mappaLink = sezioni.find(function (a) { return /#mappaVento$/.test(a.getAttribute("href") || ""); });
  var centralineLink = sezioni.find(function (a) { return /#centraline$/.test(a.getAttribute("href") || ""); });
  if (mappaLink && centralineLink) {
    sezioni.splice(sezioni.indexOf(centralineLink), 1);
    centralineLink.remove();
  }
  var ORDINE = ["#vento", "#mappaVento", "#centraline", "#webcam", "#radarLive", "#lago", "#onde", "#boe", "#previsioni", "#registro", "#istria", "#island-partner"];
  function posto(a) {
    var h = hashDi(a);
    if (/\/registro\/?$/.test(a.getAttribute("href") || "")) h = "#registro";
    var i = ORDINE.indexOf(h);
    return i < 0 ? 99 : i;
  }
  sezioni.sort(function (a, b) { return posto(a) - posto(b); });
  sezioni.forEach(function (a) {
    var h = hashDi(a);
    var testo = (a.textContent || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
    if (h === "#mappaVento" || h === "#centraline") testo = T.mappaCentraline;
    if (h === "#radarLive") testo = T.radar;
    if (h === "#boe") testo = T.boe;
    a.classList.add("mn-sez");
    a.innerHTML = '<span class="mn-ico">' + svg(iconaPer(a)) + "</span><span>" + testo + "</span>";
  });

  var qui = location.pathname.replace(/index\.html$/, "");
  var SPOT = [
    ["/", sl ? "Trst · Barcola" : "Trieste · Barcola"], ["/muggia/", "Muggia"], ["/zusterna/", "Žusterna"],
    ["/marinajulia/", "Marina Julia"], ["/grado/", "Grado"], ["/lignano/", "Lignano"],
    ["/lago-di-cavazzo/", sl ? "Jezero Cavazzo" : "Lago di Cavazzo"]
  ];
  var GUIDA = sl ? [
    ["/mappa/", "Zemljevid čez cel zaslon"], ["/registro/", "Dnevnik vetra"]
  ] : [
    ["/mappa/", "Mappa a schermo intero"], ["/registro/", "Registro completo"]
  ];
  function chip(v, extra) {
    var attuale = v[0] === qui;
    return '<a class="mn-chip' + (extra || "") + (attuale ? " is-qui" : "") + '" href="' + v[0] + '"' +
      (attuale ? ' aria-current="page"' : "") + ">" + v[1] + "</a>";
  }
  var gruppoSez = document.createElement("div");
  gruppoSez.className = "mn-gruppo mn-gruppo-sezioni";
  gruppoSez.innerHTML = '<p class="mn-titolo">' + T.sezioni + '</p><div class="mn-griglia"></div>';
  var griglia = gruppoSez.querySelector(".mn-griglia");
  sezioni.forEach(function (a) { griglia.appendChild(a); });

  var gruppoSpot = document.createElement("div");
  gruppoSpot.className = "mn-gruppo";
  gruppoSpot.innerHTML = '<p class="mn-titolo">' + T.spot + '</p><div class="mn-chips">' +
    SPOT.map(function (v) { return chip(v); }).join("") + "</div>";

  var gruppoGuida = document.createElement("div");
  gruppoGuida.className = "mn-gruppo";
  // dentro la guida (indice o un articolo) la pastiglia resta accesa; aria-current solo sull'indice
  var inGuida = qui.indexOf("/guida/") === 0;
  gruppoGuida.innerHTML = '<p class="mn-titolo">' + T.guida + '</p><div class="mn-chips">' +
    '<a class="mn-chip mn-chip-guida' + (inGuida ? " is-qui" : "") + '" href="/guida/" title="' + T.guidaTitolo + '"' +
    (qui === "/guida/" ? ' aria-current="page"' : "") + '><span aria-hidden="true">📖</span> ' + T.guidaChip + "</a>" +
    GUIDA.map(function (v) { return chip(v); }).join("") + "</div>";

  var azioni = document.createElement("div");
  azioni.className = "mn-azioni";
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (!standalone) azioni.insertAdjacentHTML("beforeend", '<a href="#" class="mn-app vt-app-voce" data-vt-app>📲 ' + T.app + "</a>");
  if (birra) {
    birra.textContent = "♥ " + T.birra;
    azioni.appendChild(birra);
  }

  nav.innerHTML = "";
  nav.classList.add("mn");
  nav.appendChild(gruppoSez);
  nav.appendChild(gruppoSpot);
  nav.appendChild(gruppoGuida);
  if (azioni.children.length) nav.appendChild(azioni);

  // velo scuro sotto il pannello aperto: un tocco fuori lo chiude (lo fa già il gestore dei clic)
  var velo = document.createElement("div");
  velo.className = "mn-velo";
  velo.hidden = true;
  document.body.appendChild(velo);
  function sync() {
    velo.hidden = nav.hidden;
    doc.classList.toggle("mn-aperto", !nav.hidden);
  }
  new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ["hidden"] });
  sync();
})();

(function () {
  var root = document.getElementById("footerWidgets");
  if (!root) return;
  var sl = root.dataset.lang === "sl";
  var proxy = "https://script.google.com/macros/s/AKfycbxev3jcFdaCa1MM8lAx56sMBWYCkoUprA7C3Q_uGyCxNEYEjgKF6P3BiDaadr4zvUTpPg/exec";
  var t = sl ? {
    visitors: "Obiskovalci", since: "obiskovalcev od začetka",
    supportKicker: "Neodvisen projekt", supportTitle: "Pomagaj, da Vento Trieste ostane brezplačen",
    supportText: "Podatki v živo, napovedi in vzdrževanje ostajajo dostopni vsem. Če ti je storitev uporabna, lahko podpreš njeno prihodnost.",
    supportCta: "Plačaj mi pivo", supportMethods: "Prostovoljni prispevek · PayPal, Revolut ali Bitcoin",
    supporters: "Podporniki projekta",
    partners: "Partnerji in reference", partnersText: "Ljudje in ustanove, ki širijo kulturo vetra in deljenje podatkov.",
    partnersCount: function (p, f) { return p + " partnerji · " + f + " virov podatkov in kamer"; },
    dataSources: "Podatki in napovedi", localSources: "Kamere in lokalni viri"
  } : {
    visitors: "Visitatori", since: "visitatori dall’inizio",
    supportKicker: "Progetto indipendente", supportTitle: "Aiuta Vento Trieste a restare gratuito",
    supportText: "Dati live, previsioni e manutenzione restano accessibili a tutti. Se il servizio ti è utile, puoi contribuire al suo futuro.",
    supportCta: "Offrimi una birra", supportMethods: "Donazione libera · PayPal, Revolut o Bitcoin",
    supporters: "Chi sostiene il progetto",
    partners: "Partner e riferimenti", partnersText: "Persone e realtà che valorizzano la cultura del vento e la condivisione dei dati.",
    partnersCount: function (p, f) { return p + " partner · " + f + " fonti di dati e webcam"; },
    dataSources: "Dati e previsioni", localSources: "Webcam e fonti locali"
  };
  var supporters = ["Cristina Codrini", "Paolo Perusco", "Pier Paolo Nistri", "Pietro Silvestri", "Prof.ssa Maria Porro", "Giuseppe Alessio Vernì", "Marco Ercolani", "Valentina Lo Presti", "Giulio Maccarrone", "Biagio Alessio", "Luciano Proietti", "Enrico Zamaro", "Massimo Petrusa", "Plinio Botteri", "Nicoletta Kratter", "Fabrizio Zugna", "Francesco Aizza", "Adriano Pek", "Alessandro Crismani", "Dario Stepcich", "Adriano Condello", "Zetko Ales", "Giuseppe Cacciatore", "Giuseppe Miele", "Andrea Valente", "Simone Fratti", "Luca Dreos", "Luigi Fonzi", "sistiana89", "SurfTrieste.Shop", "Stefano Davini", "Gianpaolo Maso", "Matteo Momic", "Martina Marin", "Roberto Piretti", "Elio Massimo Polo", "Paolo Bastiani", "Carlo Capelli", "Luigi Apicella", "Luca Barbaresco", "Maurizio Barillaro", "Carlo Valle", "Marco Di Chiara"];
  /* Sostenitori automatici (20 ott 2026, Alberto: "ogni pagamento 'Hai ricevuto denaro' finisce
     direttamente tra i sostenitori"). Chi dona con PayPal dal 16 ott 2026 arriva dalla web app
     apps-script-sostenitori/ (legge in sola lettura le email PayPal e restituisce solo i nomi) e
     si aggiunge in coda a questo elenco scritto a mano, senza doppioni. La copia in localStorage
     li mostra subito alla visita dopo (Apps Script risponde in 2-40 s). URL vuoto = spento. */
  var SOSTENITORI_URL = "https://script.google.com/macros/s/AKfycbx09_Q0STvkwW4vl2q8molo_Q--kwG2H2hwq0CfsQA69PgSIONZY0y7AH2CLaDkdP-3/exec";
  var CHIAVE_SOST = "vt-sostenitori-auto";
  function chiaveNome(n) { return String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function escNome(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function aggiungiSostenitori(nomi) {
    if (!Array.isArray(nomi)) return false;
    var noti = supporters.map(chiaveNome), aggiunti = false;
    nomi.forEach(function (n) {
      if (typeof n !== "string" || !n.trim() || n.length > 60 || noti.indexOf(chiaveNome(n)) !== -1) return;
      supporters.push(n.trim());
      noti.push(chiaveNome(n));
      aggiunti = true;
    });
    return aggiunti;
  }
  if (SOSTENITORI_URL) {
    try { var copiaSost = JSON.parse(localStorage.getItem(CHIAVE_SOST) || "null"); if (copiaSost) aggiungiSostenitori(copiaSost.nomi); } catch (e) {}
  }
  function nomiSostenitori() { return supporters.map(function (name) { return '<span class="supporter-name">' + escNome(name) + '</span>'; }).join(""); }
  var supporterNames = nomiSostenitori();
  var partners = [
    { name: "Jaka87 · Vetercek", detail: sl ? "mreža postaj v živo" : "rete di centraline live", url: "https://vetercek.com/" },
    { name: "Museo della Bora", detail: sl ? "kultura burje in vetra" : "cultura della Bora e del vento", url: "https://museobora.org/" },
    { name: "Alessio Vremec · ALADIN", detail: sl ? "deljenje vremenskih kart" : "divulgazione delle mappe meteo", url: "https://kuguluff.altervista.org/vento/ventoAladinSI.htm" }
  ];
  var dataSources = [
    { name: "ARPA FVG - S.O.C. OSMER e GRN (previsioni)", url: "https://www.meteo.fvg.it/" },
    { name: "ARSO Slovenija", url: "https://meteo.arso.gov.si/" },
    { name: "ProfiWetter · DWD", url: "https://profiwetter.ch/" },
    { name: "Open-Meteo", url: "https://open-meteo.com/" },
    { name: "OGS · NODC", url: "https://nodc.ogs.it/geoportal/?msv=1" },
    { name: "NIB · boja Vida", url: "https://www.nib.si/mbp/en/oceanographic-data-and-measurements/buoy-2/live-data-2" },
    { name: "Protezione Civile della Regione Friuli Venezia Giulia (stazioni, CC BY 4.0)", url: "https://monitor.protezionecivile.fvg.it/licenza" },
    { name: "Windguru", url: "https://www.windguru.cz/" },
    { name: "Windy", url: "https://www.windy.com/" },
    { name: "KJD BUM", url: "https://kjdbum.si/" }
  ];
  var localSources = [
    { name: "Kite Life FVG", url: "https://www.kitelifefvg.it/" },
    { name: "SVBG", url: "https://www.svbg.it/" },
    { name: "Canottieri Saturnia", url: "https://www.canottierisaturniatrieste.com/webcam/" },
    { name: "Comune di Monfalcone", url: "https://anemometro.comune.monfalcone.go.it/" },
    { name: "Panomax", url: "https://marinamonfalcone.panomax.com/" },
    { name: "What's Up Cams", url: "https://www.whatsupcams.com/it/webcams/italia/friuli-venezia-giulia-it/sistiana-it/webcam-sistiana/" },
    { name: "Lignano Sabbiadoro", url: "https://www.lignanosabbiadoro.com/meteo-lignano" },
    { name: "Meteo Grado", url: "https://meteogrado.kitelifefvg.it/" },
    { name: "Mareografico.it", url: "https://www.mareografico.it/" },
    { name: "Bibione.com", url: "https://www.bibione.com/" },
    { name: "Island Surf", url: "https://www.islandsurf.it/" }
  ];
  /* Le guide stanno nel menu raggruppato (blocco "Menu raggruppato" più su, 13 ott 2026). */
  function sourcePills(list) {
    return list.map(function (source) {
      return '<a class="source-pill" href="' + source.url + '" target="_blank" rel="noopener">' +
        '<span>' + source.name + '</span><span aria-hidden="true">↗</span></a>';
    }).join("");
  }
  var partnerCards = partners.map(function (partner) {
    return '<a class="partner-card" href="' + partner.url + '" target="_blank" rel="noopener">' +
      '<span class="partner-mark" aria-hidden="true">↗</span><span><strong>' + partner.name + '</strong><small>' + partner.detail + '</small></span></a>';
  }).join("");
  /* data-senza="visitatori" sul contenitore toglie quel box dalla pagina (pagina Barcolana).
     Il riquadro "Richiedi una modifica o integrazione" non c'è più (5 ott 2026): suggerimenti e
     migliorie passano dalla firma "Ideato e realizzato da Alberto Broggi" (vt-app.js).
     "Partner e riferimenti" è una tendina chiusa (8 ott 2026, come "Partner, dati e fonti" della
     pagina Barcolana): il <div class="sources"> dentro resta uguale, perché la pagina Barcolana
     lo prende e lo sposta nella sua tendina (e la nostra sparisce con il riquadro). */
  var senza = (root.dataset.senza || "").split(/\s+/);
  var conVisitatori = senza.indexOf("visitatori") < 0;
  root.innerHTML =
    (conVisitatori ? '<section class="footer-widget compact" aria-labelledby="footerVisitorsTitle"><h2 id="footerVisitorsTitle">👥 ' + t.visitors + '</h2><p class="visitor-total" id="footerVisitorTotal">2.885</p><p class="visitor-label">' + t.since + '</p></section>' : '') +
    '<section class="footer-widget support-widget" aria-labelledby="footerSupportTitle">' +
      '<div class="support-hero"><span class="support-kicker">' + t.supportKicker + '</span>' +
      '<span class="support-symbol" aria-hidden="true">🍺</span><h2 id="footerSupportTitle">' + t.supportTitle + '</h2>' +
      '<p>' + t.supportText + '</p><a class="dona-btn support-primary" href="#" id="footerSupportButton">' +
      '<span aria-hidden="true">♥</span><span>' + t.supportCta + '</span><span aria-hidden="true">→</span></a>' +
      '<span class="support-methods">' + t.supportMethods + '</span></div>' +
      '<div class="supporters"><div class="supporters-heading"><h3>' + t.supporters + '</h3></div>' +
      '<div class="supporters-marquee" tabindex="0" aria-label="' + t.supporters + ': ' + escNome(supporters.join(', ')) + '">' +
      '<div class="supporters-track"><div class="supporters-group">' + supporterNames + '</div>' +
      '<div class="supporters-group" aria-hidden="true">' + supporterNames + '</div></div></div></div>' +
      '<details class="sources-tendina' + (sl ? ' sources-tendina-sl' : '') + '"><summary><span class="sources-tendina-titolo">🤝 ' + t.partners +
        '<small>' + t.partnersCount(partners.length, dataSources.length + localSources.length) + '</small></span></summary>' +
      '<div class="sources"><div class="sources-heading"><h3>' + t.partners + '</h3><p>' + t.partnersText + '</p></div>' +
      '<div class="partner-grid">' + partnerCards + '</div>' +
      '<h4>' + t.dataSources + '</h4><div class="source-pills">' + sourcePills(dataSources) + '</div>' +
      '<h4>' + t.localSources + '</h4><div class="source-pills">' + sourcePills(localSources) + '</div></div></details>' +
    '</section>';

  if (conVisitatori) fetch(proxy + "?views=1&ts=" + Date.now()).then(function (r) { return r.json(); }).then(function (v) {
    if (v && v.total != null) document.getElementById("footerVisitorTotal").textContent = Number(v.total).toLocaleString(sl ? "sl-SI" : "it-IT");
  }).catch(function () {});

  if (SOSTENITORI_URL) fetch(SOSTENITORI_URL).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !Array.isArray(j.sostenitori)) return;
    try { localStorage.setItem(CHIAVE_SOST, JSON.stringify({ nomi: j.sostenitori, t: Date.now() })); } catch (e) {}
    if (!aggiungiSostenitori(j.sostenitori)) return;
    var html = nomiSostenitori();
    Array.prototype.forEach.call(root.querySelectorAll(".supporters-group"), function (g) { g.innerHTML = html; });
    var marquee = root.querySelector(".supporters-marquee");
    if (marquee) marquee.setAttribute("aria-label", t.supporters + ": " + supporters.join(", "));
  }).catch(function () {});

  document.getElementById("footerSupportButton").addEventListener("click", function (e) {
    e.preventDefault(); if (typeof window.apriBirra === "function") window.apriBirra(e);
  });
})();

/* I widget Windguru sono pesanti e non servono durante la lettura dei dati live.
   Vengono montati solo quando l'utente apre Previsioni e soltanto per il modello
   selezionato. Ogni pannello già caricato resta in memoria quando si cambia tab. */
(function () {
  "use strict";
  document.querySelectorAll(".windguru-section").forEach(function (section) {
    var buttons = Array.prototype.slice.call(section.querySelectorAll(".windguru-tab"));
    var stage = section.querySelector(".windguru-stage");
    if (!buttons.length || !stage) return;

    function load(button) {
      buttons.forEach(function (candidate) {
        var active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-selected", String(active));
        var existing = stage.querySelector('[data-wg-panel="' + candidate.dataset.wgUid + '"]');
        if (existing) existing.hidden = !active;
      });

      var uid = button.dataset.wgUid;
      var panel = stage.querySelector('[data-wg-panel="' + uid + '"]');
      if (panel) return;

      /* Senza data-wg-lang segue la lingua della pagina (Barcolana: IT/EN). */
      var lang = button.dataset.wgLang || (document.documentElement.lang === "en" ? "en" : "it");
      var en = lang === "en";
      panel = document.createElement("div");
      panel.className = "windguru-panel";
      panel.dataset.wgPanel = uid;
      panel.setAttribute("role", "tabpanel");
      panel.innerHTML = '<p class="windguru-loading" role="status">' + (en ? "Loading model…" : "Carico il modello…") + '</p>';
      stage.appendChild(panel);

      var marker = document.createElement("script");
      marker.id = uid;
      panel.appendChild(marker);
      var params = [
        "s=" + button.dataset.wgSpot,
        "m=" + button.dataset.wgModel,
        "uid=" + uid,
        "wj=knots", "tj=c", "waj=m", "tij=cm", "odh=0", "doh=24",
        "fhours=240", "hrsm=2", "vt=forecasts",
        "lng=" + lang,
        "p=WINDSPD,GUST,MWINDSPD,SMER,TMP,CDC,APCP1s"
      ];
      var loader = document.createElement("script");
      loader.src = "https://www.windguru.cz/js/widget.php?" + params.join("&");
      loader.async = true;
      loader.onload = function () {
        var loading = panel.querySelector(".windguru-loading");
        if (loading) loading.remove();
      };
      loader.onerror = function () {
        panel.innerHTML = '<p class="windguru-error">⚠️ ' + (en ? "Model unavailable. Try again shortly." : "Modello non disponibile. Riprova tra poco.") + '</p>';
      };
      marker.parentNode.insertBefore(loader, marker);
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () { load(button); });
    });

    var forecast = section.closest("details");
    var first = buttons[0];
    if (forecast) {
      forecast.addEventListener("toggle", function () {
        if (forecast.open && !stage.dataset.started) {
          stage.dataset.started = "1";
          load(first);
        }
      });
      if (forecast.open) {
        stage.dataset.started = "1";
        load(first);
      }
    } else if ("IntersectionObserver" in window) {
      /* Box fuori da un <details> (pagina Barcolana): il primo modello parte
         quando il box si avvicina allo schermo, non al caricamento della pagina. */
      var observer = new IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        observer.disconnect();
        stage.dataset.started = "1";
        load(first);
      }, { rootMargin: "300px 0px" });
      observer.observe(section);
    } else {
      stage.dataset.started = "1";
      load(first);
    }
  });

  var legacyLoaders = window.windguruDeferredLoaders || [];
  if (legacyLoaders.length) {
    var legacyForecast = document.getElementById("previsioni");
    var startLegacy = function () {
      if (!legacyForecast || !legacyForecast.open || legacyForecast.dataset.windguruStarted) return;
      legacyForecast.dataset.windguruStarted = "1";
      legacyLoaders.splice(0).forEach(function (loader, index) {
        /* Piccolo scaglionamento: evita tre picchi di rete nello stesso frame. */
        window.setTimeout(loader, index * 180);
      });
    };
    if (legacyForecast) legacyForecast.addEventListener("toggle", startLegacy);
    startLegacy();
  }
})();

/* UX condivisa: stato dati, orientamento nella pagina, feedback dei comandi e
   dock mobile. La navigazione viene costruita dai link reali di ogni pagina,
   così home, spot italiani e pagina slovena restano allineati. */
(function () {
  "use strict";

  var doc = document.documentElement;
  var sl = doc.lang === "sl" ||
    ((document.getElementById("footerWidgets") || { dataset: {} }).dataset.lang === "sl");
  var copy = sl ? {
    updated: "Posod.", updatedData: "Podatki posodobljeni", syncing: "Osvežujem podatke",
    partial: "Delni podatki", refresh: "Osveži podatke", refreshing: "Osvežujem…",
    fallback: "Prikazujem zadnje razpoložljive podatke", more: "Več",
    now: "Zdaj", stations: "Postaje", buoys: "Boje", waves: "Valovi",
    map: "Zemljevid", forecast: "Napovedi", webcams: "Kamere"
  } : {
    updated: "Agg.", updatedData: "Dati aggiornati", syncing: "Aggiorno dati",
    partial: "Dati parziali", refresh: "Aggiorna dati", refreshing: "Aggiorno…",
    fallback: "Mostro gli ultimi dati disponibili", more: "Altro",
    now: "Ora", stations: "Stazioni", buoys: "Boe", waves: "Onde",
    map: "Mappa", forecast: "Previsioni", webcams: "Webcam"
  };

  doc.classList.add("ux-enhanced");
  // regole compatte da telefono e telefono in orizzontale (13 ott 2026): non sulla pagina Barcolana
  if (!document.body.classList.contains("bcn")) doc.classList.add("vt-compatto");

  var topbar = document.querySelector(".topbar");
  var progressFill = null;
  if (topbar) {
    var progress = document.createElement("div");
    progress.className = "ux-scroll-progress";
    progress.setAttribute("aria-hidden", "true");
    progress.innerHTML = "<span></span>";
    topbar.appendChild(progress);
    progressFill = progress.firstElementChild;
  }
  var progressTick = false;
  function aggiornaProgresso() {
    progressTick = false;
    if (!progressFill) return;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var ratio = Math.max(0, Math.min(1, window.scrollY / max));
    progressFill.style.transform = "scaleX(" + ratio.toFixed(4) + ")";
  }
  window.addEventListener("scroll", function () {
    if (progressTick) return;
    progressTick = true;
    requestAnimationFrame(aggiornaProgresso);
  }, { passive: true });
  window.addEventListener("resize", aggiornaProgresso, { passive: true });
  aggiornaProgresso();

  var live = document.querySelector(".topbar-live");
  var status = document.getElementById("ultimoAggiornamento");
  function leggiOra(testo) {
    var match = testo.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    return match ? match[0] : "";
  }
  function aggiornaStatoLive() {
    if (!live || !status) return;
    var testo = (status.textContent || "").trim();
    var lower = testo.toLowerCase();
    var ora = leggiOra(testo);
    var state = "ok";
    var label = ora ? copy.updated + " " + ora : copy.updatedData;
    if (!testo || /caricamento|in corso|posodabljanje|nalaganje/.test(lower)) {
      state = "syncing";
      label = copy.syncing;
    } else if (/⚠|impossibile|lento|ni mogoče|počasna|nedosegljiv/.test(lower)) {
      state = "issue";
      label = ora ? copy.partial + " · " + ora : copy.partial;
    }
    live.dataset.state = state;
    live.textContent = label;
    live.title = testo || label;
  }
  if (live && status) {
    aggiornaStatoLive();
    new MutationObserver(aggiornaStatoLive).observe(status, {
      childList: true, subtree: true, characterData: true
    });
  }

  var nav = document.getElementById("topnav");
  var menuButton = document.getElementById("menuToggle");
  // solo le voci di sezione: non chip degli spot, guida, "Installa l'app" del menu raggruppato
  var navLinks = nav ? Array.prototype.slice.call(nav.querySelectorAll('a:not(.topnav-birra):not(.topnav-guide-link):not(.mn-chip):not([data-vt-app])')) : [];
  function trovaLink(parola) {
    return navLinks.find(function (link) {
      return (link.getAttribute("href") || "").toLowerCase().indexOf(parola.toLowerCase()) !== -1;
    });
  }
  /* Icone del dock: SVG a tratto (currentColor), niente emoji (rendono diverso
     su ogni sistema e sembrano poco serie). */
  var DOCK_ICONS = {
    radar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 16a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.2A3.5 3.5 0 0 1 17 16H7z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/></svg>',
    mappa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    vento: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h7"/></svg>',
    centraline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12v9"/><circle cx="12" cy="11" r="1.5"/><path d="M8.5 7.5a5 5 0 0 1 7 0M6 5a8.5 8.5 0 0 1 12 0"/></svg>',
    onde: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9c2 0 2.5-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/><path d="M3 15c2 0 2.5-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/></svg>',
    previsioni: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    webcam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    dot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/></svg>'
  };
  function metaLink(link) {
    var href = (link.getAttribute("href") || "").toLowerCase();
    if (href.indexOf("radar") !== -1) return { icon: DOCK_ICONS.radar, label: "Radar" };
    if (href.indexOf("mappa") !== -1) return { icon: DOCK_ICONS.mappa, label: copy.map };
    if (href.indexOf("vento") !== -1) return { icon: DOCK_ICONS.vento, label: copy.now };
    if (href.indexOf("centraline") !== -1) return { icon: DOCK_ICONS.centraline, label: copy.stations };
    if (href.indexOf("onde") !== -1) return { icon: DOCK_ICONS.onde, label: copy.waves };
    if (href.indexOf("boe") !== -1) return { icon: DOCK_ICONS.onde, label: copy.buoys };
    if (href.indexOf("previsioni") !== -1) return { icon: DOCK_ICONS.previsioni, label: copy.forecast };
    if (href.indexOf("webcam") !== -1) return { icon: DOCK_ICONS.webcam, label: copy.webcams };
    return { icon: DOCK_ICONS.dot, label: (link.textContent || "").trim() };
  }

  var dock = null;
  if (nav && menuButton && navLinks.length) {
    var selected = [];
    /* Ordine esplicito: <nav id="topnav" data-dock="#vento,#webcam,#radarLive,#previsioni">
       (home, 2 ott 2026: Ora · Webcam · Radar · Previsioni · Altro). Una voce che non è
       nel menu diventa comunque un link alla sua sezione. */
    var ordineDock = (nav.getAttribute("data-dock") || "").split(",")
      .map(function (h) { return h.trim(); }).filter(function (h) { return !!h; });
    ordineDock.forEach(function (h) {
      var link = navLinks.find(function (l) { return l.getAttribute("href") === h; });
      if (!link) { link = document.createElement("a"); link.setAttribute("href", h); }
      selected.push(link);
    });
    if (!selected.length) {
      var first = trovaLink("#vento") || navLinks[0];
      var second = trovaLink("#mappavento") || trovaLink("#centraline") || trovaLink("#boe");
      var third = trovaLink("#webcam") || trovaLink("#radarlive");
      var fourth = trovaLink("#radarlive") || trovaLink("#previsioni");
      [first, second, third, fourth].forEach(function (link) {
        if (link && selected.indexOf(link) === -1) selected.push(link);
      });
      navLinks.forEach(function (link) {
        if (selected.length < 4 && selected.indexOf(link) === -1) selected.push(link);
      });
    }

    dock = document.createElement("nav");
    dock.className = "ux-mobile-dock";
    dock.setAttribute("aria-label", sl ? "Hitre povezave" : "Azioni rapide");
    selected.slice(0, 4).forEach(function (source) {
      var item = document.createElement("a");
      var meta = metaLink(source);
      item.href = source.getAttribute("href");
      item.innerHTML = '<span class="ux-dock-icon" aria-hidden="true">' + meta.icon +
        '</span><span class="ux-dock-label">' + meta.label + '</span>';
      dock.appendChild(item);
    });
    var more = document.createElement("button");
    more.type = "button";
    more.innerHTML = '<span class="ux-dock-icon" aria-hidden="true">' + DOCK_ICONS.more + '</span>' +
      '<span class="ux-dock-label">' + copy.more + '</span>';
    more.addEventListener("click", function (event) {
      event.stopPropagation();
      menuButton.click();
      setTimeout(function () { menuButton.focus({ preventScroll: true }); }, 0);
    });
    dock.appendChild(more);
    document.body.appendChild(dock);
  }

  function idLocale(link) {
    var href = link && link.getAttribute("href");
    return href && href.charAt(0) === "#" && href.length > 1 ? decodeURIComponent(href.slice(1)) : "";
  }
  var dockLinks = dock ? Array.prototype.slice.call(dock.querySelectorAll('a[href^="#"]')) : [];
  var localNavLinks = navLinks.filter(function (link) { return !!idLocale(link); });
  var localIds = localNavLinks.map(idLocale).filter(function (id, i, all) {
    return id && all.indexOf(id) === i && document.getElementById(id);
  });
  function impostaAttivo(id) {
    localNavLinks.forEach(function (link) {
      link.classList.toggle("is-active", idLocale(link) === id);
    });
    dockLinks.forEach(function (link) {
      link.classList.toggle("is-active", idLocale(link) === id);
    });
  }
  var activeScrollTick = false;
  function aggiornaSezioneAttiva() {
    activeScrollTick = false;
    if (!localIds.length) return;
    var marker = (topbar ? topbar.getBoundingClientRect().height : 0) + 24;
    var current = localIds[0];
    var distance = Infinity;
    localIds.forEach(function (id) {
      var target = document.getElementById(id);
      if (!target) return;
      var rect = target.getBoundingClientRect();
      if (rect.top <= marker && rect.bottom > marker) {
        current = id;
        distance = -1;
      } else if (distance !== -1 && rect.top > marker && rect.top - marker < distance) {
        current = id;
        distance = rect.top - marker;
      }
    });
    impostaAttivo(current);
  }
  function programmaSezioneAttiva() {
    if (activeScrollTick) return;
    activeScrollTick = true;
    requestAnimationFrame(aggiornaSezioneAttiva);
  }
  window.addEventListener("scroll", programmaSezioneAttiva, { passive: true });
  window.addEventListener("resize", programmaSezioneAttiva, { passive: true });
  document.addEventListener("toggle", programmaSezioneAttiva, true);
  impostaAttivo(location.hash.slice(1) || localIds[0] || "");
  requestAnimationFrame(aggiornaSezioneAttiva);

  if (dock) {
    dock.addEventListener("click", function (event) {
      var link = event.target.closest('a[href^="#"]');
      if (!link) return;
      var id = idLocale(link);
      var target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      var gruppo = target.closest("details");
      while (gruppo) {
        gruppo.open = true;
        gruppo = gruppo.parentElement ? gruppo.parentElement.closest("details") : null;
      }
      var riduciMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      function vaiAllaSezione(behavior) {
        var offset = (topbar ? topbar.getBoundingClientRect().height : 0) + 12;
        var y = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, y), left: 0, behavior: behavior });
        impostaAttivo(id);
      }
      vaiAllaSezione(riduciMovimento ? "auto" : "smooth");
      setTimeout(function () { vaiAllaSezione("auto"); }, 320);
      setTimeout(function () { vaiAllaSezione("auto"); }, 1050);
      history.replaceState(null, "", "#" + id);
    });
  }

  var toast = document.createElement("div");
  toast.className = "ux-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.appendChild(toast);
  var toastTimer = null;
  function mostraToast(messaggio) {
    clearTimeout(toastTimer);
    toast.textContent = messaggio;
    toast.classList.add("is-visible");
    toastTimer = setTimeout(function () { toast.classList.remove("is-visible"); }, 2600);
  }

  var refresh = document.getElementById("btnAggiorna");
  var manualRefresh = false;
  if (refresh) {
    function aggiornaPulsante() {
      var loading = refresh.disabled;
      refresh.classList.toggle("is-loading", loading);
      refresh.innerHTML = loading
        ? '<span class="ux-spin" aria-hidden="true">↻</span> ' + copy.refreshing
        : '<span aria-hidden="true">↻</span> ' + copy.refresh;
      if (!loading && manualRefresh) {
        manualRefresh = false;
        var problema = status && /⚠|impossibile|lento|ni mogoče|počasna|nedosegljiv/i.test(status.textContent || "");
        mostraToast(problema ? copy.fallback : copy.updatedData);
      }
    }
    refresh.addEventListener("click", function () { manualRefresh = true; }, true);
    aggiornaPulsante();
    new MutationObserver(aggiornaPulsante).observe(refresh, {
      attributes: true, attributeFilter: ["disabled"]
    });
  }

  if ("IntersectionObserver" in window &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var revealTargets = Array.prototype.slice.call(document.querySelectorAll(
      ".section, .console-card, .side-card, .gruppo-sum"
    ));
    revealTargets.forEach(function (element) { element.classList.add("ux-reveal"); });
    doc.classList.add("ux-motion-ready");
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -7% 0px", threshold: .04 });
    revealTargets.forEach(function (element) { revealObserver.observe(element); });
  }
})();

/* Webcam a schermo intero (13 ott 2026, Alberto: "quando metto la webcam in orizzontale sballa tutto").
   Le webcam a immagine (Barcola, Grado, …) prima aprivano il JPG grezzo in una nuova scheda; ora un
   tocco le apre a tutto schermo sopra la pagina, nera, con la ✕: girando il telefono l'immagine
   riempie la larghezza. Su Android si chiede anche lo schermo intero del browser. Esc, ✕ o un tocco
   chiudono. Video e iframe hanno già il loro pulsante schermo intero. */
(function () {
  // solo le webcam dentro un link (le strisce ritagliate dell'anemometro di Marina Julia restano come sono)
  var imgs = document.querySelectorAll("a > img.webcam");
  if (!imgs.length) return;
  var doc = document.documentElement;
  var sl = doc.lang === "sl" ||
    ((document.getElementById("footerWidgets") || { dataset: {} }).dataset.lang === "sl");
  var T = sl ? { badge: "Cel zaslon", chiudi: "Zapri", hint: "Obrni telefon za večjo sliko · dotik zapre" }
             : { badge: "Schermo intero", chiudi: "Chiudi", hint: "Gira il telefono per vederla più grande · tocca per chiudere" };
  var lb = document.createElement("div");
  lb.className = "cam-lb";
  lb.hidden = true;
  lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true");
  lb.innerHTML = '<img alt=""><div class="cam-lb-barra"><span class="cam-lb-titolo"></span>' +
    '<button type="button" class="cam-lb-x" aria-label="' + T.chiudi + '">✕</button></div>' +
    '<p class="cam-lb-hint">' + T.hint + "</p>";
  document.body.appendChild(lb);
  var big = lb.querySelector("img"), titolo = lb.querySelector(".cam-lb-titolo");
  var prima = null;
  function apri(img) {
    prima = document.activeElement;
    big.src = img.currentSrc || img.src;
    big.alt = img.alt || "";
    titolo.textContent = img.alt || "";
    lb.hidden = false;
    doc.classList.add("cam-lb-aperto");
    lb.querySelector(".cam-lb-x").focus({ preventScroll: true });
    if (/Android/i.test(navigator.userAgent) && lb.requestFullscreen) lb.requestFullscreen().catch(function () {});
    if (window.vtConta) window.vtConta("webcam: schermo intero");
  }
  function chiudi() {
    if (lb.hidden) return;
    lb.hidden = true;
    doc.classList.remove("cam-lb-aperto");
    if (document.fullscreenElement === lb && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    if (prima && prima.focus) prima.focus({ preventScroll: true });
  }
  lb.addEventListener("click", chiudi);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") chiudi(); });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && !lb.hidden && /Android/i.test(navigator.userAgent)) chiudi(); });
  Array.prototype.forEach.call(imgs, function (img) {
    var link = img.parentNode;
    link.classList.add("cam-zoom");
    var badge = document.createElement("span");
    badge.className = "cam-zoom-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "⛶ " + T.badge;
    link.appendChild(badge);
    // l'etichetta "Schermo intero" compare solo a immagine caricata
    function pronta() { link.classList.toggle("cam-pronta", img.complete && img.naturalWidth > 0); }
    img.addEventListener("load", pronta);
    img.addEventListener("error", pronta);
    pronta();
    link.addEventListener("click", function (e) {
      if (!img.src || img.style.display === "none") return;   // non ancora caricata: lascia il link
      e.preventDefault();
      apri(img);
    });
  });
})();

/* Icone SVG al posto delle emoji (28 ott 2026). Alberto: "metti degli SVG più morbidi, come nel menu
   sotto: mi piacciono di più. Niente emoticon, su tutte le pagine". Stesso disegno delle icone del
   dock e del menu (tratto arrotondato, currentColor): le emoji cambiano da telefono a telefono e
   stonano accanto al resto. Si cambia solo l'emoji in testa al testo di titoli, pulsanti, tendine e
   link; i testi che gli script riscrivono dopo (es. "🕒 Fonte: Barcola", "ℹ️ Spiegazione e fonte")
   li riprende un MutationObserver. I titoli delle sezioni hanno l'icona in un riquadro, come nel
   menu. Non sulla pagina Barcolana (grafica approvata dai partner). */
(function () {
  if (document.body.classList.contains("bcn") || !window.MutationObserver) return;
  var P = {
    vento: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h7"/>',
    mappa: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    webcam: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    radar: '<path d="M7 16a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.2A3.5 3.5 0 0 1 17 16H7z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>',
    onde: '<path d="M3 9c2 0 2.5-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/><path d="M3 15c2 0 2.5-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/>',
    previsioni: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    registro: '<path d="M5 20V10M10 20V4M15 20v-7M20 20V8"/>',
    spot: '<path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    guida: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    centraline: '<path d="M12 12v9"/><circle cx="12" cy="11" r="1.5"/><path d="M8.5 7.5a5 5 0 0 1 7 0M6 5a8.5 8.5 0 0 1 12 0"/>',
    cuore: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.01"/>',
    aggiorna: '<path d="M20 12a8 8 0 0 1-14.3 4.9"/><path d="M4 12A8 8 0 0 1 18.3 7.1"/><path d="M18.5 3.5v4h-4"/><path d="M5.5 20.5v-4h4"/>',
    casa: '<path d="M4 11l8-7 8 7"/><path d="M6 9.8V20h12V9.8"/><path d="M10 20v-5h4v5"/>',
    vela: '<path d="M11 3L5 16h6z"/><path d="M13 7v9h5z"/><path d="M3 19.5c3 1.4 6 1.4 9 0s6-1.4 9 0"/>',
    posta: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    orologio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    grafico: '<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    telefono: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    avviso: '<path d="M10.3 4.6a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z"/><path d="M12 10v4"/><path d="M12 17.2v.01"/>',
    termometro: '<path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z"/><path d="M12 10v6"/>',
    goccia: '<path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z"/>',
    barometro: '<circle cx="12" cy="13" r="8"/><path d="M12 13l3.5-3.5"/><path d="M7.5 15.5h.01M12 8.5h.01M16.5 15.5h.01"/>',
    copia: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
    persone: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3 3 0 0 1 0 6"/><path d="M21 20a6 6 0 0 0-4-5.6"/>',
    birra: '<path d="M6 8h9v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M15 11h2a2 2 0 0 1 0 4h-2"/><path d="M6 8a2.5 2.5 0 0 1 4.5-1.5A2.5 2.5 0 0 1 15 8"/>',
    schermo: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    sole: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5z"/>',
    indietro: '<path d="M16 5.5v13a1 1 0 0 1-1.5.9l-10-6.5a1 1 0 0 1 0-1.8l10-6.5a1 1 0 0 1 1.5.9z"/>',
    lampo: '<path d="M13 3L5.5 13.5h6L10.5 21 18.5 10.5h-6z"/>'
  };
  var EMOJI = {
    "🌬": "vento", "💨": "vento", "📷": "webcam", "📸": "webcam", "🌧": "radar", "⛈": "radar",
    "🌊": "onde", "📅": "previsioni", "📆": "previsioni", "📋": "copia", "🏖": "spot", "📍": "spot",
    "📖": "guida", "📡": "centraline", "♥": "cuore", "❤": "cuore", "🤝": "cuore", "ℹ": "info",
    "🔄": "aggiorna", "↻": "aggiorna", "🏠": "casa", "⛵": "vela", "📩": "posta", "✉": "posta",
    "🕒": "orologio", "⏳": "orologio", "📈": "grafico", "🗺": "mappa", "🔗": "link", "📲": "telefono",
    "⚠": "avviso", "🌡": "termometro", "💧": "goccia", "🔽": "barometro", "👥": "persone", "🍺": "birra",
    "⛶": "schermo", "☀": "sole", "☾": "luna", "▶": "play", "◀": "indietro", "⚡": "lampo"
  };
  // titolo della tendina → la stessa icona della voce del menu
  var PER_SEZIONE = {
    mappaVento: "mappa", centraline: "centraline", webcam: "webcam", radarLive: "radar", boe: "onde",
    onde: "onde", previsioni: "previsioni", registro: "registro", istria: "spot"
  };
  var RE = new RegExp("^\\s*(" + Object.keys(EMOJI).join("|") + ")[\\uFE0E\\uFE0F]?\\s*", "u");
  var TITOLO = ".gruppo-sum-main > strong";
  var SEL = TITOLO + ", summary, button, a, h2, h3, h4, label, .centraline-titolo, .webcam-luogo, .story-kicker, .sun-times, .cam-zoom-badge";

  // il primo testo dell'elemento, se nulla di visibile (icona, immagine) lo precede
  function testoIniziale(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (/\S/.test(n.nodeValue)) return n; continue; }
      if (/^(svg|img|br|input|select|textarea|video|iframe)$/i.test(n.nodeName)) return null;
    }
    return null;
  }
  function sistema(el) {
    if (el.closest("svg, [contenteditable]")) return;
    var t = testoIniziale(el);
    // il testo lo sistema l'elemento più interno (il titolo dentro il <summary>, non il <summary>)
    if (!t || t.parentNode.closest(SEL) !== el) return;
    var m = t.nodeValue.match(RE);
    if (!m) return;
    var nome = EMOJI[m[1]];
    if (nome === "copia" && /registr|dnevnik/i.test(t.nodeValue)) nome = "registro";
    var titolo = el.matches(TITOLO);
    if (titolo) {
      var det = el.closest("details");
      if (det && PER_SEZIONE[det.id]) nome = PER_SEZIONE[det.id];
    }
    t.nodeValue = t.nodeValue.slice(m[0].length);
    // <i> e non <span>: le regole delle pagine su ".gruppo-sum-main span" (sottotitolo) non la toccano
    var ico = document.createElement("i");
    ico.className = titolo ? "vt-ico-box" : "vt-ico" + (el.textContent.trim() ? "" : " vt-ico-solo");
    ico.setAttribute("data-ico", nome);
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + P[nome] + "</svg>";
    t.parentNode.insertBefore(ico, t);
  }
  var inAttesa = false;
  function passa() {
    inAttesa = false;
    Array.prototype.forEach.call(document.querySelectorAll(SEL), sistema);
  }
  passa();
  document.addEventListener("DOMContentLoaded", passa);
  new MutationObserver(function () {
    if (inAttesa) return;
    inAttesa = true;
    setTimeout(passa, 50);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
