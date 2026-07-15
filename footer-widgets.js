(function () {
  var root = document.getElementById("footerWidgets");
  if (!root) return;
  var sl = root.dataset.lang === "sl";
  var proxy = "https://script.google.com/macros/s/AKfycbxev3jcFdaCa1MM8lAx56sMBWYCkoUprA7C3Q_uGyCxNEYEjgKF6P3BiDaadr4zvUTpPg/exec";
  var t = sl ? {
    visitors: "Obiskovalci", since: "obiskovalcev od začetka", changes: "Zadnje spremembe",
    more: "pokaži več ▾", less: "pokaži manj ▴", request: "Predlagaj spremembo ali dopolnitev",
    placeholder: "Opiši želeno spremembo ali dopolnitev…", send: "📩 Pošlji predlog",
    note: "Odpre se že pripravljeno sporočilo v tvojem e-poštnem programu.", beer: "Plačaj mi pivo",
    beerText: "Projekt je brezplačen: če ti je uporaben, mi lahko plačaš pivo.", modify: "Sprememba / izboljšava",
    integrate: "Dopolnitev (vir, kamera, spot)", problem: "Prijava težave", other: "Drugo"
  } : {
    visitors: "Visitatori", since: "visitatori dall’inizio", changes: "Ultime modifiche",
    more: "mostra altre ▾", less: "mostra meno ▴", request: "Richiedi una modifica o integrazione",
    placeholder: "Descrivi la modifica o l’integrazione che vorresti…", send: "📩 Invia richiesta",
    note: "La richiesta si apre nella tua app di posta, già compilata: basta premere invia.", beer: "Offrimi una birra",
    beerText: "Il progetto è gratuito: se ti è utile, puoi offrirmi una birra.", modify: "Modifica / miglioria",
    integrate: "Integrazione (fonte, webcam, spot)", problem: "Segnalazione problema", other: "Altro"
  };
  root.innerHTML =
    '<section class="footer-widget compact" aria-labelledby="footerVisitorsTitle"><h2 id="footerVisitorsTitle">👥 ' + t.visitors + '</h2><p class="visitor-total" id="footerVisitorTotal">2.885</p><p class="visitor-label">' + t.since + '</p></section>' +
    '<section class="footer-widget compact" aria-labelledby="footerChangesTitle"><h2 id="footerChangesTitle">🛠️ ' + t.changes + '</h2><ul class="footer-changelog" id="footerChanges"></ul><button class="footer-more" id="footerMore" type="button" hidden>' + t.more + '</button></section>' +
    '<section class="footer-widget footer-request" aria-labelledby="footerRequestTitle"><h2 id="footerRequestTitle">💬 ' + t.request + '</h2><form id="footerRequestForm"><select id="footerRequestType"><option>' + t.modify + '</option><option>' + t.integrate + '</option><option>' + t.problem + '</option><option>' + t.other + '</option></select><textarea id="footerRequestText" required maxlength="1500" placeholder="' + t.placeholder + '"></textarea><button class="dona-btn" type="submit">' + t.send + '</button></form><p class="stato">' + t.note + '</p></section>' +
    '<section class="footer-widget beer-widget" aria-labelledby="footerBeerTitle"><div class="beer-bounce" aria-hidden="true">🍺</div><h2 id="footerBeerTitle">' + t.beer + '</h2><p>' + t.beerText + '</p><a class="dona-btn" href="#" id="footerBeerButton">🍺 ' + t.beer + '</a></section>';

  fetch(proxy + "?views=1&ts=" + Date.now()).then(function (r) { return r.json(); }).then(function (v) {
    if (v && v.total != null) document.getElementById("footerVisitorTotal").textContent = Number(v.total).toLocaleString(sl ? "sl-SI" : "it-IT");
  }).catch(function () {});

  fetch("https://api.github.com/repos/CryptoPannoz/meteo-trieste/commits?per_page=8").then(function (r) { return r.json(); }).then(function (items) {
    if (!Array.isArray(items)) return;
    var list = document.getElementById("footerChanges");
    list.innerHTML = items.filter(function (c) { return c && c.commit && c.commit.message && !/^merge/i.test(c.commit.message); }).slice(0, 8).map(function (c, i) {
      var d = new Date(c.commit.author.date).toLocaleDateString(sl ? "sl-SI" : "it-IT", { day: "2-digit", month: "short" });
      var msg = c.commit.message.split("\n")[0].replace(/[&<>"']/g, function (x) { return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[x]; });
      return '<li' + (i >= 2 ? ' class="extra"' : '') + '><time>' + d + '</time><span>' + msg + '</span></li>';
    }).join("");
    var more = document.getElementById("footerMore");
    if (list.querySelector(".extra")) more.hidden = false;
  }).catch(function () {});
  document.getElementById("footerMore").addEventListener("click", function () {
    var list = document.getElementById("footerChanges"), open = list.classList.toggle("open");
    this.textContent = open ? t.less : t.more;
  });
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
