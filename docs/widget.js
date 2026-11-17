/* Ahmed Wazir \u00b7 chat widget for the website and app.
   Until an endpoint is set it runs in preview mode: the button and panel show,
   nothing is sent or stored, and visitors are pointed to WhatsApp.
   Include with a script tag whose data-endpoint is the Worker URL. */
(() => {
  const S = document.currentScript, EP = (S && S.dataset.endpoint) || window.BOT_ENDPOINT || "";
  const LIVE = !!EP;
  const LANGS = [["en-AE", "English"], ["ar-AE", "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"], ["hi-IN", "\u0939\u093f\u0928\u094d\u0926\u0940"], ["ur-PK", "\u0627\u0631\u062f\u0648"]];
  const css = `.awb{--bg:#F4F1EE;--fg:#0B0B0C;--card:#FFFFFF;--line:#CFC7C0;--mute:#4A4643;--field:#FFFFFF;--dis:#E7E2DD}
html[data-theme="dark"] .awb{--bg:#121214;--fg:#F4F1EE;--card:#232327;--line:#3A393D;--mute:#C9C4BF;--field:#1B1B1E;--dis:#1B1B1E}
@media (prefers-color-scheme:dark){html:not([data-theme="light"]) .awb{--bg:#121214;--fg:#F4F1EE;--card:#232327;--line:#3A393D;--mute:#C9C4BF;--field:#1B1B1E;--dis:#1B1B1E}}
.awb-btn{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:60;background:#C8102E;color:#fff;border:2px solid #fff;border-radius:28px;padding:11px 18px;font:600 15px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer}
@media (max-width:620px){.awb-btn{padding:8px 14px;font-size:13px;border-width:1.5px}}
.awb{position:fixed;right:max(12px,env(safe-area-inset-right,0px));bottom:max(76px,calc(env(safe-area-inset-bottom,0px) + 76px));z-index:61;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 110px));background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;font:14.5px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.awb header{background:#0B0B0C;color:#FFFFFF;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}.awb header b{font-size:15px}.awb header small{display:block;color:#D9D4CF;font-size:11.5px}
.awb .ms{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}.awb .m{max-width:85%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.awb .m.u{align-self:flex-end;background:#C8102E;color:#fff}.awb .m.b{align-self:flex-start;background:var(--card);color:var(--fg);border:1px solid var(--line)}.awb .m.s{align-self:center;font-size:12.5px;color:var(--mute);text-align:center}
.awb form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line)}.awb input{flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;background:var(--field);color:var(--fg)}
.awb input::placeholder{color:var(--mute);opacity:1}.awb input:disabled{background:var(--dis);color:var(--mute)}
.awb button{border:0;border-radius:8px;padding:8px 12px;font:600 14px system-ui,sans-serif;cursor:pointer;background:#C8102E;color:#fff}.awb button.g{background:none;color:inherit;border:1px solid currentColor}
.awb .cs{padding:14px;font-size:13.5px}.awb .cs p{margin:0 0 10px}.awb .cs a{color:inherit;text-decoration:underline}.awb select{border:1px solid var(--line);border-radius:8px;padding:4px;font:inherit;font-size:12px;background:var(--field);color:var(--fg)}`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);
  const btn = document.createElement("button"); btn.className = "awb-btn"; btn.textContent = "Ask Ahmed's assistant"; document.body.append(btn);
  let box, msgs = [], sid = null, busy = false; try { sid = sessionStorage.getItem("awb-sid"); } catch (e) {}
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function open() {
    if (box) { box.hidden = !box.hidden; return; }
    box = document.createElement("div"); box.className = "awb"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Chat with Ahmed's AI assistant");
    box.innerHTML = `<header><div><b>Ahmed's AI assistant</b><small>RERA BRN 85446 \u00b7 Springfield Properties \u00b7 ORN 11929</small></div><button class="g" data-x aria-label="Close">\u2715</button></header>
      <div class="cs"><p>You're chatting with an <b>AI assistant</b>, not Ahmed himself. Conversations are saved so Ahmed can follow up and to learn what buyers ask about most, as set out in the <a href="/privacy-policy/" target="_blank">privacy policy</a>. Project details are as published by developers and can change. Nothing here is financial advice.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button data-ok="details">Share my details</button><button class="g" data-ok="guest">Continue as guest</button></div></div>`;
    if (!LIVE) box.querySelector(".cs").outerHTML = `<div class="ms"><div class="m s"><b>Coming soon</b></div><div class="m b">I'll answer your questions about buying off-plan in Dubai (fees, Golden Visa, payment plans, escrow, buying from abroad) in English, \u0627\u0644\u0639\u0631\u0628\u064a\u0629, \u0939\u093f\u0928\u094d\u0926\u0940 or \u0627\u0631\u062f\u0648, by text or voice.\n\nUntil I'm switched on, message Ahmed directly on WhatsApp: +971 58 603 2580</div></div><form onsubmit="return false"><input placeholder="Coming soon" aria-label="Chat is coming soon" disabled><a href="https://wa.me/971586032580?text=${encodeURIComponent("Hi Ahmed, I came from your website.")}" target="_blank" rel="noopener" style="background:#C8102E;color:#fff;border-radius:8px;padding:8px 12px;font:600 14px system-ui,sans-serif;text-decoration:none;white-space:nowrap">WhatsApp</a></form>`;
    document.body.append(box);
    box.querySelector("[data-x]").onclick = () => box.hidden = true;
    if (LIVE) box.querySelectorAll("[data-ok]").forEach(b => b.onclick = () => start(b.dataset.ok === "details"));
  }
  const MOB = /^\+?[0-9][0-9 ()-]{6,18}[0-9]$/, MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // In-chat contact form: sent to /contact; the backend then releases the pending file or meeting request
  function contactForm(ms, title, done) {
    const f = document.createElement("form"); f.className = "m b"; f.style.width = "100%";
    f.innerHTML = `<b>${esc(title)}</b><div style="display:grid;gap:6px;margin-top:8px"><input name="name" placeholder="Full name" autocomplete="name"><input name="mobile" placeholder="Mobile with country code" autocomplete="tel" inputmode="tel"><input name="email" type="email" placeholder="Email" autocomplete="email"><small data-err style="color:#C8102E"></small><button>Send</button></div>`;
    f.onsubmit = async e => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(f)), err = f.querySelector("[data-err]");
      if (String(v.name).trim().length < 2) return err.textContent = "Please enter your full name.";
      if (!MOB.test(String(v.mobile).trim())) return err.textContent = "Please enter a mobile number with country code.";
      if (!MAIL.test(String(v.email).trim())) return err.textContent = "Please enter a valid email.";
      try {
        const r = await fetch(EP + "/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...v, consent: true, session_id: sid }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error);
        sid = j.session_id; try { sessionStorage.setItem("awb-sid", sid); } catch (x) {}
        f.outerHTML = `<div class="m b">${esc(j.message)}</div>`; ms.scrollTop = 1e9; if (done) done(j);
      } catch (x) { err.textContent = "Couldn't send. Please try again or WhatsApp +971 58 603 2580."; }
    };
    ms.append(f); ms.scrollTop = 1e9; f.querySelector("input").focus();
  }
  function start(withDetails) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    box.querySelector(".cs").outerHTML = `<div class="ms" aria-live="polite"></div><form><input placeholder="English \u00b7 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u00b7 \u0939\u093f\u0928\u094d\u0926\u0940 \u00b7 \u0627\u0631\u062f\u0648" aria-label="Your message">${SR ? `<select aria-label="Voice language">${LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select><button type="button" class="g" data-mic aria-label="Speak">\ud83c\udfa4</button>` : ""}<button>Send</button></form>`;
    const ms = box.querySelector(".ms"), f = box.querySelector("form"), inp = f.querySelector("input");
    const add = (c, t) => { const d = document.createElement("div"); d.className = "m " + c; d.textContent = t; ms.append(d); ms.scrollTop = 1e9; return d; };
    add("s", "Ask about buying off-plan in Dubai, fees, visas, payment plans or projects. Write in any of four languages.");
    if (withDetails) contactForm(ms, "Your details", () => inp.focus());
    f.onsubmit = async e => {
      e.preventDefault(); const t = inp.value.trim(); if (!t || busy) return; inp.value = ""; busy = true;
      msgs.push({ role: "user", content: t }); add("u", t); const out = add("b", "\u2026");
      try {
        const r = await fetch(EP + "/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sid, consent: true, messages: msgs }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
        sid = j.session_id; try { sessionStorage.setItem("awb-sid", sid); } catch (e) {}
        out.textContent = j.reply; msgs.push({ role: "assistant", content: j.reply });
        if (j.form) contactForm(ms, j.form === "file" ? "Where should Ahmed send it?" : "Your details for the call", r2 => msgs.push({ role: "assistant", content: r2.message }));
      } catch (err) { out.textContent = "Sorry, I can't reply right now. Message Ahmed on WhatsApp: +971 58 603 2580"; msgs.pop(); }
      busy = false;
    };
    const mic = f.querySelector("[data-mic]");
    if (mic) {
      let rec = null;
      mic.onclick = () => {
        if (rec) { rec.stop(); return; }
        rec = new SR(); rec.lang = f.querySelector("select").value; rec.interimResults = true;
        rec.onresult = e => { inp.value = [...e.results].map(r => r[0].transcript).join(" "); };
        rec.onend = () => { rec = null; mic.textContent = "\ud83c\udfa4"; if (inp.value.trim()) f.requestSubmit(); };
        rec.onerror = () => { rec = null; mic.textContent = "\ud83c\udfa4"; };
        mic.textContent = "\u25a0"; rec.start();
      };
    }
    if (!withDetails) inp.focus();
  }
  btn.onclick = open;
})();
