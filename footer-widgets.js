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
   spiegazione, fonte e guida finiscono in un dropdown come quello del
   Surfometro. Il riepilogo segue l'orario quando i dati live si aggiornano. */
(function () {
  var sl = document.documentElement.lang === "sl" ||
    ((document.getElementById("footerWidgets") || { dataset: {} }).dataset.lang === "sl");
  document.querySelectorAll("#barcolaLive, .bora-delta").forEach(function (box) {
    var spiega = box.querySelector(".bd-spiega");
    var stato = box.querySelector("#deltaBoraStato");
    if (!spiega || !stato || spiega.closest(".bora-note")) return;

    var det = document.createElement("details");
    det.className = "bora-note";
    var sum = document.createElement("summary");
    det.appendChild(sum);
    spiega.parentNode.insertBefore(det, spiega);
    det.appendChild(spiega);
    det.appendChild(stato);

    function sync() {
      var testo = stato.textContent.replace(/\s+/g, " ").trim();
      var ora = testo.match(/(?:agg|posod)\.\s*([0-2]?\d:\d{2})/i);
      sum.textContent = (sl ? "ℹ️ Razlaga in vir" : "ℹ️ Spiegazione e fonte") +
        (ora ? " · " + (sl ? "posod. " : "agg. ") + ora[1] : "");
    }
    sync();
    new MutationObserver(sync).observe(stato, { childList: true, subtree: true, characterData: true });
  });
})();

(function () {
  var root = document.getElementById("footerWidgets");
  if (!root) return;
  var sl = root.dataset.lang === "sl";
  var proxy = "https://script.google.com/macros/s/AKfycbxev3jcFdaCa1MM8lAx56sMBWYCkoUprA7C3Q_uGyCxNEYEjgKF6P3BiDaadr4zvUTpPg/exec";
  var t = sl ? {
    visitors: "Obiskovalci", since: "obiskovalcev od začetka", request: "Predlagaj spremembo ali dopolnitev",
    placeholder: "Opiši želeno spremembo ali dopolnitev…", send: "📩 Pošlji predlog",
    note: "Odpre se že pripravljeno sporočilo v tvojem e-poštnem programu.", modify: "Sprememba / izboljšava",
    integrate: "Dopolnitev (vir, kamera, spot)", problem: "Prijava težave", other: "Drugo",
    supportKicker: "Neodvisen projekt", supportTitle: "Pomagaj, da Vento Trieste ostane brezplačen",
    supportText: "Podatki v živo, napovedi in vzdrževanje ostajajo dostopni vsem. Če ti je storitev uporabna, lahko podpreš njeno prihodnost.",
    supportCta: "Plačaj mi pivo", supportMethods: "Prostovoljni prispevek · PayPal, Revolut ali Bitcoin",
    supporters: "Podporniki projekta", supporterCount: "podpornikov",
    partners: "Partnerji in reference", partnersText: "Ljudje in ustanove, ki širijo kulturo vetra in deljenje podatkov.",
    dataSources: "Podatki in napovedi", localSources: "Kamere in lokalni viri"
  } : {
    visitors: "Visitatori", since: "visitatori dall’inizio", request: "Richiedi una modifica o integrazione",
    placeholder: "Descrivi la modifica o l’integrazione che vorresti…", send: "📩 Invia richiesta",
    note: "La richiesta si apre nella tua app di posta, già compilata: basta premere invia.", modify: "Modifica / miglioria",
    integrate: "Integrazione (fonte, webcam, spot)", problem: "Segnalazione problema", other: "Altro",
    supportKicker: "Progetto indipendente", supportTitle: "Aiuta Vento Trieste a restare gratuito",
    supportText: "Dati live, previsioni e manutenzione restano accessibili a tutti. Se il servizio ti è utile, puoi contribuire al suo futuro.",
    supportCta: "Offrimi una birra", supportMethods: "Donazione libera · PayPal, Revolut o Bitcoin",
    supporters: "Chi sostiene il progetto", supporterCount: "sostenitori",
    partners: "Partner e riferimenti", partnersText: "Persone e realtà che valorizzano la cultura del vento e la condivisione dei dati.",
    dataSources: "Dati e previsioni", localSources: "Webcam e fonti locali"
  };
  var supporters = ["Prof.ssa Maria Porro", "Giuseppe Alessio Vernì", "Marco Ercolani", "Valentina Lo Presti", "Giulio Maccarrone", "Biagio Alessio", "Luciano Proietti", "Enrico Zamaro", "Massimo Petrusa", "Plinio Botteri", "Nicoletta Kratter", "Fabrizio Zugna", "Francesco Aizza", "Adriano Pek", "Alessandro Crismani", "Dario Stepcich", "Adriano Condello", "Zetko Ales", "Giuseppe Cacciatore", "Giuseppe Miele", "Andrea Valente", "Simone Fratti", "Luca Dreos", "Luigi Fonzi", "sistiana89", "SurfTrieste.Shop"];
  var supporterNames = supporters.map(function (name) { return '<span class="supporter-name">' + name + '</span>'; }).join("");
  var partners = [
    { name: "Jaka87 · Vetercek", detail: sl ? "mreža postaj v živo" : "rete di centraline live", url: "https://vetercek.com/" },
    { name: "Museo della Bora", detail: sl ? "kultura burje in vetra" : "cultura della Bora e del vento", url: "https://museobora.org/" },
    { name: "Alessio Vremec · ALADIN", detail: sl ? "deljenje vremenskih kart" : "divulgazione delle mappe meteo", url: "https://kuguluff.altervista.org/vento/ventoAladinSI.htm" }
  ];
  var dataSources = [
    { name: "OSMER · ARPA FVG", url: "https://www.meteo.fvg.it/" },
    { name: "ARSO Slovenija", url: "https://meteo.arso.gov.si/" },
    { name: "ProfiWetter · DWD", url: "https://profiwetter.ch/" },
    { name: "Open-Meteo", url: "https://open-meteo.com/" },
    { name: "OGS · NODC", url: "https://nodc.ogs.it/geoportal/?msv=1" },
    { name: "NIB · boja Vida", url: "https://www.nib.si/mbp/en/oceanographic-data-and-measurements/buoy-2/live-data-2" },
    { name: "Protezione Civile FVG", url: "https://monitor.protezionecivile.fvg.it/" },
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
  root.innerHTML =
    '<section class="footer-widget compact" aria-labelledby="footerVisitorsTitle"><h2 id="footerVisitorsTitle">👥 ' + t.visitors + '</h2><p class="visitor-total" id="footerVisitorTotal">2.885</p><p class="visitor-label">' + t.since + '</p></section>' +
    '<section class="footer-widget footer-request" aria-labelledby="footerRequestTitle"><h2 id="footerRequestTitle">💬 ' + t.request + '</h2><form id="footerRequestForm"><select id="footerRequestType"><option>' + t.modify + '</option><option>' + t.integrate + '</option><option>' + t.problem + '</option><option>' + t.other + '</option></select><textarea id="footerRequestText" required maxlength="1500" placeholder="' + t.placeholder + '"></textarea><button class="dona-btn" type="submit">' + t.send + '</button></form><p class="stato">' + t.note + '</p></section>' +
    '<section class="footer-widget support-widget" aria-labelledby="footerSupportTitle">' +
      '<div class="support-hero"><span class="support-kicker">' + t.supportKicker + '</span>' +
      '<span class="support-symbol" aria-hidden="true">🍺</span><h2 id="footerSupportTitle">' + t.supportTitle + '</h2>' +
      '<p>' + t.supportText + '</p><a class="dona-btn support-primary" href="#" id="footerSupportButton">' +
      '<span aria-hidden="true">♥</span><span>' + t.supportCta + '</span><span aria-hidden="true">→</span></a>' +
      '<span class="support-methods">' + t.supportMethods + '</span></div>' +
      '<div class="supporters"><div class="supporters-heading"><h3>' + t.supporters + '</h3>' +
      '<span class="supporter-total"><strong>' + supporters.length + '</strong> ' + t.supporterCount + '</span></div>' +
      '<div class="supporters-marquee" tabindex="0" aria-label="' + t.supporters + ': ' + supporters.join(', ') + '">' +
      '<div class="supporters-track"><div class="supporters-group">' + supporterNames + '</div>' +
      '<div class="supporters-group" aria-hidden="true">' + supporterNames + '</div></div></div></div>' +
      '<div class="sources"><div class="sources-heading"><h3>' + t.partners + '</h3><p>' + t.partnersText + '</p></div>' +
      '<div class="partner-grid">' + partnerCards + '</div>' +
      '<h4>' + t.dataSources + '</h4><div class="source-pills">' + sourcePills(dataSources) + '</div>' +
      '<h4>' + t.localSources + '</h4><div class="source-pills">' + sourcePills(localSources) + '</div></div>' +
    '</section>';

  fetch(proxy + "?views=1&ts=" + Date.now()).then(function (r) { return r.json(); }).then(function (v) {
    if (v && v.total != null) document.getElementById("footerVisitorTotal").textContent = Number(v.total).toLocaleString(sl ? "sl-SI" : "it-IT");
  }).catch(function () {});

  document.getElementById("footerRequestForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var type = document.getElementById("footerRequestType").value;
    var msg = document.getElementById("footerRequestText").value.trim();
    if (!msg) return;
    location.href = "mailto:bebroggi@gmail.com?subject=" + encodeURIComponent("[ventotrieste.info] " + type) + "&body=" + encodeURIComponent(msg);
  });
  document.getElementById("footerSupportButton").addEventListener("click", function (e) {
    e.preventDefault(); if (typeof window.apriBirra === "function") window.apriBirra(e);
  });
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
  var navLinks = nav ? Array.prototype.slice.call(nav.querySelectorAll('a:not(.topnav-birra)')) : [];
  function trovaLink(parola) {
    return navLinks.find(function (link) {
      return (link.getAttribute("href") || "").toLowerCase().indexOf(parola.toLowerCase()) !== -1;
    });
  }
  function metaLink(link) {
    var href = (link.getAttribute("href") || "").toLowerCase();
    if (href.indexOf("mappa") !== -1) return { icon: "🗺️", label: copy.map };
    if (href.indexOf("vento") !== -1) return { icon: "💨", label: copy.now };
    if (href.indexOf("centraline") !== -1) return { icon: "📡", label: copy.stations };
    if (href.indexOf("onde") !== -1) return { icon: "🌊", label: copy.waves };
    if (href.indexOf("boe") !== -1) return { icon: "🌊", label: copy.buoys };
    if (href.indexOf("previsioni") !== -1) return { icon: "📅", label: copy.forecast };
    if (href.indexOf("webcam") !== -1) return { icon: "📷", label: copy.webcams };
    return { icon: "•", label: (link.textContent || "").trim() };
  }

  var dock = null;
  if (nav && menuButton && navLinks.length) {
    var first = trovaLink("#vento") || navLinks[0];
    var second = trovaLink("#onde") || trovaLink("#centraline") || trovaLink("#boe");
    var third = trovaLink("#mappavento") || trovaLink("#previsioni");
    var fourth = third && (third.getAttribute("href") || "").toLowerCase().indexOf("mappa") !== -1
      ? trovaLink("#previsioni") : trovaLink("#webcam");
    var selected = [];
    [first, second, third, fourth].forEach(function (link) {
      if (link && selected.indexOf(link) === -1) selected.push(link);
    });
    navLinks.forEach(function (link) {
      if (selected.length < 4 && selected.indexOf(link) === -1) selected.push(link);
    });

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
    more.innerHTML = '<span class="ux-dock-icon" aria-hidden="true">☰</span>' +
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
