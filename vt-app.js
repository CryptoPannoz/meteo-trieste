/* vt-app.js — Vento Trieste (5 ott 2026): su tutte le pagine del sito (tranne /barcolana2026/, che
   ha i suoi) mette
   - la firma "Ideato e realizzato da Alberto Broggi", ben visibile prima del piè di pagina
     (Alberto: deve essere chiaro che il sito l'ha fatto lui);
   - "Copia URL" nella firma, accanto agli altri pulsanti (8 ott 2026);
   - "Installa l'app": pulsante nella firma e voce nel menu, che aprono una finestra con i passi per
     aggiungere Vento Trieste alla schermata Home di iPhone e Android (manifest in /manifest.webmanifest).
     Il telefono in uso va per primo ed è evidenziato; con Chrome, se il browser lo consente, c'è
     anche "Installa adesso". Aperto dall'icona (display-mode standalone) l'invito sparisce.
   Lingua: italiano, sloveno su <html lang="sl"> (Žusterna). Stili propri, nero e giallo del sito,
   uguali col tema chiaro e scuro. Conteggi su GoatCounter ("app: …") tramite eventi.js. */
(function () {
  "use strict";
  if (window.__vtApp) return;
  window.__vtApp = true;

  var sl = (document.documentElement.lang || "").indexOf("sl") === 0;
  var T = sl ? {
    da: "Zasnoval in izdelal", mestiere: "Podatki, podatkovne baze in avtomatizacija",
    copia: "Kopiraj URL", copiato: "URL kopiran", suggerimenti: "Predlogi in izboljšave", installa: "Namesti aplikacijo", menu: "📲 Namesti aplikacijo",
    titolo: "Vento Trieste na telefonu", chiudi: "Zapri",
    intro: "Dodaj stran na začetni zaslon: dobil boš ikono <strong>Vento Trieste</strong>, ki se odpre čez cel zaslon kot aplikacija, vedno s svežimi podatki. Brezplačno, nič ni treba prenašati iz trgovine.",
    ora: "Namesti zdaj", tuo: "tvoj telefon",
    ios: "iPhone in iPad", iosPassi: ["Odpri to stran v <strong>Safariju</strong>.",
      "Tapni gumb <strong>Deli</strong> {C} (na iOS 26 je v meniju <strong>•••</strong> spodaj).",
      "Pomakni se navzdol in izberi <strong>Dodaj na začetni zaslon</strong>. Če se prikaže možnost »Odpri kot spletno aplikacijo«, jo pusti vklopljeno.",
      "Tapni <strong>Dodaj</strong>."],
    iosChrome: "Deluje tudi v Chromu za iPhone: gumb Deli ob naslovni vrstici, nato »Dodaj na začetni zaslon«.",
    androidPassi: ["Odpri to stran v <strong>Chromu</strong>.", "Tapni meni <strong>⋮</strong> zgoraj desno.",
      "Izberi <strong>Namesti aplikacijo</strong> (na nekaterih telefonih: <strong>Dodaj na začetni zaslon</strong>).",
      "Potrdi z <strong>Namesti</strong>."],
    nota: "Ikona vedno odpre spletno stran: potrebuješ povezavo, podatki so vedno sveži."
  } : {
    da: "Ideato e realizzato da", mestiere: "Dati, database e automazione",
    copia: "Copia URL", copiato: "URL copiato", suggerimenti: "Suggerimenti e migliorie", installa: "Installa l'app", menu: "📲 Installa l'app",
    titolo: "Vento Trieste sul telefono", chiudi: "Chiudi",
    intro: "Aggiungi il sito alla schermata Home: avrai l'icona <strong>Vento Trieste</strong> e si aprirà a schermo intero, come un'app, sempre con i dati aggiornati. Gratis, niente da scaricare dagli store.",
    ora: "Installa adesso", tuo: "il tuo telefono",
    ios: "iPhone e iPad", iosPassi: ["Apri questa pagina con <strong>Safari</strong>.",
      "Tocca il tasto <strong>Condividi</strong> {C} (su iOS 26 è nel menu <strong>•••</strong> in basso).",
      "Scorri e scegli <strong>Aggiungi alla schermata Home</strong>. Se compare l'opzione «Apri come app web», lasciala attiva.",
      "Tocca <strong>Aggiungi</strong>."],
    iosChrome: "Funziona anche da Chrome per iPhone: tasto Condividi accanto all'indirizzo, poi «Aggiungi alla schermata Home».",
    androidPassi: ["Apri questa pagina con <strong>Chrome</strong>.", "Tocca il menu <strong>⋮</strong> in alto a destra.",
      "Scegli <strong>Installa app</strong> (su alcuni telefoni: <strong>Aggiungi a schermata Home</strong>).",
      "Conferma con <strong>Installa</strong>."],
    nota: "L'icona apre sempre il sito online: serve la connessione, e i dati sono quelli del momento."
  };

  function conta(nome) {
    if (window.vtConta) { window.vtConta(nome); return; }
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: nome, event: true }); } catch (e) {}
  }

  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var ua = navigator.userAgent || "";
  // Android per primo: l'iPad si riconosce da "Mac con schermo touch", che altrimenti prende anche altro
  var os = /Android/i.test(ua) ? "android" :
    (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) ? "ios" : null;

  var st = document.createElement("style");
  st.textContent =
    ".vt-autore{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.9rem 1.2rem;max-width:1160px;margin:1.2rem auto;padding:1rem 1.15rem;" +
      "background:#0b0f13;color:#eef2f5;border:1px solid #26313a;border-left:5px solid #f0f43c;border-radius:14px;box-sizing:border-box;font-family:inherit}" +
    ".vt-autore-chi{display:flex;align-items:center;gap:.85rem;min-width:0;text-align:left}" +
    ".vt-autore-chi img{width:52px;height:52px;border-radius:12px;flex:none}" +
    ".vt-autore-chi small{display:block;font-size:.68rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#f0f43c}" +
    ".vt-autore-chi strong{display:block;font-size:1.4rem;line-height:1.15;font-weight:800;color:#fff}" +
    ".vt-autore-chi span{display:block;font-size:.84rem;color:#b1bcc4}" +
    ".vt-autore-azioni{display:flex;flex-wrap:wrap;gap:.5rem}" +
    // "html .vt-autore …": devono battere ":root[data-theme=light] a/button" di footer-widgets.css
    "html .vt-autore .vt-autore-azioni a,html .vt-autore .vt-autore-azioni button{display:inline-flex;align-items:center;gap:.4rem;min-height:40px;margin:0;padding:.45rem .95rem;border-radius:10px;" +
      "border:1px solid #33414c;background:#151b21;color:#eef2f5;font:inherit;font-size:.88rem;font-weight:700;text-decoration:none;cursor:pointer;box-shadow:none}" +
    "html .vt-autore .vt-autore-azioni a:hover,html .vt-autore .vt-autore-azioni button:hover{border-color:#f0f43c;color:#fff;background:#1c242b}" +
    "html .vt-autore .vt-autore-azioni .vt-app-btn{background:#f0f43c;border-color:#f0f43c;color:#07090c}" +
    "html .vt-autore .vt-autore-azioni .vt-app-btn:hover{background:#fff;border-color:#fff;color:#07090c}" +
    ".vt-autore [hidden],.vt-app-dlg [hidden]{display:none!important}" +
    "@media (max-width:560px){.vt-autore{margin:1rem .75rem}.vt-autore-azioni{width:100%}.vt-autore-azioni>*{flex:1 1 auto;justify-content:center}}" +
    ".vt-app-dlg{width:min(620px,calc(100vw - 24px));max-height:min(86vh,760px);padding:0;border:1px solid #2a343d;border-top:4px solid #f0f43c;border-radius:14px;" +
      "background:#10151a;color:#e7edf1;box-shadow:0 24px 60px rgba(0,0,0,.5);overflow:hidden;font-family:inherit}" +
    ".vt-app-dlg[open]{display:flex;flex-direction:column}" +
    ".vt-app-dlg::backdrop{background:rgba(0,0,0,.6)}" +
    ".vt-app-testa{display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.75rem .9rem .75rem 1.1rem;border-bottom:1px solid #2a343d}" +
    ".vt-app-testa h3{margin:0;font-size:1.05rem;color:#fff}" +
    ".vt-app-x{flex:none;display:grid;place-items:center;width:40px;height:40px;margin:0;padding:0;border-radius:50%;border:1px solid #33414c;background:#151b21;color:#fff;font-size:1rem;cursor:pointer}" +
    ".vt-app-corpo{overflow-y:auto;padding:.9rem 1.1rem 1.1rem;font-size:.9rem;line-height:1.55;color:#c9d3da}" +
    ".vt-app-corpo strong{color:#fff}" +
    ".vt-app-intro{display:flex;align-items:center;gap:.85rem}" +
    ".vt-app-intro img{width:56px;height:56px;border-radius:12px;flex:none}.vt-app-intro p{margin:0}" +
    ".vt-app-ora{margin:.8rem 0 0}" +
    ".vt-app-ora button{min-height:42px;padding:.5rem 1rem;border:0;border-radius:10px;background:#f0f43c;color:#07090c;font:inherit;font-weight:800;cursor:pointer}" +
    ".vt-app-os{margin-top:.8rem;padding:.7rem .9rem .75rem;border:1px solid #2a343d;border-radius:10px}" +
    ".vt-app-os h4{display:flex;align-items:center;gap:.45rem;margin:0 0 .3rem;font-size:.74rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#f0f43c}" +
    ".vt-app-os ol{margin:0;padding-left:1.25rem}.vt-app-os li{margin:.25rem 0}" +
    ".vt-app-os p,.vt-app-nota{margin:.45rem 0 0;font-size:.78rem;color:#9aa7b1}" +
    ".vt-app-tuo{display:none;padding:.1rem .5rem;border-radius:999px;background:#f0f43c;color:#07090c;font-size:.62rem;letter-spacing:.06em}" +
    ".vt-app-os.tuo{border-color:#f0f43c}.vt-app-os.tuo .vt-app-tuo{display:inline-block}" +
    ".vt-share-ico{width:1.15em;height:1.15em;vertical-align:-.2em}" +
    "@media (max-width:560px){.vt-app-dlg{width:100vw;max-width:100vw;max-height:88vh;margin:auto 0 0;border-radius:16px 16px 0 0;border-left:0;border-right:0;border-bottom:0}}";
  document.head.appendChild(st);

  // ---- firma, prima del piè di pagina ----
  var card = document.createElement("section");
  card.className = "vt-autore";
  card.setAttribute("aria-label", T.da + " Alberto Broggi");
  card.innerHTML =
    '<div class="vt-autore-chi"><img src="/icon-192.png" alt="" width="52" height="52">' +
      "<div><small>" + T.da + "</small><strong>Alberto Broggi</strong><span>" + T.mestiere + "</span></div></div>" +
    '<div class="vt-autore-azioni">' +
      '<button type="button" class="vt-app-btn" data-vt-app' + (standalone ? " hidden" : "") + '><span aria-hidden="true">📲</span><span>' + T.installa + "</span></button>" +
      '<button type="button" data-vt-copia><span aria-hidden="true">🔗</span><span>' + T.copia + "</span></button>" +
      '<a href="mailto:bebroggi@gmail.com?subject=' + encodeURIComponent("[ventotrieste.info] " + T.suggerimenti) + '"><span aria-hidden="true">✉️</span><span>' + T.suggerimenti + "</span></a>" +
      '<a href="https://bebroggi.it" target="_blank" rel="noopener">bebroggi.it ↗</a></div>';
  var piede = document.querySelector("footer.site-footer, footer.page-footer, body > footer");
  if (piede && piede.parentNode) piede.parentNode.insertBefore(card, piede);
  else (document.querySelector("main") || document.body).appendChild(card);

  // ---- "Copia URL" (8 ott 2026): indirizzo pulito della pagina, senza ?utm_… e #sezione.
  // Serve anche aperto dall'icona, dove la barra degli indirizzi non c'è.
  var copia = card.querySelector("[data-vt-copia]"), copiaTimer = null;
  copia.addEventListener("click", function () {
    var url = location.origin + location.pathname;
    var icona = copia.firstElementChild, etichetta = copia.lastElementChild;
    function fatto() {
      icona.textContent = "✓"; etichetta.textContent = T.copiato;
      clearTimeout(copiaTimer);
      copiaTimer = setTimeout(function () { icona.textContent = "🔗"; etichetta.textContent = T.copia; }, 2200);
    }
    function aMano() {   // Clipboard API assente o negata: copia classica, se no mostro l'indirizzo
      var ta = document.createElement("textarea"), ok = false;
      ta.value = url; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      if (ok) fatto(); else try { window.prompt(T.copia, url); } catch (e) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(fatto, aMano);
    else aMano();
    conta("condividi: copia url");
  });

  if (standalone) return;

  // ---- voce nel menu in alto ----
  var menu = document.getElementById("topnav") || document.querySelector(".topbar .toplinks");
  if (menu && !menu.querySelector("[data-vt-app]")) {
    var voce = document.createElement("a");
    voce.href = "#";
    voce.setAttribute("data-vt-app", "");
    voce.className = "vt-app-voce";
    voce.textContent = T.menu;
    var birra = menu.querySelector(".topnav-birra");
    menu.insertBefore(voce, birra || null);
  }

  // ---- finestra con le istruzioni ----
  var CONDIVIDI = '<svg class="vt-share-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var passi = function (lista) { return "<ol>" + lista.map(function (p) { return "<li>" + p.replace("{C}", CONDIVIDI) + "</li>"; }).join("") + "</ol>"; };
  var sezIos = '<section class="vt-app-os' + (os === "ios" ? " tuo" : "") + '"><h4>' + T.ios + ' <span class="vt-app-tuo">' + T.tuo + "</span></h4>" + passi(T.iosPassi) + "<p>" + T.iosChrome + "</p></section>";
  var sezAndroid = '<section class="vt-app-os' + (os === "android" ? " tuo" : "") + '"><h4>Android <span class="vt-app-tuo">' + T.tuo + "</span></h4>" + passi(T.androidPassi) + "</section>";
  var dlg = document.createElement("dialog");
  dlg.className = "vt-app-dlg";
  dlg.setAttribute("aria-label", T.titolo);
  dlg.innerHTML =
    '<div class="vt-app-testa"><h3>' + T.titolo + '</h3><button type="button" class="vt-app-x" aria-label="' + T.chiudi + '" title="' + T.chiudi + '">✕</button></div>' +
    '<div class="vt-app-corpo"><div class="vt-app-intro"><img src="/icon-192.png" alt="" width="56" height="56"><p>' + T.intro + "</p></div>" +
      '<div class="vt-app-ora" hidden><button type="button">📲 ' + T.ora + "</button></div>" +
      (os === "android" ? sezAndroid + sezIos : sezIos + sezAndroid) +
      '<p class="vt-app-nota">' + T.nota + "</p></div>";
  document.body.appendChild(dlg);
  var chiudi = function () { if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open"); };
  dlg.querySelector(".vt-app-x").addEventListener("click", chiudi);
  dlg.addEventListener("click", function (e) { if (e.target === dlg) chiudi(); });   // tocco sullo sfondo

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-vt-app]") : null;
    if (!b) return;
    e.preventDefault();
    // il menu in alto si chiude (footer-widgets.js lo chiude al clic su un link)
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    conta("app: istruzioni" + (os ? " " + os : ""));
  });

  var richiesta = null, boxOra = dlg.querySelector(".vt-app-ora");
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); richiesta = e; boxOra.hidden = false; });
  boxOra.querySelector("button").addEventListener("click", function () {
    if (!richiesta) return;
    richiesta.prompt();
    richiesta.userChoice.then(function (c) { conta("app: installa " + (c && c.outcome)); }).catch(function () {});
    richiesta = null; boxOra.hidden = true;
  });
  window.addEventListener("appinstalled", function () { conta("app: installata"); });
})();
