# Live website build

`build_site.py` turns the website (the single-page claude.ai artifact) into the
Google-ready version for a real domain: one URL per guide and calculator, per-page
titles, descriptions, canonical URLs, Open Graph and schema, sitemap.xml, robots.txt,
404 page, icons and share image, minified CSS/JS and WebP images.

    python3 tools/website/build_site.py <website.html> <out_dir> --url https://www.yourdomain.com

`<website.html>` must sit next to the website's `data/` and `img/` folders
(the Property search data and project photos). Needs Pillow, rcssmin and rjsmin.
Upload the contents of `<out_dir>` to the hosting (GitHub Pages repo root).
