#!/usr/bin/env python3
"""Sync the AWaz Realty app with the website.

Usage:  python3 tools/sync_from_site.py <website.html> [docs_dir]

Reads the published website HTML (the claude.ai artifact) and writes:
  docs/site.html  the website itself, in "app mode" (no site header/footer,
                  views open on their own, links routed to the phone)
  docs/data.js    window.APPDATA: launches, FX, market pulse, ticker, news,
                  videos and buyer rules, taken from the site's data blocks
  docs/sw.js      offline cache, with a fresh version stamp so phones update

Nothing else in the repo is touched. Needs Node.js (to read the PROJECTS list).
"""
import datetime, hashlib, json, os, re, subprocess, sys, tempfile

BLOCKS = ["rules-data", "fx-data", "pulse-data", "video-data", "ticker-data", "news-data"]

APP_HEAD = r"""<meta name="robots" content="noindex">
<style id="awaz-app-mode">
html.app body::before, html.app .nav, html.app footer, html.app .back { display: none !important; }
html.app .tool-view > .wrap, html.app .dev-view > .wrap, html.app .map-view > .wrap { padding-top: 12px !important; }
html.app-only main#top > section:not(.app-keep) { display: none !important; }
html.app-only main#top > section.app-keep { border-top: 0; padding-top: 16px; }
</style>
<script>
(function () {
  var q = new URLSearchParams(location.search);
  if (q.get("app") !== "1") return;
  var root = document.documentElement; root.classList.add("app");
  var only = q.get("only"); if (only) root.classList.add("app-only");
  function post(msg) { try { parent.postMessage(Object.assign({ awaz: 1 }, msg), "*"); } catch (e) {} }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
    var href = a.getAttribute("href");
    if (href === "#top" || href === "#") { if (href === "#top") { e.preventDefault(); post({ type: "close" }); } return; }
    if (href.charAt(0) === "#") return;
    var url = a.href;
    if (/^(https?:|mailto:|tel:|sms:|whatsapp:|intent:)/i.test(url) && !(url.indexOf(location.origin) === 0)) { e.preventDefault(); post({ type: "open", url: url }); }
  }, true);
  window.addEventListener("hashchange", function () { post({ type: "route", hash: location.hash }); });
  document.addEventListener("DOMContentLoaded", function () {
    if (only) { var s = document.getElementById(only); if (s) s.classList.add("app-keep"); }
    var tab = q.get("tab");
    if (tab) setTimeout(function () { var t = document.querySelectorAll(".tk-tabs [role=tab]")[+tab - 1]; if (t) t.click(); }, 0);
    var proj = q.get("proj");
    if (proj) setTimeout(function () {
      var sel = document.getElementById("c-proj"); if (!sel) return;
      for (var i = 0; i < sel.options.length; i++) if (sel.options[i].text.indexOf(proj) === 0) { sel.value = sel.options[i].value; sel.dispatchEvent(new Event("change", { bubbles: true })); break; }
    }, 400);
    post({ type: "ready", title: document.title });
  });
})();
</script>
"""


def extract_projects(html):
    m = re.search(r"const PROJECTS = (\[.*?\n\]);", html, re.S)
    if not m:
        sys.exit("Could not find the PROJECTS list in the website")
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write("process.stdout.write(JSON.stringify(" + m.group(1) + "));")
        path = f.name
    try:
        out = subprocess.run(["node", path], capture_output=True, text=True, check=True).stdout
    finally:
        os.unlink(path)
    return json.loads(out)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    docs = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")
    html = open(src, encoding="utf-8").read()

    data = {}
    for b in BLOCKS:
        m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % re.escape(b), html, re.S)
        if not m:
            sys.exit("Missing data block: " + b)
        data[b.replace("-data", "")] = json.loads(m.group(1))
    data["projects"] = extract_projects(html)
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=4)))
    data["synced"] = now.strftime("%Y-%m-%d %H:%M")

    # Website copy in app mode
    site = re.sub(r'<meta name="robots"[^>]*>', "", html, count=1)
    i = site.find("<title>")
    if i < 0:
        i = site.find("<body>") + len("<body>")
    site = site[:i] + APP_HEAD + site[i:]
    open(os.path.join(docs, "site.html"), "w", encoding="utf-8").write(site)

    js = "window.APPDATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(os.path.join(docs, "data.js"), "w", encoding="utf-8").write(js)

    # New cache version whenever content changes
    h = hashlib.sha1()
    for name in sorted(os.listdir(docs)):
        p = os.path.join(docs, name)
        if os.path.isfile(p) and name != "sw.js":
            h.update(open(p, "rb").read())
    ver = h.hexdigest()[:10]
    tpl = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sw.template.js")
    sw = open(tpl, encoding="utf-8").read().replace("__VERSION__", ver)
    open(os.path.join(docs, "sw.js"), "w", encoding="utf-8").write(sw)

    print(f"Synced {len(data['projects'])} launches, {len(data['news'].get('items', []))} headlines, FX {data['fx'].get('date')}, version {ver}")


if __name__ == "__main__":
    main()
