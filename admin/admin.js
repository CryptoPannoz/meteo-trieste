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
  let ultimoStato = null, ultimeVisite = null;

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

  /* ---------------- viste: Dashboard / Impostazioni (#impostazioni nell'indirizzo) ---------------- */
  function vistaDaIndirizzo() { return location.hash === "#impostazioni" ? "impostazioni" : "dashboard"; }
  function mostraVista(nome) {
    $("vistaDashboard").hidden = nome !== "dashboard";
    $("vistaImpostazioni").hidden = nome !== "impostazioni";
    document.querySelectorAll(".vista-tasto").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vista === nome)));
  }
  document.querySelectorAll(".vista-tasto").forEach(b => b.addEventListener("click", () => {
    history.replaceState(null, "", b.dataset.vista === "impostazioni" ? "#impostazioni" : location.pathname);
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
    await Promise.all([caricaStato(), caricaVisite()]);
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
  document.querySelectorAll(".periodo").forEach(b => {
    b.setAttribute("aria-pressed", String(+b.dataset.giorni === periodo));
    b.addEventListener("click", () => {
      periodo = +b.dataset.giorni;
      scrivi(CHIAVE_PERIODO, String(periodo));
      document.querySelectorAll(".periodo").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
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
    const giorni = v.perGiorno || [];
    const max = scalaTonda(Math.max(1, ...giorni.map(g => g.visite)));
    const oggi = v.al;
    box.innerHTML =
      '<div class="grafico" role="img" aria-label="' + esc("Visitatori al giorno dal " + v.dal + " al " + v.al + ", in tutto " + v.totale) + '">' +
        '<div class="g-asse" aria-hidden="true"><span>' + intero(max) + "</span><span>" + intero(max / 2) + "</span><span>0</span></div>" +
        '<div class="g-area"><i class="g-linea" style="bottom:100%"></i><i class="g-linea" style="bottom:50%"></i>' +
          '<div class="g-colonne">' + giorni.map(g =>
            '<span class="g-col" data-giorno="' + esc(g.giorno) + '" data-visite="' + g.visite + '"><i class="g-barra' + (g.giorno === oggi ? " oggi" : "") +
            '" style="height:' + (g.visite / max * 100).toFixed(1) + '%"></i></span>').join("") + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="g-date" aria-hidden="true"><span>' + esc(giornoBreve(giorni[0] ? giorni[0].giorno : v.dal)) + "</span><span>" + esc(giornoBreve(oggi)) + " (oggi)</span></div>" +
      '<details class="g-tabella"><summary>Mostra i numeri</summary><div class="tabella-box"><table><thead><tr><th>Giorno</th><th>Visitatori</th></tr></thead><tbody>' +
        giorni.slice().reverse().map(g => "<tr><td>" + esc(giornoBreve(g.giorno)) + "</td><td>" + intero(g.visite) + "</td></tr>").join("") + "</tbody></table></div></details>";
    box.querySelectorAll(".g-col").forEach(c => {
      c.addEventListener("mouseenter", e => mostraTip(e, giornoBreve(c.dataset.giorno) + (c.dataset.giorno === oggi ? " (finora)" : ""), intero(+c.dataset.visite) + " visitatori"));
      c.addEventListener("mouseleave", nascondiTip);
    });

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
      if (chat) html += '<p class="nota">Ogni sera alle 19:30 il bot manda la verifica di oggi e la previsione per domani (regola di base, ancora senza Claude).</p>';
      html += '<div class="azioni"><button type="button" class="primario" id="btnCollega">' + (chat ? "Ricollega il bot" : "Collega il bot") + "</button>" +
        (chat ? '<button type="button" class="secondario" id="btnProvaSera">Manda ora un messaggio di prova</button>' +
          '<button type="button" class="secondario pericolo" id="btnScollega">Dimentica la chat</button>' : "") + "</div>";
    }
    $("telegram").innerHTML = html;
    const c = $("btnCollega"), sc = $("btnScollega"), ps = $("btnProvaSera");
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
