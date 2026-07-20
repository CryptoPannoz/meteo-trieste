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

(function () {
  var root = document.getElementById("footerWidgets");
  if (!root) return;
  var sl = root.dataset.lang === "sl";
  var proxy = "https://script.google.com/macros/s/AKfycbxev3jcFdaCa1MM8lAx56sMBWYCkoUprA7C3Q_uGyCxNEYEjgKF6P3BiDaadr4zvUTpPg/exec";
  var t = sl ? {
    visitors: "Obiskovalci", since: "obiskovalcev od začetka", request: "Predlagaj spremembo ali dopolnitev",
    placeholder: "Opiši želeno spremembo ali dopolnitev…", send: "📩 Pošlji predlog",
    note: "Odpre se že pripravljeno sporočilo v tvojem e-poštnem programu.", beer: "Plačaj mi pivo",
    beerText: "Projekt je brezplačen: če ti je uporaben, mi lahko plačaš pivo.", supporters: "Projekt so podprli", modify: "Sprememba / izboljšava",
    integrate: "Dopolnitev (vir, kamera, spot)", problem: "Prijava težave", other: "Drugo"
  } : {
    visitors: "Visitatori", since: "visitatori dall’inizio", request: "Richiedi una modifica o integrazione",
    placeholder: "Descrivi la modifica o l’integrazione che vorresti…", send: "📩 Invia richiesta",
    note: "La richiesta si apre nella tua app di posta, già compilata: basta premere invia.", beer: "Offrimi una birra",
    beerText: "Il progetto è gratuito: se ti è utile, puoi offrirmi una birra.", supporters: "Hanno contribuito al progetto", modify: "Modifica / miglioria",
    integrate: "Integrazione (fonte, webcam, spot)", problem: "Segnalazione problema", other: "Altro"
  };
  var supporters = ["Adriano Pek", "Alessandro Crismani", "Dario Stepcich", "Adriano Condello", "Zetko Ales", "Giuseppe Cacciatore", "Giuseppe Miele", "Andrea Valente", "Simone Fratti", "Luca Dreos", "sistiana89", "SurfTrieste.Shop"];
  var supporterNames = supporters.map(function (name) { return '<span class="supporter-name">' + name + '</span>'; }).join("");
  root.innerHTML =
    '<section class="footer-widget compact" aria-labelledby="footerVisitorsTitle"><h2 id="footerVisitorsTitle">👥 ' + t.visitors + '</h2><p class="visitor-total" id="footerVisitorTotal">2.885</p><p class="visitor-label">' + t.since + '</p></section>' +
    '<section class="footer-widget footer-request" aria-labelledby="footerRequestTitle"><h2 id="footerRequestTitle">💬 ' + t.request + '</h2><form id="footerRequestForm"><select id="footerRequestType"><option>' + t.modify + '</option><option>' + t.integrate + '</option><option>' + t.problem + '</option><option>' + t.other + '</option></select><textarea id="footerRequestText" required maxlength="1500" placeholder="' + t.placeholder + '"></textarea><button class="dona-btn" type="submit">' + t.send + '</button></form><p class="stato">' + t.note + '</p></section>' +
    '<section class="footer-widget beer-widget" aria-labelledby="footerBeerTitle"><div class="beer-bounce" aria-hidden="true">🍺</div><h2 id="footerBeerTitle">' + t.beer + '</h2><p>' + t.beerText + '</p><a class="dona-btn" href="#" id="footerBeerButton">🍺 ' + t.beer + '</a><div class="supporters"><h3>' + t.supporters + '</h3><div class="supporters-marquee" tabindex="0" aria-label="' + t.supporters + ': ' + supporters.join(', ') + '"><div class="supporters-track"><div class="supporters-group">' + supporterNames + '</div><div class="supporters-group" aria-hidden="true">' + supporterNames + '</div></div></div></div></section>';

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
  document.getElementById("footerBeerButton").addEventListener("click", function (e) {
    e.preventDefault(); if (typeof window.apriBirra === "function") window.apriBirra(e);
  });
})();
