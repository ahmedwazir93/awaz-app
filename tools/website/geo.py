"""Search and AI-engine extras for the static build.

- prerender(): writes the data that the page scripts normally draw (Dubai data lists,
  comparison lists, market pulse, newsroom) straight into the HTML, so crawlers that do
  not run JavaScript (most AI crawlers) can read every figure. The scripts still redraw
  the same content with animation for visitors.
- extra_ld(): Dataset and FAQ structured data for the data pages, built from the same figures.
- robots(), llms_txt(): crawler rules that welcome search and AI crawlers, and the
  llms.txt summary that AI engines read to understand and cite the site.
"""
import html, json, re

esc = lambda s: html.escape(str(s), quote=True)
n0 = lambda v: f"{round(v):,}"


def _k(v):
    return f"{v / 1e9:.1f}bn" if v >= 1e9 else f"{v / 1e6:.2f}M".replace(".00M", "M") if v >= 1e6 else f"{round(v / 1e3)}K" if v >= 1e3 else n0(v)


def _x(v):
    return str(round(v * 10) / 10).rstrip("0").rstrip(".") if isinstance(v, float) else str(v)


def _line(v, mx):
    return f'<span class="dx-line" aria-hidden="true"><i style="width:{max(2, v / mx * 100):.1f}%"></i></span>'


def _fill(b, uid, inner):
    """Put static rows inside an empty <ul id="uid"></ul> (or <div id=uid></div>)."""
    for tag in ("ul", "div"):
        empty = f'<{tag} class="dx-list" id="{uid}"></{tag}>' if tag == "ul" else f'<div class="dx-kpis" id="{uid}"></div>'
        if empty in b:
            return b.replace(empty, empty.replace(f"></{tag}>", f">{inner}</{tag}>"), 1)
    return b


def _src(s):
    return f'Source: <a href="{esc(s["url"])}" rel="noopener">{esc(s["name"])}</a>.'


def prerender(b, view, D, pulse, news):
    if view == "prices":
        c = D.get("city", {})
        tot = c.get("ytd_primary", 0) + c.get("ytd_resale", 0)
        kp = lambda k, v, s: f'<div class="dx-kpi"><span>{esc(k)}</span><b>{esc(v)}</b><small>{esc(s)}</small></div>'
        b = _fill(b, "dx-city", kp(f"Sales in {c.get('q', '')}", n0(c.get("sales", 0)), f"worth AED {_k(c.get('value', 0))}") + kp("Median price", f"AED {n0(c.get('median_psf', 0))}", "per sq ft, all homes")
                  + (kp("Bought from developers", f"{round(c['ytd_primary'] / tot * 100)}%", f"of {n0(tot)} sales this year") + kp("Resales", f"{round(c['ytd_resale'] / tot * 100)}%", "bought from owners") if tot else ""))
        rows = D.get("apt", []) + [[a + " (villas)", lo, hi, y] for a, lo, hi, y in D.get("villa", [])]
        mx = max((hi or lo) for _, lo, hi, _ in rows)
        b = _fill(b, "dx-pt", "".join(f'<li class="dx-row"><span class="dx-name">{esc(a)}</span><span class="dx-val"><b class="dx-n">{n0(lo) + "–" + n0(hi) if hi else n0(lo)}</b><small>AED / sq ft</small></span>'
                                      + (f'<span class="dx-chg {"up" if y >= 0 else "down"}">{"▲" if y >= 0 else "▼"} {abs(y)}% <small>in 2025</small></span>' if y is not None else "") + _line((lo + hi) / 2 if hi else lo, mx) + "</li>" for a, lo, hi, y in rows))
        tmx = max(v for _, v in D.get("top", [[0, 1]]))
        b = _fill(b, "dx-top", "".join(f'<li class="dx-row"><span class="dx-name"><span class="dx-rank">{i + 1}</span>{esc(a)}</span><span class="dx-val"><b class="dx-n">{n0(v)}</b><small>sales this year</small></span>{_line(v, tmx)}</li>' for i, (a, v) in enumerate(D.get("top", []))))
    if view == "charges":
        L = D.get("sc", [])
        mx = max(r[1] if r[1] is not None else (r[2] + r[3]) / 2 for r in L)
        b = _fill(b, "sc-t", "".join(f'<li class="dx-row"><span class="dx-name">{esc(a)}</span><span class="dx-val"><b class="dx-n">{_x(avg if avg is not None else (lo + hi) / 2)}</b><small>AED / sq ft / yr</small></span><span class="dx-chg na">range {lo}–{hi}</span>{_line(avg if avg is not None else (lo + hi) / 2, mx)}</li>' for a, avg, lo, hi in L))
    if view == "rents":
        chip = lambda l, v: f'<span class="dx-chip"><small>{l}</small><b class="dx-n">{_k(v)}</b></span>' if v else ""
        b = _fill(b, "rn-apt", "".join(f'<li class="dx-row dx-row-r"><span class="dx-name">{esc(r[0])}</span><span class="dx-chips">{chip("Studio", r[1])}{chip("1 bed", r[2])}{chip("2 bed", r[3])}</span></li>' for r in D.get("rent_apt", [])))
        b = _fill(b, "rn-vil", "".join(f'<li class="dx-row dx-row-r"><span class="dx-name">{esc(r[0])}</span><span class="dx-chips">{chip("3 bed", r[1])}{chip("4 bed", r[2])}</span></li>' for r in D.get("rent_villa", [])))
    if view == "compare":
        W = D.get("world", {})
        def lst(uid, key, fmt, unit):
            B = W.get(key, {"rows": []}); mx = max(abs(v) for _, v in B["rows"]) if B["rows"] else 1
            hi = lambda n: " dx-hi" if re.search("Dubai|Abu Dhabi|United Arab Emirates", n) else ""
            return _fill(b, uid, "".join(f'<li class="dx-row{hi(n)}"><span class="dx-name">{esc(n)}</span><span class="dx-val"><b class="dx-n">{fmt(v)}</b><small>{unit}</small></span>{_line(abs(v), mx)}</li>' for n, v in B["rows"]))
        b = lst("cp-sqm", "sqm", _x, "sq m")
        b = lst("cp-piri", "piri", lambda v: f'{"+" if v >= 0 else "−"}{abs(v):.1f}%', "in 2025")
        b = lst("cp-super", "super", n0, "sales")
        b = lst("cp-mig", "mig", lambda v: f'{"+" if v >= 0 else "−"}{n0(abs(v))}', "millionaires")
        b = lst("cp-yield", "yield", lambda v: f"{v:.2f}%", "gross yield")
        for uid, key in (("cp-sqm", "sqm"), ("cp-piri", "piri"), ("cp-super", "super"), ("cp-mig", "mig"), ("cp-yield", "yield")):
            if key in W:
                b = b.replace(f'<p class="fine" id="{uid}-s"></p>', f'<p class="fine" id="{uid}-s">{_src(W[key]["src"])}</p>', 1)
    if not view:
        # Market pulse and newsroom on the home page
        for k, name in (("dubai", "Dubai"), ("abudhabi", "Abu Dhabi")):
            d = pulse.get(k)
            if not d:
                continue
            mix = " · ".join(f'{esc(m["name"])}: AED {_k(m["aed"])}' + (f' ({n0(m["count"])} deals)' if m.get("count") else "") if m.get("aed") else f'{esc(m["name"])}: {n0(m["count"])}' for m in d["mix"])
            static = f'<h3>{name}</h3><p>{esc(d["period"]["label"])}: AED {_k(d["total"])} ({esc(d.get("totalSub", ""))}). {mix}.</p><p class="pm-src">Source: ' + ", ".join(f'<a href="{esc(x["url"])}" rel="noopener">{esc(x["name"])}</a>' for x in d.get("sources", [])) + "</p>"
            b = re.sub(rf'(<div[^>]*id="pm-{k}"[^>]*>)(</div>)', lambda m: m.group(1) + static + m.group(2), b, count=1)
        items = news.get("items", [])
        if items:
            li = "".join(f'<li><a href="{esc(n["url"])}" rel="noopener"><span>{esc(n["source"])}{" · " + esc(n["date"]) if n.get("date") else ""}</span> {esc(n["title"])}</a></li>' for n in items)
            b = re.sub(r'(<[ou]l[^>]*id="newsList"[^>]*>)(</[ou]l>)', lambda m: m.group(1) + li + m.group(2), b, count=1)
    return b


def extra_ld(view, D, url, canon, today, author):
    """Dataset + FAQ structured data for the data pages."""
    out = []
    def dataset(name, desc, src, measured):
        return {"@context": "https://schema.org", "@type": "Dataset", "name": name, "description": desc, "url": canon, "creator": author,
                "dateModified": today, "spatialCoverage": {"@type": "Place", "name": "Dubai, United Arab Emirates"}, "isAccessibleForFree": True,
                "isBasedOn": src, "variableMeasured": measured, "license": "https://creativecommons.org/licenses/by/4.0/"}
    def faq(qa):
        return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]}
    if view == "prices":
        apt = {r[0]: r for r in D.get("apt", [])}
        out.append(dataset("Dubai property prices per square foot by area", "Average sale price per square foot for apartments and villas in Dubai's main communities, with 2025 change, citywide sales volume and the share bought from developers.",
                           [D["price_source"]["url"], D["city"]["source"]["url"]], ["Average price per sq ft (AED)", "Annual change (%)", "Sales transactions"]))
        qa = [(f"What is the average price per square foot in {a.split(' (')[0]}, Dubai?", f"About AED {n0(lo)}{'–' + n0(hi) if hi else ''} per sq ft for apartments ({D['price_source']['period']}), according to {D['price_source']['name']}.") for a, lo, hi, _ in D.get("apt", [])[:6]]
        c = D.get("city", {}); tot = c.get("ytd_primary", 0) + c.get("ytd_resale", 0)
        if tot:
            qa.append(("How much of Dubai's property market is off-plan?", f"About {round(c['ytd_primary'] / tot * 100)}% of Dubai sales so far in 2026 were bought directly from developers (primary market, mostly off-plan), based on Dubai Land Department records analysed by DXBinteract."))
        out.append(faq(qa))
    if view == "rents":
        out.append(dataset("Dubai average rents by area", "Average yearly rents in Dubai by area for studios, apartments and villas.", [D["rent_source"]["url"]], ["Average annual rent (AED)"]))
        out.append(faq([(f"What is the average rent for a 1 bedroom apartment in {r[0]}?", f"About AED {n0(r[2])} a year ({D['rent_source']['name']}).") for r in D.get("rent_apt", []) if r[2]][:6]))
    if view == "charges":
        out.append(dataset("Dubai service charges by area", "Typical annual service charges per square foot in Dubai communities, with observed ranges.", [D["sc_source"]["url"]], ["Service charge (AED per sq ft per year)"]))
        out.append(faq([(f"How much are service charges in {a}?", f"Typically about AED {_x(avg)} per sq ft a year, ranging from AED {lo} to {hi} depending on the building ({D['sc_source']['name']}). The exact approved rate for each building is published by the Dubai Land Department.") for a, avg, lo, hi in D.get("sc", []) if avg][:6]))
    if view == "compare":
        W = D.get("world", {})
        out.append(dataset("Dubai and Abu Dhabi compared with global property markets", "Prime space per US$1 million, luxury price growth, super-prime sales, millionaire migration and rental yields for Dubai, Abu Dhabi and major world cities.",
                           [W[k]["src"]["url"] for k in W], ["Square metres per US$1 million", "Prime price change (%)", "US$10m+ sales", "Net millionaire migration", "Gross rental yield (%)"]))
        sq = dict(W.get("sqm", {}).get("rows", []))
        out.append(faq([
            ("How much prime property does US$1 million buy in Dubai compared with London and New York?", f"About {sq.get('Dubai')} sq m in Dubai, against {sq.get('London')} sq m in London and {sq.get('New York')} sq m in New York (Knight Frank, The Wealth Report 2026)."),
            ("How much did Dubai luxury home prices rise in 2025?", "Prime prices in Dubai rose 25.1% in 2025, against a global average of 3.2% (Knight Frank Prime International Residential Index, The Wealth Report 2026)."),
            ("Which city sells the most US$10 million homes?", "Dubai was the world's busiest super-prime market in Q3 2026 with 86 sales of US$10 million or more, ahead of Hong Kong and New York (Knight Frank, via The National)."),
            ("Do you pay tax on rental income in Dubai?", "Individuals in the UAE generally pay no tax on rental income or on the gain when they sell property, and there is no annual property tax. Confirm your own position with a tax adviser.")]))
    return out


AI_BOTS = ["Googlebot", "Bingbot", "Google-Extended", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
           "PerplexityBot", "Perplexity-User", "Applebot", "Applebot-Extended", "Amazonbot", "meta-externalagent", "DuckAssistBot", "CCBot", "cohere-ai", "MistralAI-User"]


def robots(url):
    blocks = "\n".join(f"User-agent: {b}\nAllow: /\n" for b in AI_BOTS)
    return f"# Search engines and AI assistants are welcome to read and cite this site.\n{blocks}\nUser-agent: *\nAllow: /\n\nSitemap: {url}/sitemap.xml\n"


def llms_txt(url, pages, seo, D, full=False):
    L = ["# Ahmed Wazir", "",
         "> Ahmed Wazir is a RERA-registered off-plan property consultant in Dubai (BRN 85446) with Springfield Properties L.L.C S.O.C (RERA ORN 11929), Bay Square, Business Bay. UAE Media Council advertiser permit 8476056. This site publishes free, sourced guides, calculators and market data for people buying property in Dubai, including buyers from India, Pakistan, the UK, the USA and Saudi Arabia.", "",
         "Content is general information, not financial, legal or tax advice. Figures are cited to their published sources and dated. Contact: WhatsApp +971 58 603 2580, ahusain@springfield-re.com. Languages: English, Arabic, Hindi, Urdu.", ""]
    groups = {"Dubai market data": ["compare", "prices", "rents", "charges"], "Calculators and planners": ["calc", "mortgage", "yield", "roe", "buyrent", "stress", "afford"],
              "Guides": ["why", "golden", "laws", "adlaw", "buyabroad", "abroad", "from-pakistan", "from-saudi", "from-uk", "from-us", "developers", "verify", "planner"]}
    for g, keys in groups.items():
        L.append(f"## {g}")
        for k in keys:
            if k in pages and k in seo:
                L.append(f"- [{seo[k][0].split(' | ')[0]}]({url}{pages[k]}): {seo[k][1]}")
        L.append("")
    L += ["## About", f"- [Home]({url}/): who Ahmed is, services, market pulse and news", f"- [Privacy policy]({url}{pages.get('privacy', '/privacy-policy/')})", ""]
    if full:
        c, W = D.get("city", {}), D.get("world", {})
        L += ["## Key facts (with sources)", f"Updated {D.get('updated', '')}.", ""]
        L.append(f"- Dubai {c.get('q')}: {n0(c.get('sales', 0))} sales worth AED {_k(c.get('value', 0))}; median AED {n0(c.get('median_psf', 0))} per sq ft. Source: {c.get('source', {}).get('name')} ({c.get('source', {}).get('url')})")
        L.append("- Average apartment prices per sq ft (" + D["price_source"]["period"] + "): " + "; ".join(f"{a} AED {n0(lo)}{'–' + n0(hi) if hi else ''}" for a, lo, hi, _ in D.get("apt", [])) + f". Source: {D['price_source']['name']} ({D['price_source']['url']})")
        L.append("- Average villa prices per sq ft: " + "; ".join(f"{a} AED {n0(lo)}" for a, lo, hi, _ in D.get("villa", [])) + ".")
        L.append("- Service charges (AED per sq ft per year, typical): " + "; ".join(f"{a} {_x(avg)} (range {lo}–{hi})" for a, avg, lo, hi in D.get("sc", []) if avg) + f". Source: {D['sc_source']['name']} ({D['sc_source']['url']})")
        L.append("- Average yearly rents, 1-bed apartment: " + "; ".join(f"{r[0]} AED {n0(r[2])}" for r in D.get("rent_apt", []) if r[2]) + f". Source: {D['rent_source']['name']} ({D['rent_source']['url']})")
        for k, label in (("sqm", "Prime square metres per US$1 million"), ("piri", "Prime price change in 2025 (%)"), ("super", "US$10m+ home sales, Q3 2026"), ("mig", "Net millionaire migration, 2025"), ("yield", "Average gross rental yield (%)")):
            if k in W:
                L.append(f"- {label}: " + "; ".join(f"{n} {v}" for n, v in W[k]["rows"]) + f". Source: {W[k]['src']['name']} ({W[k]['src']['url']})")
        L += ["- Dubai Land Department transfer fee: 4% of the price plus admin fees. Off-plan payments in Dubai go into a project escrow account.",
              "- UAE Golden Visa through property: property worth AED 2 million or more can qualify for a renewable 10-year visa.",
              "- UAE individuals generally pay no tax on rental income or capital gains from property, and there is no annual property tax.", ""]
    return "\n".join(L) + "\n"
