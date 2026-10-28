/* admin.js — area riservata di Vento Trieste (26 ott 2026).
   La pagina non contiene dati né chiavi: dopo "Accedi con Google" il Worker
   ventotrieste-previsioni verifica che l'account sia quello autorizzato e risponde con una
   sessione di 12 ore. Dal 27 ott la sessione sta in localStorage, così resta anche chiudendo
   l'app della schermata Home (manifest con ambito /admin/, icona "VT Admin"); dentro l'app
   Google entra "a passaggio" (redirect), perché la sua finestrella non torna indietro.
   Due viste: Dashboard (visite, vento, servizi) e Impostazioni (bot, chiavi, Search Console).
   Le chiavi API si scrivono ma non si rileggono: il Worker le cifra e mostra solo
   "impostata, finisce con …1234". */
(function () {
  "use strict";

  // Client ID OAuth di Google Cloud (progetto "Vento Trieste", client "ventotrieste-admin",
  // origini https://ventotrieste.info e http://localhost:8777, modalità test): non è un segreto.
  const GOOGLE_CLIENT_ID = "57848470199-e86uchji59hd0n7t4ocho8kq2ssjic3g.apps.googleusercontent.com";
  const locale = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = locale ? "http://localhost:8787" : "https://ventotrieste-previsioni.bebroggi.workers.dev";
  const CHIAVE_SESSIONE = "vt-admin-sessione";
  const CHIAVE_PERIODO = "vt-admin-periodo";

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const data = iso => iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const n1 = v => v == null ? "–" : String(Math.round(v * 10) / 10).replace(".", ",");
  const intero = v => v == null ? "–" : Number(v).toLocaleString("it-IT");
  const giornoBreve = g => new Date(g + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

  // aperta dall'icona della schermata Home (app a schermo intero)
  const inApp = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  // l'icona VT Admin parte da /admin/?app=vt-admin (manifest): così si distingue dall'app Vento
  // Trieste, che su Android apre anche i link ad /admin (27 ott, Alberto: "non vedo l'icona")
  if (/[?&]app=vt-admin\b/.test(location.search)) {
    try { sessionStorage.setItem("vt-admin-app", "1"); } catch (e) { /* storage bloccato */ }
    history.replaceState(null, "", location.pathname + location.hash);
  }
  const android = /Android/i.test(navigator.userAgent);
  const appAdmin = (() => { try { return inApp && sessionStorage.getItem("vt-admin-app") === "1"; } catch (e) { return false; } })();
  // su Android, dentro un'altra app (Vento Trieste) o nel browser interno di Telegram & co. ("; wv)")
  // non si può installare niente: si offre di aprire la pagina in Chrome
  const dentroAltraApp = android && ((inApp && !appAdmin) || /; wv\)/.test(navigator.userAgent));

  function leggi(chiave) { try { return localStorage.getItem(chiave); } catch (e) { return null; } }
  function scrivi(chiave, v) { try { v == null ? localStorage.removeItem(chiave) : localStorage.setItem(chiave, v); } catch (e) { /* storage bloccato */ } }

  let sessione = leggi(CHIAVE_SESSIONE);
  let periodo = [7, 30, 90].includes(+leggi(CHIAVE_PERIODO)) ? +leggi(CHIAVE_PERIODO) : 30;
  let periodoBot = 7;
  let ultimoStato = null, ultimeVisite = null, ultimoBot = null;

  async function chiama(percorso, corpo) {
    const r = await fetch(API + percorso, {
      method: corpo ? "POST" : "GET",
      headers: Object.assign({ "Content-Type": "application/json" }, sessione ? { Authorization: "Bearer " + sessione } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && sessione) { sessione = null; scrivi(CHIAVE_SESSIONE, null); mostraAccesso("Sessione scaduta: rientra."); throw new Error("accesso richiesto"); }
    if (!r.ok) throw new Error(j.errore || "errore " + r.status);
    return j;
  }

  /* ---------------- accesso ---------------- */
  function mostraAccesso(errore) {
    $("vistaDashboard").hidden = $("vistaImpostazioni").hidden = true;
    $("accesso").hidden = false;
    $("btnEsci").hidden = $("btnAggiorna").hidden = $("viste").hidden = true;
    $("chi").textContent = "Area riservata";
    $("accessoErrore").hidden = !errore;
    $("accessoErrore").textContent = errore || "";
    $("btnSviluppo").hidden = !locale;
    if (!GOOGLE_CLIENT_ID) {
      $("accessoNota").hidden = false;
      $("accessoNota").textContent = "Il login con Google non è ancora configurato (manca il Client ID OAuth).";
      return;
    }
    const avvia = () => {
      // nell'app della schermata Home la finestrella di Google non torna alla pagina: Google
      // rimanda invece il token al Worker, che torna qui con un codice usa-e-getta (#codice=…)
      window.google.accounts.id.initialize(inApp
        ? { client_id: GOOGLE_CLIENT_ID, auto_select: false, ux_mode: "redirect", login_uri: API + "/admin/accesso-google" }
        : { client_id: GOOGLE_CLIENT_ID, callback: dopoGoogle, auto_select: false, ux_mode: "popup" });
      window.google.accounts.id.renderButton($("bottoneGoogle"), { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "it" });
    };
    if (window.google && window.google.accounts) { avvia(); return; }
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = avvia;
    document.head.appendChild(s);
  }
  async function dopoGoogle(risposta) {
    try {
      const j = await chiama("/admin/accesso", { credential: risposta.credential });
      sessione = j.token; scrivi(CHIAVE_SESSIONE, j.token);
      apri();
    } catch (err) {
      mostraAccesso("Accesso negato: " + err.message);
    }
  }
  // ritorno dall'accesso "a passaggio": #codice=… si scambia una volta sola con la sessione
  async function dopoPassaggio() {
    const m = /^#(codice|errore)=([^&]+)/.exec(location.hash);
    if (!m) return false;
    history.replaceState(null, "", location.pathname);
    if (m[1] === "errore") { mostraAccesso("Accesso negato: " + decodeURIComponent(m[2]).replace(/-/g, " ")); return true; }
    try {
      let j;
      try { j = await chiama("/admin/accesso-codice", { codice: m[2] }); }
      catch (e) { await new Promise(r => setTimeout(r, 1500)); j = await chiama("/admin/accesso-codice", { codice: m[2] }); }
      sessione = j.token; scrivi(CHIAVE_SESSIONE, j.token);
      apri();
    } catch (err) {
      mostraAccesso("Accesso non riuscito: " + err.message);
    }
    return true;
  }
  $("btnSviluppo").addEventListener("click", async () => {
    try {
      const j = await chiama("/admin/accesso-sviluppo", {});
      sessione = j.token; scrivi(CHIAVE_SESSIONE, j.token);
      apri();
    } catch (err) {
      mostraAccesso("Accesso di sviluppo non disponibile: " + err.message);
    }
  });
  $("btnEsci").addEventListener("click", () => {
    sessione = null; scrivi(CHIAVE_SESSIONE, null);
    if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect();
    mostraAccesso();
  });
  $("btnAggiorna").addEventListener("click", () => carica(true));

  /* ---------------- viste: Dashboard / Bot / Impostazioni (#bot, #impostazioni nell'indirizzo) ---------------- */
  const VISTE = { dashboard: "vistaDashboard", bot: "vistaBot", impostazioni: "vistaImpostazioni" };
  function vistaDaIndirizzo() { const v = location.hash.slice(1); return VISTE[v] && v !== "dashboard" ? v : "dashboard"; }
  function mostraVista(nome) {
    Object.keys(VISTE).forEach(v => { $(VISTE[v]).hidden = v !== nome; });
    document.querySelectorAll(".vista-tasto").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vista === nome)));
    // il riepilogo del bot si legge solo quando serve: sono parecchie letture del KV
    if (nome === "bot" && !ultimoBot) caricaBot();
  }
  document.querySelectorAll(".vista-tasto").forEach(b => b.addEventListener("click", () => {
    history.replaceState(null, "", b.dataset.vista === "dashboard" ? location.pathname : "#" + b.dataset.vista);
    mostraVista(b.dataset.vista);
  }));
  window.addEventListener("hashchange", () => { if (sessione) mostraVista(vistaDaIndirizzo()); });

  function apri() {
    $("accesso").hidden = true;
    $("btnEsci").hidden = $("btnAggiorna").hidden = $("viste").hidden = false;
    mostraVista(vistaDaIndirizzo());
    carica();
  }
  async function carica() {
    $("aggiornato").textContent = "Controllo i servizi…";
    $("btnAggiorna").disabled = true;
    await Promise.all([caricaStato(), caricaVisite(), ultimoBot || !$("vistaBot").hidden ? caricaBot() : null]);
    $("btnAggiorna").disabled = false;
  }
  async function caricaStato() {
    try {
      const s = await chiama("/admin/stato");
      ultimoStato = s;
      $("chi").textContent = s.email;
      disegnaStato(s);
      $("aggiornato").textContent = "Controllato alle " + new Date(s.quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      $("aggiornato").textContent = "Non riesco a leggere lo stato: " + err.message;
    }
  }
  async function caricaVisite() {
    $("grafico").setAttribute("aria-busy", "true");
    try {
      ultimeVisite = await chiama("/admin/visite?giorni=" + periodo);
    } catch (err) {
      ultimeVisite = { configurato: true, errore: err.message };
    }
    $("grafico").removeAttribute("aria-busy");
    disegnaVisite(ultimeVisite);
    if (ultimoStato) disegnaTessere(ultimoStato, ultimeVisite);
  }
  document.querySelectorAll("#periodiVisite .periodo").forEach(b => {
    b.setAttribute("aria-pressed", String(+b.dataset.giorni === periodo));
    b.addEventListener("click", () => {
      periodo = +b.dataset.giorni;
      scrivi(CHIAVE_PERIODO, String(periodo));
      document.querySelectorAll("#periodiVisite .periodo").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      caricaVisite();
    });
  });

  /* ---------------- tessere in cima ---------------- */
  function disegnaTessere(s, v) {
    const ok = s.servizi.filter(x => x.esito === "ok").length;
    const fresche = s.centraline.filter(x => x.esito === "ok").length;
    const t = [];
    if (v && v.configurato && !v.errore) {
      const delta = v.totalePrecedente ? Math.round((v.totale - v.totalePrecedente) / v.totalePrecedente * 100) : null;
      t.push({ etichetta: "Visitatori oggi", valore: intero(v.oggi), sotto: "giornata in corso" });
      t.push({ etichetta: "Visitatori, " + v.giorni + " giorni", valore: intero(v.totale),
        sotto: delta == null ? "" : (delta >= 0 ? "▲ +" : "▼ −") + Math.abs(delta) + "% sui " + v.giorni + " giorni prima" });
      // persone vere del giorno e versione della home (eventi giorno:… di eventi.js, dal 28 ott 2026)
      const o = v.persone && !v.persone.errore ? v.persone.oggi : null;
      if (o) {
        t.push({ etichetta: "Persone oggi", valore: intero(o.persone),
          sotto: intero(o.sessioni) + " sessioni · " + n1(o.persone ? o.sessioni / o.persone : 0) + " a testa" });
        t.push({ etichetta: "Lite oggi", valore: intero(o.lite),
          sotto: "Pro " + intero(o.pro) + (o.lite + o.pro ? " · " + Math.round(o.lite / (o.lite + o.pro) * 100) + "% in Lite" : "") });
      }
    }
    if (s.surfabili30) t.push({ etichetta: "Giornate surfabili", valore: s.surfabili30.surfabili, sotto: "negli ultimi " + s.surfabili30.giorni + " giorni del registro" });
    t.push({ etichetta: "Servizi che funzionano", valore: ok + " su " + s.servizi.length, sotto: ok === s.servizi.length ? "tutto a posto" : "guarda sotto" });
    t.push({ etichetta: "Centraline fresche", valore: fresche + " su " + s.centraline.length, sotto: "soglie dei dati freschi" });
    if (s.telegram) t.push({ etichetta: "Bot Telegram", valore: s.telegram.chat ? "collegato" : "da collegare",
      sotto: s.telegram.messaggi ? intero(s.telegram.messaggi) + " messaggi ricevuti" + (s.telegram.ultimo ? " · ultimo " + data(s.telegram.ultimo) : "") : "nessun messaggio ancora" });
    $("tessere").innerHTML = t.map(x => '<div class="tessera"><span class="t-etichetta">' + esc(x.etichetta) + '</span><b class="t-valore">' + esc(x.valore) +
      '</b><span class="t-sotto">' + esc(x.sotto) + "</span></div>").join("");
  }

  /* ---------------- grafico dei visitatori al giorno ---------------- */
  const tip = $("tooltip");
  function mostraTip(e, testo, valore) {
    tip.innerHTML = "";
    const b = document.createElement("strong"); b.textContent = valore;
    const s = document.createElement("span"); s.textContent = testo;
    tip.appendChild(b); tip.appendChild(s);
    tip.hidden = false;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = x + "px";
    tip.style.top = Math.max(8, r.top + window.scrollY - tip.offsetHeight - 8) + "px";
  }
  function nascondiTip() { tip.hidden = true; }
  function scalaTonda(max) {
    if (max <= 5) return 5;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const passi = [1, 2, 2.5, 5, 10].map(x => x * p);
    return passi.find(x => x >= max) || 10 * p;
  }
  /* grafico a colonne giorno per giorno (visite, invitati attivi sul bot): punti [{ giorno, valore }],
     oggi = la barra parziale, nome = intestazione della tabella e parola del tooltip */
  function colonne(box, punti, oggi, descrizione, nome) {
    const max = scalaTonda(Math.max(1, ...punti.map(p => p.valore)));
    const parola = nome.toLowerCase();
    box.innerHTML =
      '<div class="grafico" role="img" aria-label="' + esc(descrizione) + '">' +
        '<div class="g-asse" aria-hidden="true"><span>' + intero(max) + "</span><span>" + intero(max / 2) + "</span><span>0</span></div>" +
        '<div class="g-area"><i class="g-linea" style="bottom:100%"></i><i class="g-linea" style="bottom:50%"></i>' +
          '<div class="g-colonne">' + punti.map(p =>
            '<span class="g-col" data-giorno="' + esc(p.giorno) + '" data-valore="' + p.valore + '"><i class="g-barra' + (p.giorno === oggi ? " oggi" : "") +
            '" style="height:' + (p.valore / max * 100).toFixed(1) + '%"></i></span>').join("") + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="g-date" aria-hidden="true"><span>' + esc(giornoBreve(punti[0] ? punti[0].giorno : oggi)) + "</span><span>" + esc(giornoBreve(oggi)) + " (oggi)</span></div>" +
      '<details class="g-tabella"><summary>Mostra i numeri</summary><div class="tabella-box"><table><thead><tr><th>Giorno</th><th>' + esc(nome) + "</th></tr></thead><tbody>" +
        punti.slice().reverse().map(p => "<tr><td>" + esc(giornoBreve(p.giorno)) + "</td><td>" + intero(p.valore) + "</td></tr>").join("") + "</tbody></table></div></details>";
    box.querySelectorAll(".g-col").forEach(c => {
      c.addEventListener("mouseenter", e => mostraTip(e, giornoBreve(c.dataset.giorno) + (c.dataset.giorno === oggi ? " (finora)" : ""), intero(+c.dataset.valore) + " " + parola));
      c.addEventListener("mouseleave", nascondiTip);
    });
  }
  function disegnaVisite(v) {
    const box = $("grafico");
    const liste = ["lPagine", "lEventi", "lProvenienze", "lCampagne", "lPaesi", "lSchermi", "lSistemi"];
    if (!v || !v.configurato) {
      box.innerHTML = '<p class="nota">Aggiungi il token API di GoatCounter in Impostazioni per vedere le visite.</p>';
      liste.forEach(id => { $(id).innerHTML = ""; });
      return;
    }
    if (v.errore) {
      box.innerHTML = '<p class="errore">' + esc(v.errore) + "</p>";
      return;
    }
    colonne(box, (v.perGiorno || []).map(g => ({ giorno: g.giorno, valore: g.visite })), v.al,
      "Visitatori al giorno dal " + v.dal + " al " + v.al + ", in tutto " + v.totale, "Visitatori");
    disegnaPersone(v.persone, v.al);

    const err = v.errori || {};
    classifica("lPagine", v.pagine, x => x.percorso, x => x.titolo);
    classifica("lEventi", v.eventi, x => x.nome);
    classifica("lProvenienze", v.provenienze, x => x.nome, null, null, err.toprefs);
    classifica("lCampagne", v.campagne, x => x.nome, null, null, err.campaigns);
    classifica("lPaesi", v.paesi, x => x.nome, null, null, err.locations);
    classifica("lSchermi", v.schermi, x => x.nome, null, null, err.sizes);
    const sb = (v.sistemi || []).slice(0, 5).concat((v.browser || []).slice(0, 5));
    classifica("lSistemi", sb.length ? sb : null, x => x.nome, null, (v.sistemi || []).slice(0, 5).length, err.systems || err.browsers);
  }
  /* Persone e sessioni (28 ott 2026, Alberto: "quante persone guardano il sito al giorno e quante
     sessioni fa ognuna"): medie del periodo, persone al giorno, quante sessioni fa ognuno, tabella */
  function disegnaPersone(p, oggi) {
    const box = $("persone");
    if (!p || p.errore) { box.innerHTML = '<p class="nota">Non disponibile' + (p && p.errore ? ": " + esc(p.errore) : "") + ".</p>"; return; }
    if (!p.giorniConDati) { box.innerHTML = '<p class="nota">Ancora niente: i primi numeri arrivano con le prime visite dopo la pubblicazione.</p>'; return; }
    const giorni = p.perGiorno.filter(g => g.giorno >= p.dal);
    box.innerHTML =
      '<div class="numeri">' +
        '<div class="numero"><b>' + intero(Math.round(p.personeAlGiorno)) + "</b><span>persone al giorno</span></div>" +
        '<div class="numero"><b>' + n1(p.sessioniPerPersona) + "</b><span>sessioni a testa</span></div>" +
        '<div class="numero"><b>' + intero(p.nuove) + "</b><span>persone nuove</span></div>" +
        '<div class="numero"><b>' + (p.lite + p.pro ? Math.round(p.lite / (p.lite + p.pro) * 100) + "%" : "–") + "</b><span>in Lite (" + intero(p.lite) + " su " + intero(p.lite + p.pro) + ")</span></div>" +
      "</div>" +
      '<div id="graficoPersone"></div>' +
      '<h4 class="sotto-titolo">Quante sessioni fa ognuno (persone, somma dei giorni)</h4><div id="lQuante"></div>' +
      '<details class="g-tabella"><summary>Giorno per giorno</summary><div class="tabella-box"><table><thead><tr>' +
        "<th>Giorno</th><th>Persone</th><th>Sessioni</th><th>A testa</th><th>Nuove</th><th>Lite</th><th>Pro</th></tr></thead><tbody>" +
        giorni.slice().reverse().map(g => "<tr><td>" + esc(giornoBreve(g.giorno)) + "</td><td>" + intero(g.persone) + "</td><td>" + intero(g.sessioni) +
          "</td><td>" + (g.persone ? n1(g.sessioni / g.persone) : "–") + "</td><td>" + intero(g.nuove) + "</td><td>" + intero(g.lite) + "</td><td>" + intero(g.pro) + "</td></tr>").join("") +
      "</tbody></table></div></details>";
    colonne($("graficoPersone"), giorni.map(g => ({ giorno: g.giorno, valore: g.persone })), oggi,
      "Persone al giorno dal " + p.dal + ", in media " + Math.round(p.personeAlGiorno), "Persone");
    classifica("lQuante", p.quante.map((x, i) => ({ nome: i + 1 === p.quante.length ? (i + 1) + " o più sessioni" : (i + 1) + (i ? " sessioni" : " sessione"), visite: x })), x => x.nome);
  }

  /* elenco ordinato: nome, numero, barretta proporzionale (un solo colore: è una grandezza) */
  function classifica(id, elenco, nome, sotto, divisore, errore) {
    const box = $(id);
    if (!elenco) { box.innerHTML = '<p class="nota">Non disponibile' + (errore ? ": " + esc(errore) : "") + ".</p>"; return; }
    elenco = elenco.filter(x => x.visite > 0);
    if (!elenco.length) { box.innerHTML = '<p class="nota">Ancora niente in questo periodo.</p>'; return; }
    const max = Math.max(1, ...elenco.map(x => x.visite));
    box.innerHTML = '<ol class="classifica">' + elenco.slice(0, 10).map((x, i) =>
      (divisore && i === divisore ? '<li class="c-divisore" aria-hidden="true"></li>' : "") +
      '<li><span class="c-nome" title="' + esc(nome(x)) + '">' + esc(nome(x)) +
        (sotto && sotto(x) ? '<small>' + esc(sotto(x)) + "</small>" : "") + "</span>" +
      '<span class="c-valore">' + intero(x.visite) + "</span>" +
      '<i class="c-barra" style="width:' + (x.visite / max * 100).toFixed(1) + '%"></i></li>').join("") + "</ol>";
  }

  /* ---------------- stato: vento e servizi ---------------- */
  const NOME_ESITO = { ok: "funziona", attenzione: "da guardare", errore: "non funziona", spento: "spento" };
  function righe(elenco) {
    return elenco.map(x => '<li><span class="pallino e-' + esc(x.esito) + '" aria-hidden="true"></span>' +
      '<span class="nome">' + esc(x.nome) + '</span><span class="det">' + esc(x.dettaglio) + "</span></li>").join("");
  }
  function disegnaStato(s) {
    $("servizi").innerHTML = righe(s.servizi.map(x => Object.assign({}, x, { dettaglio: x.dettaglio + " · " + NOME_ESITO[x.esito] })));
    $("centraline").innerHTML = s.centraline.length ? righe(s.centraline) : "<li>Pacchetto dati non disponibile</li>";
    $("registro").innerHTML = "<thead><tr><th>Giorno</th><th>Media</th><th>Ore &gt; 12 kt</th><th>Raffica</th><th>Spinta</th><th></th></tr></thead><tbody>" +
      s.registro.map(g => "<tr><td>" + esc(g.giorno.slice(8) + "/" + g.giorno.slice(5, 7)) + "</td><td>" + n1(g.media) + " kt</td><td>" + n1(g.oreSopra12) +
        "</td><td>" + n1(g.raffica) + " kt</td><td>" + n1(g.spinta) + "</td><td>" + (g.surfabile ? '<span class="surf">surfabile</span>' : "") + "</td></tr>").join("") + "</tbody>";
    disegnaTessere(s, ultimeVisite);
    disegnaSicurezza(s);
    disegnaTelegram(s);
    disegnaChiavi(s.chiavi);
    disegnaImpostazioni(s.impostazioni);
  }

  /* ---------------- sicurezza: pausa, uso di Claude, sessioni, registro ---------------- */
  function disegnaSicurezza(s) {
    const t = s.telegram || {}, uso = t.uso || {};
    const azioni = (s.azioni || []).map(a => "<li><span class=\"nome\">" + esc(a.cosa) + (a.dettaglio ? ' <small class="nota">' + esc(a.dettaglio) + "</small>" : "") +
      '</span><span class="det">' + esc(data(a.quando)) + " · " + esc(a.chi) + "</span></li>").join("");
    $("sicurezza").innerHTML =
      '<ul class="righe">' +
        '<li><span class="pallino ' + (t.pausa ? "e-attenzione" : "e-ok") + '" aria-hidden="true"></span><span class="nome">Bot ' + (t.pausa ? "in pausa" : "acceso") +
          '</span><span class="det">' + (t.pausa ? "non risponde e salta il messaggio della sera" : "risponde e manda il messaggio delle 19:30") + "</span></li>" +
        '<li><span class="pallino e-ok" aria-hidden="true"></span><span class="nome">Ragionamenti di Claude</span><span class="det">oggi ' + intero(uso.oggi || 0) + " su " + intero(uso.limiteGiorno) +
          " · mese " + intero(uso.mese || 0) + " su " + intero(uso.limiteMese) + "</span></li>" +
      "</ul>" +
      '<p class="nota">Il bot risponde solo alla chat abbinata e solo su vento, mare e previsioni; esce dai gruppi in cui lo aggiungono; ' +
      "al massimo 8 messaggi al minuto, 150 al giorno, 30 immagini al giorno. Le regole del manuale si cambiano solo dalla tua chat, con conferma, e quelle tolte restano nel cestino.</p>" +
      '<div class="azioni"><button type="button" class="' + (t.pausa ? "primario" : "secondario") + '" id="btnPausa">' + (t.pausa ? "Riaccendi il bot" : "Metti in pausa il bot") + "</button>" +
      '<button type="button" class="secondario pericolo" id="btnEsciOvunque">Esci da tutti i dispositivi</button></div>' +
      '<h3 class="sotto-titolo">Registro delle azioni</h3>' +
      (azioni ? '<ul class="righe registro-azioni">' + azioni + "</ul>" : '<p class="nota">Ancora niente.</p>');
    $("btnPausa").addEventListener("click", async () => {
      try { await chiama("/admin/pausa", { pausa: !t.pausa }); await caricaStato(); } catch (err) { alert("Non riuscito: " + err.message); }
    });
    $("btnEsciOvunque").addEventListener("click", async () => {
      if (!window.confirm("Chiudo tutte le sessioni di /admin aperte, anche questa. Dovrai rientrare con Google. Procedo?")) return;
      try { await chiama("/admin/esci-ovunque", {}); } catch (err) { /* la sessione è già chiusa */ }
      sessione = null; scrivi(CHIAVE_SESSIONE, null); mostraAccesso("Sei uscito da tutti i dispositivi.");
    });
  }

  /* ---------------- chiavi ---------------- */
  const AIUTO = {
    anthropic: 'Si crea su <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>; metti anche un tetto di spesa mensile.',
    telegram: "Lo dà @BotFather quando crei il bot (/newbot).",
    goatcounter: 'Su GoatCounter: Settings › API (<a href="https://ventotrieste.goatcounter.com/user/api" target="_blank" rel="noopener">/user/api</a>), permesso "Read statistics".'
  };
  function disegnaChiavi(chiavi) {
    $("chiavi").innerHTML = Object.keys(chiavi).map(nome => {
      const c = chiavi[nome], p = c.prova;
      const statoTxt = c.impostata
        ? "Impostata il " + esc(data(c.quando)) + " · finisce con …" + esc(c.fine) +
          (p ? ' · <span class="' + (p.ok ? "ok" : "ko") + '">' + (p.ok ? "✓ " : "✗ ") + esc(p.testo) + "</span>" : "")
        : "Non impostata";
      return '<div class="voce" data-chiave="' + esc(nome) + '"><div><h3>' + esc(c.nome) + '</h3><p class="stato">' + statoTxt + '</p><p class="nota">' + (AIUTO[nome] || "") + "</p></div>" +
        '<div class="riga-campo"><label class="nascosto" for="k-' + esc(nome) + '">' + esc(c.nome) + "</label>" +
        '<input class="campo" id="k-' + esc(nome) + '" type="password" autocomplete="off" spellcheck="false" placeholder="' + (c.impostata ? "Incolla per sostituire" : "Incolla qui") + '">' +
        '<button type="button" class="primario" data-azione="salva">Salva</button></div>' +
        '<div class="azioni">' + (c.impostata ? '<button type="button" class="secondario" data-azione="prova">Prova</button><button type="button" class="secondario pericolo" data-azione="cancella">Togli</button>' : "") + "</div></div>";
    }).join("");
  }
  $("chiavi").addEventListener("click", async e => {
    const b = e.target.closest("button[data-azione]");
    if (!b) return;
    const voce = b.closest("[data-chiave]"), nome = voce.dataset.chiave, campo = voce.querySelector("input");
    b.disabled = true;
    try {
      if (b.dataset.azione === "salva") {
        if (!campo.value.trim()) throw new Error("campo vuoto");
        await chiama("/admin/chiave", { nome, valore: campo.value });
        campo.value = "";
        await chiama("/admin/chiave/prova", { nome }).catch(() => null);
      } else if (b.dataset.azione === "prova") {
        await chiama("/admin/chiave/prova", { nome });
      } else if (b.dataset.azione === "cancella") {
        if (!window.confirm("Togliere questa chiave?")) { b.disabled = false; return; }
        await chiama("/admin/chiave/cancella", { nome });
      }
      await carica();
    } catch (err) {
      campo.value = "";
      alert("Non riuscito: " + err.message);
      b.disabled = false;
    }
  });

  /* ---------------- Bot (28 ott 2026): previsioni mandate, persone, testi ----------------
     Alberto: "un recap di quello che viene fatto, un log delle previsioni mandate, i feedback, il
     comportamento degli utenti". Dati da /admin/bot (cruscotto.js nel Worker); Alberto non è tra
     le persone: le sue chiamate a Claude stanno nella tessera 🤖. */
  const VOTI = ["", "1/5⛏️⛏️", "2/5⛏️", "3/5⭐️", "4/5⭐️⭐️", "5/5⭐️⭐️⭐️"];
  const ICONA_TESTO = { domanda: "❓", commento: "✍️", nota: "📎", testo: "💬" };
  const USCITA = { surf: "🏄 surfabile", alba: "🌅 all'alba", niente: "– niente" };
  const quando = iso => iso ? new Date(iso).toLocaleString("it-IT", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
  const quota = (a, b) => b ? intero(a) + "/" + intero(b) : "–";
  const perche = e => /blocked/i.test(e || "") ? "ha bloccato il bot" : /deactivated/i.test(e || "") ? "account chiuso" : "non arrivata";
  let filtroPersona = null;

  async function caricaBot() {
    $("botAggiornato").textContent = "Leggo il bot…";
    try {
      ultimoBot = await chiama("/admin/bot?giorni=" + periodoBot);
      disegnaBot(ultimoBot);
      $("botAggiornato").textContent = "Ultimi " + ultimoBot.giorni + " giorni · letto alle " + new Date(ultimoBot.quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      $("botAggiornato").textContent = "Non riesco a leggere il bot: " + err.message;
    }
  }
  document.querySelectorAll("#periodiBot .periodo").forEach(b => b.addEventListener("click", () => {
    periodoBot = +b.dataset.giorni;
    document.querySelectorAll("#periodiBot .periodo").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    caricaBot();
  }));

  function disegnaBot(b) {
    const t = b.totali, c = t.claude || {};
    const tessere = [
      { e: "👥 Invitati", v: intero(t.invitati), s: t.attivi + " attivi nel periodo" + (t.nuovi ? " · " + t.nuovi + " nuovi" : "") },
      { e: "🔮 Previsioni", v: intero(t.previsioni), s: "📨 ricevute " + quota(t.consegne.mandati, t.consegne.totale) },
      { e: "🗳️ Voti per domani", v: intero(t.pronostici), s: t.consegne.mandati ? Math.round(t.pronostici / t.consegne.mandati * 100) + "% di chi l'ha ricevuta" : "sotto la previsione" },
      { e: "🙋 Giudizi", v: intero(t.giudizi), s: "com'era davvero (10:30)" },
      { e: "❓ Domande", v: intero(t.domande), s: "✍️ " + intero(t.commenti) + (t.commenti === 1 ? " commento" : " commenti") + " · 📎 " + intero(t.note) + (t.note === 1 ? " nota" : " note") },
      { e: "🤖 Claude oggi", v: intero(c.oggi) + "/" + intero(c.limiteGiorno), s: "mese " + intero(c.mese) + "/" + intero(c.limiteMese) }
    ];
    $("botTessere").innerHTML = tessere.map(x => '<div class="tessera"><span class="t-etichetta">' + esc(x.e) + '</span><b class="t-valore">' + esc(x.v) +
      '</b><span class="t-sotto">' + esc(x.s) + "</span></div>").join("");

    // una riga per previsione: cosa diceva, chi l'ha ricevuta, chi ha risposto, com'è andata
    const ko = l => l.length ? '<small class="ko">⚠️ ' + l.map(x => esc(x.nome) + " (" + perche(x.errore) + ")").join(", ") + "</small>" : "";
    $("botPrevisioni").innerHTML = b.previsioni.length
      ? "<thead><tr><th>Giorno</th><th>🔮 Previsione</th><th>📨 Ricevuta</th><th>🗳️ Voti</th><th>☀️ 10:30</th><th>🙋 Giudizi</th><th>✍️</th><th>📊 Com'è andata</th></tr></thead><tbody>" +
        b.previsioni.map(p => "<tr><td>" + esc(giornoBreve(p.giorno)) + "</td>" +
          '<td class="testo-lungo">' + (p.voto != null ? "<b>" + esc(VOTI[p.voto]) + "</b> " + esc(p.riga || "") + (p.testuale ? "<small>" + esc(p.testuale) + "</small>" : "")
            : '<span class="nota">solo regola di base: ' + esc(p.base || "–") + "</span>") + "</td>" +
          '<td class="testo-lungo">' + (p.consegna ? quota(p.consegna.mandati, p.consegna.totale) + ko(p.consegna.ko) : "–") + "</td>" +
          "<td>" + (p.pronostici.n ? p.pronostici.n + " · ⌀ " + n1(p.pronostici.media) + (p.pronostici.accordo != null ? " · 🤝 " + p.pronostici.accordo : "") : "–") + "</td>" +
          "<td>" + (p.mattina ? quota(p.mattina.mandati, p.mattina.totale) : "–") + "</td>" +
          "<td>" + (p.giudizi.n ? p.giudizi.n + (p.giudizi.media != null ? " · ⌀ " + n1(p.giudizi.media) : "") : "–") + "</td>" +
          "<td>" + (p.commenti || "–") + "</td>" +
          "<td>" + (p.esito ? esc(USCITA[p.esito.uscita] || p.esito.uscita) + (p.esito.media != null ? " · " + n1(p.esito.media) + " kt" : "") : p.giorno > b.al ? "domani" : "–") + "</td></tr>").join("") + "</tbody>"
      : '<tbody><tr><td class="nota">Nessuna previsione nel periodo.</td></tr></tbody>';

    // le persone invitate, dalla più attiva (Alberto no: le sue chat con Claude sono nella tessera)
    const persone = b.persone.filter(p => !p.admin);
    $("botPersone").innerHTML = persone.length
      ? "<thead><tr><th>Persona</th><th>📨 Ricevute</th><th>🗳️ Voti</th><th>🙋 Giudizi</th><th>❓ Domande</th><th>✍️ Scritti</th><th>⌨️ Comandi</th><th>📅 Giorni</th><th>🕒 Ultima volta</th></tr></thead><tbody>" +
        persone.map(p => {
          const k = p.tipi || {};
          return '<tr><td class="testo-lungo"><button type="button" class="persona" data-chat="' + esc(p.id) + '"' + (filtroPersona === p.id ? ' aria-pressed="true"' : "") + ">" + esc(p.nome) + "</button>" +
            "<small>" + [p.gruppo ? esc(p.gruppo) : null, p.dal ? "dal " + esc(giornoMese(p.dal)) : null, p.invitato ? null : "uscito"].filter(Boolean).join(" · ") + "</small></td>" +
            "<td>" + intero(p.ricevute) + (p.perse ? ' <span class="ko" title="' + esc(p.errore || "") + '">⚠️ ' + p.perse + "</span>" : "") + "</td>" +
            "<td>" + (p.pronostici || "–") + "</td><td>" + (p.giudizi || "–") + "</td><td>" + (k.domanda || "–") + "</td>" +
            "<td>" + ((k.commento || 0) + (k.testo || 0) + (k.nota || 0) || "–") + "</td><td>" + (k.comando || "–") + "</td>" +
            "<td>" + (p.giorni || "–") + "</td><td>" + esc(p.ultimo ? quando(p.ultimo) : "mai") + "</td></tr>";
        }).join("") + "</tbody>"
      : '<tbody><tr><td class="nota">Ancora nessun invitato.</td></tr></tbody>';
    $("botPersone").querySelectorAll(".persona").forEach(x => x.addEventListener("click", () => {
      filtroPersona = filtroPersona === +x.dataset.chat ? null : +x.dataset.chat;
      disegnaBot(b);
      if (filtroPersona) $("botTesti").scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    disegnaTesti(b);
    colonne($("botGrafico"), b.attivita.map(a => ({ giorno: a.giorno, valore: a.persone })), b.al,
      "Invitati che hanno usato il bot, giorno per giorno, dal " + b.dal + " al " + b.al, "Invitati attivi");
    $("botAzioni").innerHTML = b.azioni.length
      ? b.azioni.map(a => '<li><span class="nome">' + esc(a.cosa) + (a.dettaglio ? ' <small class="nota">' + esc(a.dettaglio) + "</small>" : "") +
          '</span><span class="det">' + esc(data(a.quando)) + "</span></li>").join("")
      : '<li><span class="nome nota">Niente nel periodo.</span></li>';
  }

  /* domande, commenti e note degli invitati, con la risposta del bot (ultimi 7 giorni) */
  function disegnaTesti(b) {
    const chi = filtroPersona ? b.persone.find(p => p.id === filtroPersona) : null;
    const testi = chi ? b.testi.filter(x => x.chat === chi.id) : b.testi;
    $("botTesti").innerHTML = (chi ? '<p class="nota">Solo <strong>' + esc(chi.nome) + '</strong> · <button type="button" class="persona" id="btnTuttiTesti">mostra tutti</button></p>' : "") +
      (testi.length
        ? '<ul class="righe testi">' + testi.map(x => '<li><span class="nome">' + (ICONA_TESTO[x.tipo] || "💬") + " " + esc(x.testo) +
            (x.risposta ? "<small>↳ " + esc(x.risposta) + "</small>" : "") + '</span><span class="det">' + esc(x.nome) + "<br>" + esc(quando(x.quando)) + "</span></li>").join("") + "</ul>"
        : '<p class="nota">Nessun messaggio scritto negli ultimi 7 giorni.</p>') +
      '<p class="nota">❓ domanda · ✍️ commento sulla previsione · 📎 nota a un voto · 💬 scritto prima del 28 ott sera</p>';
    const tutti = $("btnTuttiTesti");
    if (tutti) tutti.addEventListener("click", () => { filtroPersona = null; disegnaBot(b); });
  }

  /* ---------------- Telegram ---------------- */
  let ultimoLink = null;
  function disegnaTelegram(s) {
    const token = s.chiavi && s.chiavi.telegram && s.chiavi.telegram.impostata;
    const t = s.telegram || {}, chat = t.chat;
    const servizio = s.servizi.find(x => x.id === "telegram");
    let html = '<ul class="righe">' + righe([servizio || { esito: "spento", nome: "Bot", dettaglio: "" }]) + "</ul>";
    if (!token) {
      html += '<p class="nota">Crea il bot con @BotFather e incolla il token in "Chiavi API" qui sotto.</p>';
    } else {
      html += chat
        ? "<p>Chat autorizzata: <strong>" + esc(chat.nome) + "</strong> dal " + esc(data(chat.quando)) + ". Messaggi ricevuti: " + intero(t.messaggi || 0) +
          (t.foto ? " (" + intero(t.foto) + " con foto)" : "") + ".</p>"
        : '<p class="nota">Nessuna chat autorizzata: premi "Collega il bot", poi apri il link dal telefono e premi Avvia.</p>';
      if (ultimoLink) html += '<p>Apri dal telefono (valido 30 minuti):<br><a class="link-bot" href="' + esc(ultimoLink.link) + '" target="_blank" rel="noopener">' + esc(ultimoLink.link) + "</a></p>";
      if (chat) html += '<p class="nota">Ogni sera alle 19:30 il bot manda la verifica di oggi e la previsione per domani (la lettura di Claude e la regola di base); alle 10:30 chiede il giudizio su com\'era.</p>';
      html += '<div class="azioni"><button type="button" class="primario" id="btnCollega">' + (chat ? "Ricollega il bot" : "Collega il bot") + "</button>" +
        (chat ? '<button type="button" class="secondario" id="btnProvaSera">Manda ora un messaggio di prova</button>' +
          '<button type="button" class="secondario" id="btnProvaMattina">Manda ora la domanda del mattino</button>' +
          '<button type="button" class="secondario pericolo" id="btnScollega">Dimentica la chat</button>' : "") + "</div>";
      if (chat) html += htmlInvitati(t);
    }
    $("telegram").innerHTML = html;
    if (chat) collegaInvitati();
    const c = $("btnCollega"), sc = $("btnScollega"), ps = $("btnProvaSera"), pm = $("btnProvaMattina");
    if (pm) pm.addEventListener("click", async () => {
      pm.disabled = true;
      try { await chiama("/admin/mattina/prova", {}); alert("Mandata su Telegram: la domanda per il giudizio di oggi."); } catch (err) { alert("Non riuscito: " + err.message); }
      pm.disabled = false;
    });
    if (ps) ps.addEventListener("click", async () => {
      ps.disabled = true;
      try {
        const r = await chiama("/admin/serale/prova", {});
        alert("Mandato su Telegram: previsione per il " + r.domani + (r.foto && r.foto.length ? " (problemi con le immagini: " + r.foto.join("; ") + ")" : ""));
      } catch (err) { alert("Non riuscito: " + err.message); }
      ps.disabled = false;
    });
    if (c) c.addEventListener("click", async () => {
      c.disabled = true;
      try { ultimoLink = await chiama("/admin/telegram/collega", {}); await caricaStato(); }
      catch (err) { alert("Non riuscito: " + err.message); c.disabled = false; }
    });
    if (sc) sc.addEventListener("click", async () => {
      if (!window.confirm("Il bot smetterà di rispondere a questa chat finché non la ricolleghi. Procedo?")) return;
      try { await chiama("/admin/telegram/scollega", {}); await caricaStato(); } catch (err) { alert("Non riuscito: " + err.message); }
    });
  }

  /* ---------------- invitati che danno il giudizio (27 ott 2026) ----------------
     Ricevono la previsione delle 19:30 nel formato di Alberto e alle 10:30 la domanda con i
     bottoni (direzione, intensità, ⛏️/⭐️); non parlano con Claude. Link personale (7 giorni) o
     di gruppo, per un gruppo WhatsApp (28 ott: fino a 25 persone, 30 giorni). */
  let ultimoInvito = null;
  const giornoMese = iso => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  function htmlInvitati(t) {
    const giudici = t.giudici || [], inviti = t.inviti || [];
    let html = '<h3 class="sotto-titolo">Invitati che danno il giudizio</h3>' +
      '<p class="nota">Ricevono la previsione delle 19:30 (Previsione, Giudizio, Testuale) e toccano il loro pronostico per domani; alle 10:30 la domanda con i bottoni: direzione, intensità, ⛏️ o ⭐️. Possono scrivere qualche commento (3 per previsione, solo testo, senza link), che ti arriva subito. Non parlano con Claude e non vedono il manuale: sul bot, /benvenuto ti mostra cosa vedono.</p>';
    html += giudici.length
      ? '<ul class="righe">' + giudici.map(g => '<li><span class="pallino ' + (g.oggi ? "e-ok" : "e-spento") + '" aria-hidden="true"></span><span class="nome">' + esc(g.nome) +
          (g.gruppo ? ' <small class="nota">' + esc(g.gruppo) + "</small>" : "") + '</span><span class="det">dal ' + esc(giornoMese(g.quando)) + (g.oggi ? " · giudizio di oggi dato" : "") +
          ' <button type="button" class="secondario pericolo piccolo" data-togli-giudice="' + esc(g.id) + '" data-nome="' + esc(g.nome) + '">Togli</button></span></li>').join("") + "</ul>"
      : '<p class="nota">Ancora nessuno.</p>';
    if (inviti.length) html += '<ul class="righe">' + inviti.map(i => '<li><span class="pallino e-attenzione" aria-hidden="true"></span><span class="nome">' + esc(i.nome) +
      ' <small class="nota">' + (i.gruppo ? "link di gruppo · entrati " + esc(i.usi) + " su " + esc(i.max) : "invito in attesa") + '</small></span>' +
      '<span class="det">scade il ' + esc(giornoMese(i.scade)) + ' <button type="button" class="secondario piccolo" data-copia-invito="' + esc(i.gruppo ? (i.testo || i.link) : i.link) + '">' + (i.gruppo ? "Copia messaggio" : "Copia link") + "</button>" +
      ' <button type="button" class="secondario pericolo piccolo" data-annulla-invito="' + esc(i.codice) + '" data-nome="' + esc(i.nome) + '" data-gruppo="' + (i.gruppo ? "1" : "") + '">' + (i.gruppo ? "Chiudi" : "Annulla") + "</button></span></li>").join("") + "</ul>";
    if (ultimoInvito) html += '<p>' + (ultimoInvito.gruppo ? "Link del gruppo <strong>" + esc(ultimoInvito.nome) + "</strong> (fino a " + esc(ultimoInvito.max) + " persone, 30 giorni): manda il messaggio nel gruppo WhatsApp." : "Link per <strong>" + esc(ultimoInvito.nome) + "</strong> (una volta sola, 7 giorni):") +
      '<br><a class="link-bot" href="' + esc(ultimoInvito.link) + '" target="_blank" rel="noopener">' + esc(ultimoInvito.link) + "</a></p>" +
      '<div class="azioni"><button type="button" class="primario" id="btnCondividiInvito">' + (navigator.share ? "Manda il messaggio" : "Copia il messaggio") + "</button></div>";
    html += '<div class="riga-campo"><label class="nascosto" for="nomeInvito">Nome di chi inviti o del gruppo</label>' +
      '<input class="campo" id="nomeInvito" type="text" maxlength="40" autocomplete="off" placeholder="Nome di chi inviti, es. Marco">' +
      '<button type="button" class="primario" id="btnInvita">Crea invito</button></div>' +
      '<p class="nota"><label><input type="checkbox" id="invitoGruppo"> È per un gruppo WhatsApp: un link solo per più persone (fino a 25, 30 giorni), entra chi lo tocca</label></p>';
    return html;
  }
  // il testo lo scrive il Worker (inviti.js, testoInvito), uguale a quello di /invita sul bot
  function testoInvito(i) {
    return i.testo || ("Ciao " + i.nome + "! Ti invito nel bot di Vento Trieste a dare il tuo parere sul vento a Barcola.\n\nApri il link con Telegram e premi Avvia:\n" + i.link);
  }
  async function copia(testo) {
    try { await navigator.clipboard.writeText(testo); alert("Copiato."); } catch (e) { window.prompt("Copia da qui:", testo); }
  }
  function collegaInvitati() {
    const b = $("btnInvita"), campo = $("nomeInvito"), cond = $("btnCondividiInvito");
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { const r = await chiama("/admin/inviti/crea", { nome: campo.value, gruppo: $("invitoGruppo").checked }); ultimoInvito = r.invito; await caricaStato(); }
      catch (err) { alert("Non riuscito: " + err.message); b.disabled = false; }
    });
    campo.addEventListener("keydown", e => { if (e.key === "Enter") b.click(); });
    $("invitoGruppo").addEventListener("change", e => {
      campo.placeholder = e.target.checked ? "Nome del gruppo, es. Squadron" : "Nome di chi inviti, es. Marco";
      b.textContent = e.target.checked ? "Crea link di gruppo" : "Crea invito";
    });
    if (cond) cond.addEventListener("click", async () => {
      const testo = testoInvito(ultimoInvito);
      if (navigator.share) { try { await navigator.share({ text: testo }); } catch (e) { /* condivisione annullata */ } }
      else copia(testo);
    });
    $("telegram").querySelectorAll("[data-copia-invito]").forEach(x => x.addEventListener("click", () => copia(x.dataset.copiaInvito)));
    $("telegram").querySelectorAll("[data-annulla-invito]").forEach(x => x.addEventListener("click", async () => {
      if (!window.confirm((x.dataset.gruppo ? "Chiudo il link del gruppo " + x.dataset.nome + "? Chi è già dentro resta; nessun altro potrà entrare." : "Annullo l'invito a " + x.dataset.nome + "? Il link non varrà più."))) return;
      try { await chiama("/admin/inviti/annulla", { codice: x.dataset.annullaInvito }); ultimoInvito = null; await caricaStato(); } catch (err) { alert("Non riuscito: " + err.message); }
    }));
    $("telegram").querySelectorAll("[data-togli-giudice]").forEach(x => x.addEventListener("click", async () => {
      if (!window.confirm(x.dataset.nome + " non riceverà più previsioni e domande. I giudizi già dati restano. Procedo?")) return;
      try { await chiama("/admin/giudici/togli", { id: Number(x.dataset.togliGiudice) }); await caricaStato(); } catch (err) { alert("Non riuscito: " + err.message); }
    }));
  }

  /* ---------------- Search Console, GoatCounter ----------------
     Google Analytics no (26 ott 2026, Alberto): vorrebbe dire banner dei cookie e privacy da
     rifare; le visite le conta GoatCounter, che non usa cookie. */
  function disegnaImpostazioni(imp) {
    const voci = [
      { nome: "gsc", titolo: "Search Console · proprietà", segnaposto: "sc-domain:ventotrieste.info",
        nota: '<a href="https://search.google.com/search-console?resource_id=' + encodeURIComponent(imp.gsc || "sc-domain:ventotrieste.info") + '" target="_blank" rel="noopener">Apri Search Console</a>' },
      { nome: "goatcounterSito", titolo: "GoatCounter · nome del sito", segnaposto: "ventotrieste",
        nota: '<a href="https://' + esc(imp.goatcounterSito || "ventotrieste") + '.goatcounter.com" target="_blank" rel="noopener">Apri GoatCounter</a>' }
    ];
    $("impostazioni").innerHTML = voci.map(v =>
      '<div class="voce" data-imp="' + v.nome + '"><div><h3>' + esc(v.titolo) + '</h3><p class="nota">' + v.nota + "</p></div>" +
      '<div class="riga-campo"><label class="nascosto" for="i-' + v.nome + '">' + esc(v.titolo) + "</label>" +
      '<input class="campo" id="i-' + v.nome + '" type="text" autocomplete="off" spellcheck="false" placeholder="' + esc(v.segnaposto) + '" value="' + esc(imp[v.nome] || "") + '">' +
      '<button type="button" class="secondario" data-azione="salva-imp">Salva</button></div></div>').join("");
  }
  $("impostazioni").addEventListener("click", async e => {
    const b = e.target.closest("button[data-azione='salva-imp']");
    if (!b) return;
    const voce = b.closest("[data-imp]");
    b.disabled = true;
    try { await chiama("/admin/impostazione", { nome: voce.dataset.imp, valore: voce.querySelector("input").value }); await caricaStato(); }
    catch (err) { alert("Non riuscito: " + err.message); b.disabled = false; }
  });

  /* ---------------- app sulla schermata Home ---------------- */
  // Android: Chrome offre l'installazione (beforeinstallprompt); iPhone: passi da Condividi
  let richiestaInstalla = null;
  $("btnApp").hidden = inApp && !dentroAltraApp;
  $("altraApp").hidden = !dentroAltraApp;
  $("btnApriChrome").addEventListener("click", () => {
    location.href = "intent://ventotrieste.info/admin/#Intent;scheme=https;package=com.android.chrome;end";
  });
  $("btnCopiaIndirizzo").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText("https://ventotrieste.info/admin/"); $("btnCopiaIndirizzo").textContent = "Indirizzo copiato"; }
    catch (e) { $("btnCopiaIndirizzo").textContent = "ventotrieste.info/admin"; }
  });
  $("btnApp").addEventListener("click", () => {
    const primo = android ? $("passiAndroid") : $("passiIphone"), altro = android ? $("passiIphone") : $("passiAndroid");
    primo.classList.add("tuo"); altro.classList.remove("tuo");
    primo.parentNode.insertBefore(primo, altro);   // il telefono in uso per primo
    $("dlgApp").showModal();
  });
  $("btnChiudiApp").addEventListener("click", () => $("dlgApp").close());
  $("dlgApp").addEventListener("click", e => { if (e.target === $("dlgApp")) $("dlgApp").close(); });
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); richiestaInstalla = e; $("btnInstallaOra").hidden = false; });
  $("btnInstallaOra").addEventListener("click", async () => {
    if (!richiestaInstalla) return;
    richiestaInstalla.prompt();
    await richiestaInstalla.userChoice.catch(() => null);
    richiestaInstalla = null; $("btnInstallaOra").hidden = true; $("dlgApp").close();
  });
  window.addEventListener("appinstalled", () => { $("btnApp").hidden = true; });

  /* ---------------- via ---------------- */
  dopoPassaggio().then(fatto => { if (!fatto) { if (sessione) apri(); else mostraAccesso(); } });
})();
