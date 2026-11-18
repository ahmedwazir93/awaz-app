#!/usr/bin/env python3
"""Build the live, Google-ready version of Ahmed Wazir's website.

Usage: python3 build_site.py <website.html> <out_dir> [--url https://www.example.com]

Turns the single-page website (hash views like #golden) into real pages:
  /                              home
  /uae-golden-visa-property/     one folder per guide, calculator and tool
Each page gets its own title, description, canonical URL, Open Graph tags,
breadcrumb + page schema, and only its own content (no duplicate text).
Images embedded as base64 are written out as files, the CSS and JS become
cached files, and robots.txt, sitemap.xml, 404.html, a web manifest and
icons are generated.
"""
import datetime, hashlib, json, os, re, shutil, sys

SRC, OUT = sys.argv[1], sys.argv[2]
URL = (sys.argv[sys.argv.index("--url") + 1] if "--url" in sys.argv else "https://www.awazrealty.com").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.dirname(os.path.abspath(SRC))
TODAY = datetime.date.today().isoformat()
sys.path.insert(0, HERE)
import geo  # search + AI-engine extras (prerendered data, Dataset/FAQ schema, robots, llms.txt)

SLUG = {
    "developers": "uae-property-developers",
    "calc": "off-plan-payment-plan-calculator", "privacy": "privacy-policy",
    "yield": "rental-yield-calculator", "roe": "return-on-equity-calculator", "mortgage": "uae-mortgage-calculator",
    "buyrent": "buy-vs-rent-calculator", "why": "why-invest-in-uae-real-estate", "golden": "uae-golden-visa-property",
    "laws": "dubai-real-estate-law", "adlaw": "abu-dhabi-real-estate-law", "shjlaw": "sharjah-real-estate-law", "abroad": "buy-uae-property-from-india",
    "buyabroad": "buy-uae-property-from-abroad", "from-pakistan": "buy-dubai-property-from-pakistan",
    "from-saudi": "buy-dubai-property-from-saudi-arabia", "from-uk": "buy-dubai-property-from-uk",
    "from-us": "buy-dubai-property-from-usa", "planner": "off-plan-due-diligence-checklist",
    "sell": "sell-off-plan-property",
    "prices": "dubai-property-prices-by-area", "charges": "dubai-service-charges-by-area", "rents": "dubai-rent-by-area",
    "stress": "off-plan-stress-test", "afford": "dubai-property-budget-from-abroad", "verify": "verify-off-plan-project-dubai",
    "compare": "dubai-vs-global-property-markets",
}
# Guides get Article schema, calculators get WebApplication schema
GUIDES = {"why", "golden", "laws", "adlaw", "shjlaw", "abroad", "buyabroad", "from-pakistan", "from-saudi", "from-uk", "from-us", "developers", "prices", "charges", "rents", "verify", "compare"}
TOOLS = {"calc", "yield", "roe", "mortgage", "buyrent", "planner", "stress", "afford"}
# Kept on the site but out of Google: not part of the off-plan focus
NOINDEX = {"sell"}
HOME_ANCHORS = {"top", "launches", "contact", "pulse", "services", "about", "reviews", "news", "follow", "toolkit", "community"}

s = open(SRC, encoding="utf-8").read()
if s.lstrip().lower().startswith("<!doctype"):  # a saved live copy carries the publish skeleton
    s = re.sub(r"^.*?<body>\s*", "", s, count=1, flags=re.S)
    s = re.sub(r"</body>\s*</html>\s*$", "", s.rstrip())

shutil.rmtree(OUT, ignore_errors=True)
for d in ("assets/img", "assets/css", "assets/js"):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

def h8(b):
    return hashlib.sha1(b).hexdigest()[:10]

# 1. Base64 images -> files
import base64
def unb64(m):
    mime, data = m.group(1), m.group(2)
    raw = base64.b64decode(data)
    ext = {"jpeg": "jpg", "svg+xml": "svg"}.get(mime, mime)
    if ext in ("jpg", "png"):  # smaller WebP for photos and logos
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(raw))
        buf = io.BytesIO()
        if ext == "jpg":
            im.convert("RGB").save(buf, "WEBP", quality=78, method=6)
        else:
            im.convert("RGBA").save(buf, "WEBP", lossless=True, method=6)
        if buf.tell() < len(raw):
            raw, ext = buf.getvalue(), "webp"
    name = f"assets/img/{h8(raw)}.{ext}"
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        open(p, "wb").write(raw)
    return "/" + name
s = re.sub(r"data:image/([a-z+]+);base64,([A-Za-z0-9+/=]+)", unb64, s)

# 2. CSS -> file
styles = list(re.finditer(r"<style>(.*?)</style>", s, re.S))
main_css = max(styles, key=lambda m: len(m.group(1)))
css = main_css.group(1)
css += "\n/* Page H1 on inner pages keeps the section heading look */\n.vh { font-size: clamp(40px, 6vw, 72px); font-weight: 800; }\n.vh-k { display: block; font: 600 12px/1.4 var(--mono); letter-spacing: .14em; color: var(--red-text); margin-bottom: 12px; }\n"
import rcssmin, subprocess
def jsmin(code):
    # esbuild understands template literals (rjsmin collapsed the spaces inside them)
    exe = shutil.which("esbuild") or "/opt/npm-tools/node_modules/.bin/esbuild"
    return subprocess.run([exe, "--minify", "--loader=js", "--log-level=error"], input=code, capture_output=True, text=True, check=True).stdout
css = rcssmin.cssmin(css)
css_name = f"assets/css/site.{h8(css.encode())}.css"
open(os.path.join(OUT, css_name), "w", encoding="utf-8").write(css)
s = s[:main_css.start()] + f'<link rel="stylesheet" href="/{css_name}">' + s[main_css.end():]

# 3. Main JS -> file (the long inline script; small head scripts stay inline)
scripts = [m for m in re.finditer(r"<script>(.*?)</script>", s, re.S)]
main_js = max(scripts, key=lambda m: len(m.group(1)))
js = main_js.group(1)
# Real page URLs: the view comes from the page, not only the hash
js = js.replace('const h = location.hash.slice(1);', 'const h = location.hash.slice(1) || window.__VIEW || "";', 1)
s = s.replace('<div id="qrBox" class="qr" aria-label=', '<div id="qrBox" class="qr" role="img" aria-label=')
js = js.replace('fetch("data/projects.json")', 'fetch("/data/projects.json")')
js = js.replace('`img/r${rid}.webp`', '`/img/r${rid}.webp`')
# Hash links written inside script templates
def js_links(m):
    v = m.group(1)
    return f'href="/{SLUG[v]}/"' if v in SLUG else m.group(0)
js = re.sub(r'href="#([a-z-]+)"', js_links, js)
# Never fail on a section that this page does not carry
guard = ("(function(){var g=Document.prototype.getElementById,q=Document.prototype.querySelector,S={};"
         "Document.prototype.getElementById=function(i){return g.call(this,i)||S[i]||(S[i]=document.createElement(/canvas/i.test(i)?'canvas':(/svg|map/i.test(i)?'div':'div')))};"
         "})();\n")
# Null-safe spots for sections that live on other pages
for old, new in [
    ('box.closest(".save-contact").querySelector(".qr-wrap").hidden = true', '(box.closest(".save-contact") || box).querySelector(".qr-wrap") && ((box.closest(".save-contact") || box).querySelector(".qr-wrap").hidden = true)'),
    ('document.querySelector(".mk-strip").hidden = true', '(document.querySelector(".mk-strip") || {}).hidden = true'),
]:
    js = js.replace(old, new)
js = guard + js
js_readable = js
js = jsmin(js)
js_name = f"assets/js/site.{h8(js.encode())}.js"
open(os.path.join(OUT, js_name), "w", encoding="utf-8").write(js)
_mt = main_js.group(0); _i = s.find(_mt)  # positions shift after the edits above, so locate it again
assert _i >= 0
s = s[:_i] + f'<script src="/{js_name}"></script>' + s[_i + len(_mt):]

# 3b. AI assistant widget -> its own cached file (preview mode until data-endpoint is set)
wm = re.search(r'<script id="awb-widget" data-endpoint="([^"]*)">(.*?)</script>', s, re.S)
if wm:
    wjs = jsmin(wm.group(2))
    w_name = f"assets/js/widget.{h8(wjs.encode())}.js"
    open(os.path.join(OUT, w_name), "w", encoding="utf-8").write(wjs)
    s = s[:wm.start()] + f'<script src="/{w_name}" data-endpoint="{wm.group(1)}" defer></script>' + s[wm.end():]

# 4. Split head (everything before <style>/<link css>) from body
# The source has no <head>: meta tags and title come first, then the body content.
first_body = s.find('<a class="skip"') if '<a class="skip"' in s else s.find("<header")
head_part, body_part = s[:first_body], s[first_body:]
head_part = re.sub(r"<title>.*?</title>\s*", "", head_part, flags=re.S)
for pat in [r'<meta name="description"[^>]*>\s*', r'<meta property="og:(title|description|url|image)[^"]*"[^>]*>\s*',
            r'<meta name="twitter:(title|description|image|card)"[^>]*>\s*', r'<meta name="robots"[^>]*>\s*',
            r'<meta name="claude:[^"]*"[^>]*>\s*', r'<link rel="canonical"[^>]*>\s*']:
    head_part = re.sub(pat, "", head_part)
# JSON-LD blocks: keep the agent schema everywhere, FAQ only on home
ld_blocks = re.findall(r'<script type="application/ld\+json">.*?</script>\s*', head_part, re.S)
head_part = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', "", head_part, flags=re.S)
agent_ld = next((b for b in ld_blocks if "RealEstateAgent" in b), "")
faq_ld = next((b for b in ld_blocks if "FAQPage" in b), "")
agent_ld = agent_ld.replace('"@type": "RealEstateAgent",', f'"@type": "RealEstateAgent",\n  "@id": "{URL}/#agent",\n  "url": "{URL}/",\n  "image": "{URL}/og-image.png",\n  "logo": "{URL}/icon-512.png",', 1)

# SEO titles and descriptions come from the site's own SEO map
seo = {}
for m in re.finditer(r'^\s*"?([a-z_-]+)"?: \["([^"]+)", (null|"([^"]*)")\]', js_readable, re.M):
    seo[m.group(1)] = (m.group(2), m.group(4))
home_desc = re.search(r'<meta name="description" content="([^"]+)"', s).group(1)
_SRC_TXT = open(SRC, encoding="utf-8").read()
_blk = lambda bid: json.loads((re.search(r'<script type="application/json" id="%s">(.*?)</script>' % bid, _SRC_TXT, re.S) or [None, '{}'])[1])
AREA, PULSE, NEWS = _blk("area-data"), _blk("pulse-data"), _blk("news-data")

# 5. Sections
sec_re = re.compile(r'<section class="(tool-view|dev-view|map-view)[^"]*" id="([^"]+)"[^>]*>.*?</section>\s*(?=<section class="(?:tool-view|dev-view|map-view)|<footer|<ul id="extraLogos"|<script|<dialog|<div class="sticky|$)', re.S)
views = {m.group(2): (m.start(), m.end()) for m in sec_re.finditer(body_part)}
missing = [v for v in SLUG if v not in views]
if missing:
    sys.exit(f"Views not found: {missing}")
main_m = re.search(r'<main id="top"[^>]*>.*?</main>', body_part, re.S)

def body_for(view):
    b = body_part
    # Remove every other view (and the home sections on inner pages)
    spans = sorted([(a, e) for k, (a, e) in views.items() if k != view], reverse=True)
    if view:
        spans.append(main_m.span()); spans.sort(reverse=True)
    for a, e in spans:
        b = b[:a] + b[e:]
    if view:
        b = re.sub(rf'(<section class="[^"]*" id="{re.escape(view)}") hidden', r"\1", b, count=1)
        # One H1 per page: the view's first heading becomes the page H1 (same look)
        i = b.find(f'id="{view}"')
        j = b.find("<h2", i)
        if j > 0:
            k = b.find("</h2>", j)
            kw = re.split(r" \| |: ", seo.get(view, ("",))[0] or "")[0].strip()
            gt = b.find(">", j)
            inner = b[gt + 1:k]
            _w = lambda t: set(re.findall(r"[a-z0-9]+", re.sub("<[^>]+>", "", t).lower())) - {"a", "an", "any", "the", "in", "of", "by", "and", "your", "to"}
            _hw = _w(inner)
            # Skip the keyword line when the heading already says the same thing
            same = kw and _hw and len(_hw & _w(kw)) / len(_hw) >= 0.7
            label = f'<span class="vh-k">{kw}</span>' if kw and not same and kw.lower() not in re.sub("<[^>]+>", "", inner).lower() else ""
            b = b[:j] + '<h1 class="vh"' + b[j + 3:gt + 1] + label + inner + "</h1>" + b[k + 5:]
            # Don't show the same words twice: drop an eyebrow right above the H1 that repeats its keyword
            if label:
                norm = lambda t: re.sub(r"[^a-z0-9]", "", re.sub("<[^>]+>", "", t).lower())
                em = None
                for em in re.finditer(r'<p class="eyebrow">(.*?)</p>\s*', b[max(0, j - 400):j]):
                    pass
                if em and norm(em.group(1)) == norm(kw):
                    a0 = max(0, j - 400)
                    b = b[:a0 + em.start()] + b[a0 + em.end():]
                    j -= em.end() - em.start()
            # Keep the outline in order: with no H2 left in the view, H3s read as level 2, H4s as level 3
            se = b.find("</section>", j)
            sec = b[j:se]
            if "<h2" not in sec:
                sec = re.sub(r"<h3(?![^>]*aria-level)", '<h3 aria-level="2"', sec)
                sec = re.sub(r"<h4(?![^>]*aria-level)", '<h4 aria-level="3"', sec)
                b = b[:j] + sec + b[se:]
    # Links: views -> real URLs; home anchors -> home page on inner pages
    def link(m):
        v = m.group(1)
        if v in SLUG:
            return f'href="/{SLUG[v]}/"'
        if v == "top" or v == "":
            return 'href="/"' if view else m.group(0)
        if v in HOME_ANCHORS and view:
            return f'href="/#{v}"'
        return m.group(0)
    b = re.sub(r'href="#([a-z-]*)"', link, b)
    return geo.prerender(b, view, AREA, PULSE, NEWS)


# ---------------- Google Analytics (website only), loaded only after the visitor accepts ----------------
GA_ID = "GTM-P9B7V4K3"
GA_HEAD = """<script>
(function(){var ID=%s,K="aw-consent";window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
gtag("consent","default",{ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",analytics_storage:"denied"});
function load(){if(window.__ga)return;window.__ga=1;gtag("consent","update",{analytics_storage:"granted"});var s=document.createElement("script");s.async=1;s.src="https://www.googletagmanager.com/gtm.js?id="+ID;document.head.appendChild(s);gtag("js",new Date());}
window.__awLoadGA=load;var c=null;try{c=localStorage.getItem(K)}catch(e){}if(c==="granted")load();})();
</script>""" % json.dumps(GA_ID)
GA_BODY = """<div class="ck" id="ck" hidden role="dialog" aria-live="polite" aria-label="Cookie choice"><p>I use Google Analytics cookies to see which pages and tools help people most. Nothing is shared for ads. <a href="/privacy-policy/#p-collect">Privacy policy</a></p><div class="ck-b"><button type="button" class="btn btn-ghost" data-ck="denied">Decline</button><button type="button" class="btn btn-red" data-ck="granted">Accept</button></div></div>
<style>.ck{position:fixed;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:60;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--ink-2,#151517);color:var(--bone,#F4F1EE);border:1px solid var(--line,#333);border-left:4px solid var(--red,#E0182D);padding:14px 16px;max-width:760px;margin:0 auto;box-shadow:0 10px 40px rgba(0,0,0,.45);font-size:14.5px;line-height:1.45}.ck[hidden]{display:none}.ck p{margin:0;flex:1 1 300px}.ck a{color:inherit}.ck-b{display:flex;gap:10px}.ck .btn{padding:10px 18px}body.ck-on .awb-btn{bottom:calc(var(--ck-h,120px) + 24px)!important}</style>
<script>
(function(){var K="aw-consent",b=document.getElementById("ck"),c=null;try{c=localStorage.getItem(K)}catch(e){}
function show(){b.hidden=false;document.body.classList.add("ck-on");document.documentElement.style.setProperty("--ck-h",b.offsetHeight+"px")}
function hide(){b.hidden=true;document.body.classList.remove("ck-on")}
if(c!=="granted"&&c!=="denied")setTimeout(show,800);
b.addEventListener("click",function(e){var v=e.target.getAttribute&&e.target.getAttribute("data-ck");if(!v)return;try{localStorage.setItem(K,v)}catch(_){}hide();if(v==="granted")window.__awLoadGA();else if(window.gtag)gtag("consent","update",{analytics_storage:"denied"});});
// "Cookie settings" link in the footer
var f=document.querySelector("footer");if(f){var a=document.createElement("button");a.type="button";a.className="ck-link";a.textContent="Cookie settings";a.style.cssText="background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit";a.onclick=show;var host=f.querySelector(".foot-legal, small, p:last-of-type")||f;host.appendChild(document.createTextNode(" \u00b7 "));host.appendChild(a);}
// Key actions (only sent once Analytics is on)
function ev(n,p){if(window.__ga&&window.gtag)gtag("event",n,p||{})}
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a,button");if(!a)return;var h=a.getAttribute("href")||"",t=(a.textContent||"").trim().slice(0,60);
 if(/wa\\.me|whatsapp/i.test(h))ev("whatsapp_click",{link_text:t,page:location.pathname});
 else if(/^tel:/.test(h))ev("phone_click",{page:location.pathname});
 else if(/^mailto:/.test(h))ev("email_click",{page:location.pathname});
 else if(/calendar\\.app\\.google|calendly/i.test(h))ev("book_call_click",{page:location.pathname});
 else if(/talk to ahmed/i.test(t))ev("talk_to_ahmed_click",{page:location.pathname});
 if(a.classList&&a.classList.contains("awb-btn"))ev("assistant_open",{page:location.pathname});},true);
document.addEventListener("submit",function(e){var f=e.target;ev("generate_lead",{form_id:f.id||"form",page:location.pathname});},true);
var used={};document.addEventListener("input",function(e){var v=window.__VIEW||"home";if(used[v]||!e.target.closest||!e.target.closest(".tool-view,.calc,form"))return;used[v]=1;ev("tool_use",{tool:v});},true);
})();
</script>"""
PRIV_OLD = "This site uses no advertising or analytics cookies, tracking pixels or third-party trackers."
PRIV_NEW = ("This site uses no advertising cookies or tracking pixels. If you choose \\u201cAccept\\u201d in the cookie banner, we use Google Analytics "
            "to count visits and see which pages and tools people use: pages viewed, scrolling, time on page, device type, approximate location (city level) and which buttons were tapped. "
            "It doesn't receive your name, number or messages, Google's advertising features are switched off, and if you decline it doesn't load at all. "
            "You can change your choice any time with \\u201cCookie settings\\u201d at the bottom of every page.").encode().decode("unicode_escape")

def page(view):
    title, desc = seo.get(view or "_", (None, None))
    title = title or seo["_"][0]
    desc = desc or home_desc
    path = f"/{SLUG[view]}/" if view else "/"
    canon = URL + path
    ld = [agent_ld]
    if not view and faq_ld:
        ld.append(faq_ld)
    if view:
        crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": URL + "/"},
            {"@type": "ListItem", "position": 2, "name": title.split(" | ")[0], "item": canon}]}
        kind = "Article" if view in GUIDES else ("WebApplication" if view in TOOLS else "WebPage")
        pg = {"@context": "https://schema.org", "@type": kind, "name": title.split(" | ")[0], "headline": title.split(" | ")[0][:110],
              "description": desc, "url": canon, "inLanguage": "en-AE", "image": URL + "/og-image.png",
              "author": {"@type": "Person", "name": "Ahmed Wazir", "url": URL + "/"},
              "publisher": {"@id": URL + "/#agent"}, "dateModified": TODAY}
        if kind == "WebApplication":
            pg.update({"applicationCategory": "FinanceApplication", "operatingSystem": "Any", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "AED"}})
            for k in ("headline", "author", "dateModified"): pg.pop(k, None)
        ld += [f'<script type="application/ld+json">{json.dumps(crumbs, ensure_ascii=False)}</script>\n',
               f'<script type="application/ld+json">{json.dumps(pg, ensure_ascii=False)}</script>\n']
        ld += [f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in geo.extra_ld(view, AREA, URL, canon, TODAY, {"@type": "Person", "name": "Ahmed Wazir", "url": URL + "/", "jobTitle": "Off-plan property consultant, RERA BRN 85446"})]
    head = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canon}">
<meta name="robots" content="{'noindex, follow' if view in NOINDEX else 'index, follow, max-image-preview:large, max-snippet:-1'}">
<meta property="og:url" content="{canon}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{URL}/og-image.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{URL}/og-image.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<!-- google-site-verification: paste the Search Console meta tag here if you verify by HTML tag -->
{head_part.strip().replace('<link rel="stylesheet" href="https://fonts.googleapis.com', '<link rel="stylesheet" media="print" onload="this.media=\'all\'" href="https://fonts.googleapis.com')}
{''.join(ld)}<script>window.__VIEW = {json.dumps(view or "")};</script>
{GA_HEAD}
</head>
<body>
"""
    b = body_for(view).replace(PRIV_OLD, PRIV_NEW)
    b = b.replace('<li><strong>Service providers</strong> that carry our messages, such as WhatsApp (Meta) and our email provider.</li>', '<li><strong>Service providers</strong> that carry our messages, such as WhatsApp (Meta) and our email provider, host this website (Cloudflare) and, if you accept analytics cookies, measure visits (Google Analytics).</li>')
    return head + b + "\n" + GA_BODY + "\n</body>\n</html>\n"

pages = {"": "/"} | {v: f"/{SLUG[v]}/" for v in SLUG}
for v, path in pages.items():
    d = os.path.join(OUT, path.strip("/"))
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(v))

# 404 page: the home page with noindex
nf = page("").replace('content="index, follow, max-image-preview:large, max-snippet:-1"', 'content="noindex"', 1)
nf = nf.replace("<title>", "<title>Page not found · ", 1)
open(os.path.join(OUT, "404.html"), "w", encoding="utf-8").write(nf)

# 6. Crawl files
open(os.path.join(OUT, "robots.txt"), "w").write(geo.robots(URL))
open(os.path.join(OUT, "llms.txt"), "w", encoding="utf-8").write(geo.llms_txt(URL, pages, seo, AREA))
open(os.path.join(OUT, "llms-full.txt"), "w", encoding="utf-8").write(geo.llms_txt(URL, pages, seo, AREA, full=True))
prio = lambda v: "1.0" if not v else ("0.9" if v in ("golden", "laws", "adlaw", "shjlaw", "calc") else "0.7")
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for v, path in pages.items():
    if v in NOINDEX:
        continue
    if v == "privacy":
        pr = "0.3"
    else:
        pr = prio(v)
    sm.append(f"  <url><loc>{URL}{path}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>")
sm.append("</urlset>")
open(os.path.join(OUT, "sitemap.xml"), "w").write("\n".join(sm) + "\n")
host = URL.split("://", 1)[1]
open(os.path.join(OUT, "CNAME"), "w").write(host + "\n")
# Cloudflare Pages: security headers + long cache for hashed assets
open(os.path.join(OUT, "_headers"), "w").write("""/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000

/assets/*
  Cache-Control: public, max-age=31536000, immutable
""")
open(os.path.join(OUT, ".nojekyll"), "w").write("")
json.dump({"name": "Ahmed Wazir · UAE Off-Plan Property", "short_name": "Ahmed Wazir", "start_url": "/", "display": "standalone",
           "background_color": "#0B0B0C", "theme_color": "#0B0B0C",
           "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
                     {"src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]},
          open(os.path.join(OUT, "site.webmanifest"), "w"), indent=1)

# 7. Data, project photos and icons
for sub in ():  # no project data or photos: listings need DLD permits
    if os.path.isdir(os.path.join(SRC_DIR, sub)):
        shutil.copytree(os.path.join(SRC_DIR, sub), os.path.join(OUT, sub))
icons = os.path.join(HERE, "icons")
if os.path.isdir(icons):
    for f in os.listdir(icons):
        shutil.copy(os.path.join(icons, f), os.path.join(OUT, f))
print(f"Built {len(pages)} pages for {URL} into {OUT}")
