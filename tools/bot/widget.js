/* Ahmed Wazir · chat widget for the website and app.
   Dormant until BOT_ENDPOINT is set: with no endpoint nothing is shown.
   Include with: <script src="/assets/js/widget.js" data-endpoint="https://ahmed-assistant.<you>.workers.dev" defer></script> */
(() => {
  const S = document.currentScript, EP = (S && S.dataset.endpoint) || window.BOT_ENDPOINT || "";
  if (!EP) return;
  const LANGS = [["en-AE", "English"], ["ar-AE", "العربية"], ["hi-IN", "हिन्दी"], ["ur-PK", "اردو"]];
  const css = `.awb-btn{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:60;background:#D7192A;color:#fff;border:0;border-radius:28px;padding:12px 18px;font:600 15px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}
.awb{position:fixed;right:max(12px,env(safe-area-inset-right,0px));bottom:max(76px,calc(env(safe-area-inset-bottom,0px) + 76px));z-index:61;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 110px));background:#F4F1EE;color:#0B0B0C;border:1px solid #DDD6D0;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;font:14.5px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25)}
@media (prefers-color-scheme:dark){.awb{background:#121214;color:#F4F1EE;border-color:#2C2B2E}.awb .m.b{background:#1E1E22;border-color:#2C2B2E}.awb input,.awb select{background:#1E1E22;color:#F4F1EE;border-color:#2C2B2E}}
.awb header{background:#0B0B0C;color:#F4F1EE;padding:10px 14px;display:flex;justify-content:space-between;align-items:center}.awb header b{font-size:15px}.awb header small{display:block;opacity:.7;font-size:11.5px}
.awb .ms{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}.awb .m{max-width:85%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.awb .m.u{align-self:flex-end;background:#D7192A;color:#fff}.awb .m.b{align-self:flex-start;background:#fff;border:1px solid #DDD6D0}.awb .m.s{align-self:center;font-size:12px;opacity:.75;text-align:center}
.awb form{display:flex;gap:6px;padding:10px;border-top:1px solid #DDD6D0}.awb input{flex:1;min-width:0;border:1px solid #DDD6D0;border-radius:8px;padding:8px 10px;font:inherit}
.awb button{border:0;border-radius:8px;padding:8px 12px;font:600 14px system-ui,sans-serif;cursor:pointer;background:#D7192A;color:#fff}.awb button.g{background:none;color:inherit;border:1px solid #DDD6D0}
.awb .cs{padding:14px;font-size:13.5px}.awb .cs p{margin:0 0 10px}.awb select{border:1px solid #DDD6D0;border-radius:8px;padding:4px;font:inherit;font-size:12px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);
  const btn = document.createElement("button"); btn.className = "awb-btn"; btn.textContent = "Ask Ahmed's assistant"; document.body.append(btn);
  let box, msgs = [], sid = null, busy = false; try { sid = sessionStorage.getItem("awb-sid"); } catch (e) {}
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function open() {
    if (box) { box.hidden = !box.hidden; return; }
    box = document.createElement("div"); box.className = "awb"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Chat with Ahmed's AI assistant");
    box.innerHTML = `<header><div><b>Ahmed's AI assistant</b><small>RERA BRN 85446 · Springfield Properties · ORN 11929</small></div><button class="g" data-x aria-label="Close">✕</button></header>
      <div class="cs"><p>You're chatting with an <b>AI assistant</b>, not Ahmed himself. Your messages are saved so Ahmed can follow up, as set out in the <a href="/privacy-policy/" target="_blank">privacy policy</a>. Project details are as published by developers and can change. Nothing here is financial advice.</p><button data-ok>I agree, start</button></div>`;
    document.body.append(box);
    box.querySelector("[data-x]").onclick = () => box.hidden = true;
    box.querySelector("[data-ok]").onclick = start;
  }
  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    box.querySelector(".cs").outerHTML = `<div class="ms" aria-live="polite"></div><form><input placeholder="English · العربية · हिन्दी · اردو" aria-label="Your message">${SR ? `<select aria-label="Voice language">${LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select><button type="button" class="g" data-mic aria-label="Speak">🎤</button>` : ""}<button>Send</button></form>`;
    const ms = box.querySelector(".ms"), f = box.querySelector("form"), inp = f.querySelector("input");
    const add = (c, t) => { const d = document.createElement("div"); d.className = "m " + c; d.textContent = t; ms.append(d); ms.scrollTop = 1e9; return d; };
    add("s", "Ask about buying off-plan in Dubai, fees, visas, payment plans or projects. Write in any of four languages.");
    f.onsubmit = async e => {
      e.preventDefault(); const t = inp.value.trim(); if (!t || busy) return; inp.value = ""; busy = true;
      msgs.push({ role: "user", content: t }); add("u", t); const out = add("b", "…");
      try {
        const r = await fetch(EP + "/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sid, consent: true, messages: msgs }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
        sid = j.session_id; try { sessionStorage.setItem("awb-sid", sid); } catch (e) {}
        out.textContent = j.reply; msgs.push({ role: "assistant", content: j.reply });
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
        rec.onend = () => { rec = null; mic.textContent = "🎤"; if (inp.value.trim()) f.requestSubmit(); };
        rec.onerror = () => { rec = null; mic.textContent = "🎤"; };
        mic.textContent = "■"; rec.start();
      };
    }
    inp.focus();
  }
  btn.onclick = open;
})();
