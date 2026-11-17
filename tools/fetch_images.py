#!/usr/bin/env python3
"""Download the project images in tools/images.json ({id: url}) into docs/img/r<id>.webp, 720px wide."""
import io, json, os, concurrent.futures as cf
import requests
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "img")
os.makedirs(OUT, exist_ok=True)
items = json.load(open(os.path.join(ROOT, "tools", "images.json")))

def get(item):
    pid, url = item
    dest = os.path.join(OUT, f"r{pid}.webp")
    if os.path.exists(dest):
        return "skip"
    try:
        r = requests.get(url, timeout=40)
        r.raise_for_status()
        im = Image.open(io.BytesIO(r.content)).convert("RGB")
        if im.width > 720:
            im = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
        im.save(dest, "WEBP", quality=70, method=6)
        return "ok"
    except Exception as e:
        print(pid, "failed:", e)
        return "fail"

with cf.ThreadPoolExecutor(8) as ex:
    res = list(ex.map(get, items.items()))
print({k: res.count(k) for k in set(res)})
