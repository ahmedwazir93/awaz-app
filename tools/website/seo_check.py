#!/usr/bin/env python3
"""SEO check for the built site. Runs after every build; exits 1 on any error.

usage: python3 build/seo_check.py dist https://www.awazrealty.com

Checks Google's basics on every page: title, meta description, canonical,
hreflang pairs, one h1, lang, viewport, robots, Open Graph and Twitter tags,
valid JSON-LD, image alt text, internal links, sitemap and robots.txt.
"""
import json, os, re, sys, html
from urllib.parse import urlparse

out, base = sys.argv[1], sys.argv[2].rstrip("/")
errors, warns = [], []
E = lambda page, msg: errors.append(f"{page}: {msg}")
W = lambda page, msg: warns.append(f"{page}: {msg}")


def pages():
    for root, _, files in os.walk(out):
        for f in files:
            if f == "index.html":
                rel = os.path.relpath(root, out).replace(os.sep, "/")
                yield ("/" if rel == "." else f"/{rel}/"), os.path.join(root, f)


def attr(tag, name):
    m = re.search(rf'\b{name}="([^"]*)"', tag)
    return html.unescape(m.group(1)) if m else None


def head_of(s):
    i = s.find("</head>")
    return s[:i] if i > 0 else s


def text_len(t):
    return len(re.sub(r"\s+", " ", html.unescape(t)).strip())


# ---------- sitemap and robots ----------
sm = open(os.path.join(out, "sitemap.xml"), encoding="utf-8").read()
in_sitemap = set(re.findall(r"<loc>([^<]+)</loc>", sm))
robots = open(os.path.join(out, "robots.txt"), encoding="utf-8").read()
if f"Sitemap: {base}/sitemap.xml" not in robots:
    E("robots.txt", "does not point to the sitemap")
for block in re.split(r"\n\s*\n", robots):
    if re.search(r"User-agent:\s*(\*|Googlebot)\s*$", block, re.M) and re.search(r"^Disallow:\s*/\s*$", block, re.M):
        E("robots.txt", "blocks Google from the whole site")

titles, descs, built = {}, {}, set()
for url, path in sorted(pages()):
    s = open(path, encoding="utf-8").read()
    h = head_of(s)
    full = base + url
    built.add(full)

    robots_meta = re.search(r'<meta name="robots" content="([^"]*)"', h)
    noindex = bool(robots_meta and "noindex" in robots_meta.group(1))
    if noindex and full in in_sitemap:
        E(url, "is noindex but listed in the sitemap")
    if not noindex and full not in in_sitemap:
        E(url, "indexable page missing from the sitemap")

    # title and description
    t = re.search(r"<title>([^<]*)</title>", h)
    if not t:
        E(url, "no <title>")
    else:
        n = text_len(t.group(1))
        if n < 15 or n > 70: W(url, f"title is {n} characters (aim for 15-70)")
        titles.setdefault(t.group(1).strip(), []).append(url)
    d = re.search(r'<meta name="description" content="([^"]*)"', h)
    if not d:
        E(url, "no meta description")
    else:
        n = text_len(d.group(1))
        if n < 70 or n > 170: W(url, f"description is {n} characters (aim for 70-170)")
        descs.setdefault(d.group(1).strip(), []).append(url)

    # canonical, lang, viewport
    c = re.search(r'<link rel="canonical" href="([^"]+)"', h)
    if not c: E(url, "no canonical")
    elif c.group(1) != full: E(url, f"canonical points to {c.group(1)}")
    lang = re.search(r'<html[^>]*\blang="([^"]+)"', s)
    if not lang: E(url, "no lang on <html>")
    if 'name="viewport"' not in h: E(url, "no viewport meta")
    if '<meta charset' not in h.lower(): E(url, "no charset meta")

    # hreflang: en, ar and x-default, each pointing to a built page
    alts = dict(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', h))
    # pages with an Arabic version need the full en / ar / x-default set
    twin = url[3:] if url.startswith("/ar/") else "/ar" + url
    has_twin = os.path.isfile(os.path.join(out, twin.lstrip("/"), "index.html"))
    if (has_twin or alts) and not noindex:
        for k in ("en", "ar", "x-default"):
            if k not in alts: E(url, f"missing hreflang {k}")
        own = "ar" if url.startswith("/ar/") else "en"
        if alts.get(own) and alts[own] != full: E(url, f"hreflang {own} is not self-referencing")

    # social cards
    for prop in ("og:title", "og:description", "og:image", "og:url"):
        if f'property="{prop}"' not in h: E(url, f"no {prop}")
    if 'name="twitter:card"' not in h: W(url, "no twitter:card")

    # one h1
    h1 = len(re.findall(r"<h1[\s>]", s))
    if h1 != 1: E(url, f"{h1} <h1> tags (should be exactly 1)")

    # structured data parses
    for j in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try: json.loads(j)
        except Exception as e: E(url, f"invalid JSON-LD: {e}")

    # images need alt text, and must not be missing
    for img in re.findall(r"<img\b[^>]*>", s):
        if attr(img, "alt") is None: E(url, f"image without alt: {img[:80]}")

    # internal links point to pages that exist
    for href in set(re.findall(r'<a\b[^>]*\bhref="([^"#?]+)', s)):
        if href.startswith(base): href = href[len(base):] or "/"
        if not href.startswith("/") or href.startswith("//"): continue
        p = urlparse(href).path
        target = os.path.join(out, p.lstrip("/"))
        if not (os.path.isfile(target) or os.path.isfile(os.path.join(target, "index.html"))):
            E(url, f"broken internal link {href}")

    if "http://" in re.sub(r'xmlns[^=]*="http://[^"]*"|http://www\.w3\.org[^"\s]*|http://schema\.org[^"\s]*', "", h):
        W(url, "insecure http:// reference in <head>")
    if os.path.getsize(path) > 3_000_000: W(url, "HTML over 3 MB")

for v, us in titles.items():
    if len(us) > 1: E(", ".join(us), f"duplicate title \"{v}\"")
for v, us in descs.items():
    if len(us) > 1: E(", ".join(us), "duplicate meta description")
for u in sorted(in_sitemap - built):
    E("sitemap.xml", f"lists {u}, which is not built")

print(f"SEO check: {len(built)} pages, {len(in_sitemap)} sitemap URLs, {len(errors)} errors, {len(warns)} warnings")
for w in warns: print("  warn ", w)
for e in errors: print("  ERROR", e)
sys.exit(1 if errors else 0)
