// Ahmed Wazir · AI assistant backend (Cloudflare Worker)
//
// Routes
//   POST /chat        visitor chat turn  -> Claude (Anthropic API) with project tools
//   POST /lead        website/app form   -> stored as a form lead
//   POST /contact     in-chat contact form (start of chat, or before a file/meeting)
//   GET  /api/chats   owner only         -> chat leads for the desk
//   GET  /api/forms   owner only         -> form leads for the desk
//
// Bindings (wrangler.toml): DB (D1), RULES (text, rules.md), ALERT (send_email, optional)
// Secrets: ANTHROPIC_API_KEY. Vars: OWNER_EMAIL, ALLOWED_ORIGINS, MODEL.
// Project data is loaded into D1 (table projects) at deploy time and is NOT kept in this repo:
// publishing project prices publicly would need a DLD advertising permit.

import RULES from "./rules.md";

const BOOKING = "https://calendar.app.google/T7Str2jVSvmZEARA9";
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...h } });

function cors(req, env) {
  const o = req.headers.get("origin") || "";
  const ok = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).includes(o);
  return ok ? { "access-control-allow-origin": o, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" } : {};
}

// ---------- project tools (same logic as the desk's test console) ----------
const isAD = p => p.em === "Abu Dhabi";
function compact(p) {
  const o = { id: p.id, name: p.n, developer: p.d, emirate: p.em, area: p.a, types: JSON.parse(p.t || "[]"), handover: p.h || "TBA",
    sale_status: p.ss, construction: p.cs, escrow_registered: !!p.esc, construction_pct: p.cp };
  if (isAD(p)) return { ...o, note: "Abu Dhabi project: prices, availability and booking are handled by a licensed Abu Dhabi agent at Springfield Properties." };
  return { ...o, price_from_aed: p.p0, price_to_aed: p.p1, beds: p.b0 == null ? null : [p.b0, p.b1], size_sqft: p.s0 == null ? null : [p.s0, p.s1],
    units_available: p.ua, price_note: "As published by the developer; can change. Ahmed confirms the live price list." };
}
async function searchProjects(env, a = {}) {
  const w = [], v = [];
  if (a.query) { w.push("(lower(n) LIKE ? OR lower(d) LIKE ? OR lower(a) LIKE ?)"); const q = `%${String(a.query).toLowerCase()}%`; v.push(q, q, q); }
  if (a.emirate) { w.push("em = ?"); v.push(a.emirate); }
  if (a.developer) { w.push("lower(d) LIKE ?"); v.push(`%${String(a.developer).toLowerCase()}%`); }
  if (a.type) { w.push("lower(t) LIKE ?"); v.push(`%${String(a.type).toLowerCase()}%`); }
  if (a.max_price_aed) { w.push("(em = 'Abu Dhabi' OR (p0 IS NOT NULL AND p0 <= ?))"); v.push(+a.max_price_aed); }
  if (a.min_beds) { w.push("b1 >= ?"); v.push(+a.min_beds); }
  if (a.handover_by) { w.push("substr(h,1,4) <= ?"); v.push(String(a.handover_by)); }
  const sql = `SELECT * FROM projects ${w.length ? "WHERE " + w.join(" AND ") : ""} LIMIT 8`;
  const { results } = await env.DB.prepare(sql).bind(...v).all();
  return { results: results.map(compact) };
}
async function getProject(env, a = {}) {
  const p = a.id ? await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(+a.id).first()
    : await env.DB.prepare("SELECT * FROM projects WHERE lower(n) = ?").bind(String(a.name || "").toLowerCase()).first();
  if (!p) return { error: "Not found in Ahmed's partner projects." };
  return { ...compact(p), overview: p.ov || "", ...(isAD(p) ? {} : { total_units: p.tu }) };
}

const MOBILE_RE = /^\+?[0-9][0-9 ()-]{6,18}[0-9]$/, EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Contact gate: files (brochures, floor plans, price lists) and meetings need name, mobile and email from the in-chat form.
function contactGate(lead) {
  const miss = [];
  if (!lead.name || String(lead.name).trim().length < 2) miss.push("full name");
  if (!lead.mobile || !MOBILE_RE.test(String(lead.mobile).trim())) miss.push("mobile number with country code");
  if (!lead.email || !EMAIL_RE.test(String(lead.email).trim())) miss.push("email address");
  return miss.length ? { error: "form_required", instruction: "A short contact form is now shown in the chat. Tell the visitor in one line to fill it in, and that Ahmed will follow up as soon as it's done. Don't ask for the details yourself." } : null;
}

const TOOLS = [
  { name: "search_projects", description: "Search Ahmed's partner developers' off-plan projects. Use only when the visitor asks about projects or asks for options matching their brief. Returns up to 8 matches.",
    input_schema: { type: "object", properties: { query: { type: "string" }, emirate: { type: "string", enum: ["Dubai", "Abu Dhabi", "Sharjah", "Ras Al Khaimah", "Umm Al Quwain"] }, developer: { type: "string" }, type: { type: "string" }, max_price_aed: { type: "number" }, min_beds: { type: "number" }, handover_by: { type: "string" } } } },
  { name: "get_project", description: "Full details of one project by id or exact name.", input_schema: { type: "object", properties: { id: { type: "number" }, name: { type: "string" } } } },
  { name: "update_lead", description: "Record what you learned about the visitor (only new fields).",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Full name" }, mobile: { type: "string", description: "Mobile number with country code" }, email: { type: "string" }, goal: { type: "string" }, budget_aed: { type: "string" }, area: { type: "string" }, unit_type: { type: "string" }, timeline: { type: "string" }, finance: { type: "string" }, buying_from: { type: "string" }, summary: { type: "string" } } } },
  { name: "request_brochure", description: "Call when the visitor asks for a brochure, floor plans, price list or any other file for a project.",
    input_schema: { type: "object", properties: { project: { type: "string" }, documents: { type: "string" } }, required: ["project"] } },
  { name: "book_meeting", description: "Call when the visitor wants to talk to Ahmed, book a call or go ahead.",
    input_schema: { type: "object", properties: { preferred_time: { type: "string" }, route: { type: "string", enum: ["dubai", "abu-dhabi", "other-emirate"] }, notes: { type: "string" } }, required: ["preferred_time"] } }
];

async function alert(env, subject, body) {
  if (!env.ALERT || !env.OWNER_EMAIL) return;
  const { EmailMessage } = await import("cloudflare:email");
  const from = env.ALERT_FROM || `bot@${(env.OWNER_DOMAIN || "example.com")}`;
  const raw = [`From: Ahmed's assistant <${from}>`, `To: ${env.OWNER_EMAIL}`, `Subject: ${subject}`, `Message-ID: <${crypto.randomUUID()}@${from.split("@")[1]}>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n");
  try { await env.ALERT.send(new EmailMessage(from, env.OWNER_EMAIL, raw)); } catch (e) { console.log("alert failed", e.message); }
}

async function chat(req, env) {
  const b = await req.json().catch(() => ({}));
  if (!b.consent) return json({ error: "consent_required" }, 400);
  const id = String(b.session_id || "").slice(0, 64) || crypto.randomUUID();
  const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-30)
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length || msgs.at(-1).role !== "user") return json({ error: "bad_request" }, 400);

  const row = await env.DB.prepare("SELECT * FROM chats WHERE id = ?").bind(id).first();
  const st = { stage: row?.stage || "new", route: row?.route || "dubai", lead: JSON.parse(row?.lead || "{}"), meeting: JSON.parse(row?.meeting || "null"), brochure: JSON.parse(row?.brochure || "null") };
  let justBooked = false, justBrochure = false, needForm = null;
  const run = async (name, input) => {
    if (name === "search_projects") return searchProjects(env, input);
    if (name === "get_project") return getProject(env, input);
    if (name === "update_lead") { const bad = []; for (let [k, v] of Object.entries(input || {})) { if (!v) continue; v = String(v).trim().slice(0, 300); if (k === "mobile" && !MOBILE_RE.test(v)) { bad.push("mobile"); continue; } if (k === "email" && !EMAIL_RE.test(v)) { bad.push("email"); continue; } st.lead[k] = v; } if (st.stage === "new") st.stage = "qualifying"; return bad.length ? { ok: false, invalid: bad } : { ok: true, contact_complete: !contactGate(st.lead) }; }
    if (name === "request_brochure") { const g = contactGate(st.lead); if (g) { st.lead._pending = { kind: "file", project: String(input.project || "").slice(0, 120), documents: String(input.documents || "brochure").slice(0, 120) }; needForm = "file"; return g; } if (st.stage !== "meeting") st.stage = "brochure"; st.brochure = { project: String(input.project || "").slice(0, 120), documents: String(input.documents || "brochure").slice(0, 120), at: Date.now() }; justBrochure = true; return { ok: true, note: "Ahmed will send the official documents personally to the visitor's WhatsApp or email." }; }
    if (name === "book_meeting") { const g = contactGate(st.lead); if (g) { st.lead._pending = { kind: "meeting", preferred_time: String(input.preferred_time || ""), route: input.route || "dubai", notes: String(input.notes || "") }; needForm = "meeting"; return g; } st.stage = "meeting"; st.route = input.route || "dubai"; st.meeting = { preferred_time: input.preferred_time || "", notes: input.notes || "", at: Date.now() }; justBooked = true;
      return { ok: true, booking_link: BOOKING, handled_by: st.route === "dubai" ? "Ahmed Wazir" : "a licensed agent at Springfield Properties for that emirate" }; }
    return { error: "unknown tool" };
  };

  const system = `${RULES}\n\nToday is ${new Date().toDateString()}. Visitor details so far: ${JSON.stringify(st.lead)}. Current stage: ${st.stage}.`;
  let convo = msgs.slice(), reply = "";
  for (let round = 0; round < 6; round++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env.MODEL || "claude-sonnet-5-5", max_tokens: 1024, system, tools: TOOLS, messages: convo }) });
    if (!r.ok) return json({ error: "model_error", status: r.status }, 502, cors(req, env));
    const out = await r.json();
    convo.push({ role: "assistant", content: out.content });
    const uses = out.content.filter(c => c.type === "tool_use");
    reply = out.content.filter(c => c.type === "text").map(c => c.text).join("\n").trim();
    if (out.stop_reason !== "tool_use" || !uses.length) break;
    const results = [];
    for (const u of uses) results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(await run(u.name, u.input)) });
    convo.push({ role: "user", content: results });
  }
  const transcript = [...msgs, { role: "assistant", content: reply }].slice(-60);
  const lang = /[؀-ۿ]/.test(JSON.stringify(msgs)) ? "Arabic/Urdu" : /[ऀ-ॿ]/.test(JSON.stringify(msgs)) ? "Hindi" : "Latin script";
  await env.DB.prepare(`INSERT INTO chats (id, created, updated, stage, route, lead, meeting, brochure, lang, messages, handled) VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?9, ?7, ?8, 0)
    ON CONFLICT(id) DO UPDATE SET updated = ?2, stage = ?3, route = ?4, lead = ?5, meeting = ?6, brochure = ?9, lang = ?7, messages = ?8`)
    .bind(id, Date.now(), st.stage, st.route, JSON.stringify(st.lead), JSON.stringify(st.meeting), lang, JSON.stringify(transcript), JSON.stringify(st.brochure)).run();
  if (justBrochure) await alert(env, `Brochure requested: ${st.brochure.project} (${st.lead.name || "visitor"})`,
    `${st.lead.name || ""}\nMobile: ${st.lead.mobile || "-"}\nEmail: ${st.lead.email || "-"}\nRoute: ${st.route}\n\nWants: ${st.brochure.documents} for ${st.brochure.project}\n\nSend the official documents personally, then mark it contacted in your desk.`);
  if (justBooked) await alert(env, `Meeting requested: ${st.lead.name || "visitor"} (${st.route})`,
    `${st.lead.name || ""}\nMobile: ${st.lead.mobile || "-"}\nEmail: ${st.lead.email || "-"}\nRoute: ${st.route}\nPreferred time: ${st.meeting?.preferred_time || "-"}\nNotes: ${st.meeting?.notes || "-"}\n\nWhat they want: ${st.lead.summary || st.lead.goal || "-"}\nBudget: ${st.lead.budget_aed || "-"} · Area: ${st.lead.area || "-"} · From: ${st.lead.buying_from || "-"}\n\nOpen your desk to read the conversation.`);
  return json({ session_id: id, reply, form: needForm }, 200, cors(req, env));
}

// In-chat contact form: at the start ("share my details") or when a file or meeting is requested
async function contact(req, env) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 120), mobile = String(b.mobile || "").trim().slice(0, 30), email = String(b.email || "").trim().slice(0, 160);
  if (!b.consent || name.length < 2 || !MOBILE_RE.test(mobile) || !EMAIL_RE.test(email)) return json({ error: "invalid" }, 400, cors(req, env));
  const id = String(b.session_id || "").slice(0, 64) || crypto.randomUUID();
  const row = await env.DB.prepare("SELECT * FROM chats WHERE id = ?").bind(id).first();
  const lead = { ...JSON.parse(row?.lead || "{}"), name, mobile, email }, pend = lead._pending; delete lead._pending;
  let stage = row?.stage || "new", route = row?.route || "dubai", meeting = JSON.parse(row?.meeting || "null"), brochure = JSON.parse(row?.brochure || "null"), message = `Thanks, ${name}.`;
  if (pend && pend.kind === "file") { brochure = { project: pend.project, documents: pend.documents, at: Date.now() }; if (stage !== "meeting") stage = "brochure"; message = `Thank you, ${name}. Ahmed will send the official ${pend.documents} for ${pend.project} to your WhatsApp and email shortly.`; }
  if (pend && pend.kind === "meeting") { meeting = { preferred_time: pend.preferred_time, notes: pend.notes, at: Date.now() }; stage = "meeting"; route = pend.route; message = `Thank you, ${name}. Ahmed will contact you to confirm the call. You can also pick a slot here: ${BOOKING}`; }
  await env.DB.prepare(`INSERT INTO chats (id, created, updated, stage, route, lead, meeting, brochure, guest, messages, handled) VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, 0, '[]', 0)
    ON CONFLICT(id) DO UPDATE SET updated = ?2, stage = ?3, route = ?4, lead = ?5, meeting = ?6, brochure = ?7, guest = 0`)
    .bind(id, Date.now(), stage, route, JSON.stringify(lead), JSON.stringify(meeting), JSON.stringify(brochure)).run();
  if (pend) await alert(env, pend.kind === "file" ? `File requested: ${pend.project} (${name})` : `Meeting requested: ${name} (${route})`,
    `${name}\nMobile: ${mobile}\nEmail: ${email}\nRoute: ${route}\n\n${pend.kind === "file" ? `Wants: ${pend.documents} for ${pend.project}. Send the official documents personally.` : `Preferred time: ${pend.preferred_time || "-"}\nNotes: ${pend.notes || "-"}`}\n\nOpen your desk to read the conversation.`);
  return json({ ok: true, session_id: id, message }, 200, cors(req, env));
}

async function lead(req, env) {
  const f = await req.json().catch(() => ({}));
  if (!f.consent || !f.name || !f.contact) return json({ error: "bad_request" }, 400, cors(req, env));
  const clean = k => String(f[k] || "").slice(0, 1000);
  await env.DB.prepare("INSERT INTO forms (id, created, name, contact, interest, budget, emirate, project, message, source) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), Date.now(), clean("name"), clean("contact"), clean("interest"), clean("budget"), clean("emirate"), clean("project"), clean("message"), clean("source")).run();
  return json({ ok: true }, 200, cors(req, env));
}

function owner(req, env) {
  // Put /api/* behind Cloudflare Access (free) so only OWNER_EMAIL can sign in.
  return (req.headers.get("cf-access-authenticated-user-email") || "").toLowerCase() === String(env.OWNER_EMAIL || "").toLowerCase();
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req, env) });
    if (req.method === "POST" && url.pathname === "/chat") return chat(req, env);
    if (req.method === "POST" && url.pathname === "/lead") return lead(req, env);
    if (req.method === "POST" && url.pathname === "/contact") return contact(req, env);
    if (url.pathname.startsWith("/api/")) {
      if (!owner(req, env)) return json({ error: "forbidden" }, 403);
      if (url.pathname === "/api/chats") return json((await env.DB.prepare("SELECT * FROM chats ORDER BY updated DESC LIMIT 500").all()).results);
      if (url.pathname === "/api/forms") return json((await env.DB.prepare("SELECT * FROM forms ORDER BY created DESC LIMIT 500").all()).results);
    }
    return json({ error: "not_found" }, 404);
  },
  // Data protection: delete conversations and form leads older than 12 months.
  async scheduled(_e, env) {
    const cutoff = Date.now() - 365 * 864e5;
    await env.DB.prepare("DELETE FROM chats WHERE updated < ?").bind(cutoff).run();
    await env.DB.prepare("DELETE FROM forms WHERE created < ?").bind(cutoff).run();
  }
};
