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
    "laws": "dubai-real-estate-law", "adlaw": "abu-dhabi-real-estate-law", "abroad": "buy-uae-property-from-india",
    "buyabroad": "buy-uae-property-from-abroad", "from-pakistan": "buy-dubai-property-from-pakistan",
    "from-saudi": "buy-dubai-property-from-saudi-arabia", "from-uk": "buy-dubai-property-from-uk",
    "from-us": "buy-dubai-property-from-usa", "planner": "off-plan-due-diligence-checklist",
    "sell": "sell-off-plan-property",
    "prices": "dubai-property-prices-by-area", "charges": "dubai-service-charges-by-area", "rents": "dubai-rent-by-area",
    "stress": "off-plan-stress-test", "afford": "dubai-property-budget-from-abroad", "verify": "verify-off-plan-project-dubai",
    "compare": "dubai-vs-global-property-markets",
}
# Guides get Article schema, calculators get WebApplication schema
GUIDES = {"why", "golden", "laws", "adlaw", "abroad", "buyabroad", "from-pakistan", "from-saudi", "from-uk", "from-us", "developers", "prices", "charges", "rents", "verify", "compare"}
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
import rcssmin, rjsmin
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
js = rjsmin.jsmin(js)
js_name = f"assets/js/site.{h8(js.encode())}.js"
open(os.path.join(OUT, js_name), "w", encoding="utf-8").write(js)
s = s[:main_js.start()] + f'<script src="/{js_name}"></script>' + s[main_js.end():]

# 3b. AI assistant widget -> its own cached file (preview mode until data-endpoint is set)
wm = re.search(r'<script id="awb-widget" data-endpoint="([^"]*)">(.*?)</script>', s, re.S)
if wm:
    wjs = rjsmin.jsmin(wm.group(2))
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
            label = f'<span class="vh-k">{kw}</span>' if kw and kw.lower() not in re.sub("<[^>]+>", "", inner).lower() else ""
            b = b[:j] + '<h1 class="vh"' + b[j + 3:gt + 1] + label + inner + "</h1>" + b[k + 5:]
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
</head>
<body>
"""
    return head + body_for(view) + "\n</body>\n</html>\n"

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
prio = lambda v: "1.0" if not v else ("0.9" if v in ("golden", "laws", "adlaw", "calc") else "0.7")
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
