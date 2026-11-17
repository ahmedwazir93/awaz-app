#!/usr/bin/env python3
"""Build docs/reelly.js (the app's live off-plan catalogue) from Reelly search results.

Usage:  python3 tools/build_reelly.py <out.js> <result file> [<result file> ...]

Each result file is the output of the Reelly `search_projects` tool (raw JSON, or
JSON with some text before/after it, as saved by Claude when a result is large).
Projects found in several files are merged. A file whose name contains "eoi",
"start" or "announced" marks its projects as new launches.
"""
import datetime, json, os, re, sys

# The developers Ahmed works with (same list as the website's developer logos). Only these are kept.
PARTNER_KEYS = ["emaar", "nakheel", "meraas", "wasl", "imtiaz", "damac", "modon", "aldar", "beyond", "omniyat",
                "reportage", "azizi", "sobha", "binghatti", "ellington", "eagle hills", "alef", "majid al futtaim",
                "cosmo", "samana", "danube"]
PARTNER_RE = re.compile(r"\b(" + "|".join(re.escape(k) for k in PARTNER_KEYS) + r")\b", re.I)
DEV_NAMES = {"ALDAR": "Aldar", "Imtiaz Development": "Imtiaz", "Modon Properties": "Modon",
             "Beyond Developments": "Beyond", "Reportage Properties": "Reportage"}


def emirate(region):
    r = (region or "").lower()
    for k, v in [("dubai", "Dubai"), ("abu dhabi", "Abu Dhabi"), ("sharjah", "Sharjah"), ("ajman", "Ajman"),
                 ("khaimah", "Ras Al Khaimah"), ("umm al", "Umm Al Quwain"), ("fujairah", "Fujairah")]:
        if k in r:
            return v
    return None


def first_sentence(overview):
    t = re.sub(r"#+[^\n]*\n", "", overview or "").strip()
    t = t.split("\n")[0].strip()
    m = re.match(r"(.{40,260}?[.!?])(\s|$)", t)
    return (m.group(1) if m else t[:220]).strip()


def load(path):
    t = open(path, encoding="utf-8").read()
    return json.loads(t[t.find("{"): t.rfind("}") + 1]).get("results", [])


def r0(x):
    return int(round(x)) if x else 0


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    out, files = sys.argv[1], sys.argv[2:]
    seen = {}
    for f in files:
        fresh = any(k in os.path.basename(f).lower() for k in ("eoi", "start", "announced", "inline"))
        for p in load(f):
            loc = p.get("location") or {}
            em = emirate(loc.get("region"))
            if not em:
                continue  # outside the UAE
            # Off-plan only, from partner developers: skip completed/ready projects and everyone else
            if not PARTNER_RE.search(p.get("developer") or ""):
                continue
            if p.get("construction_status_display") == "Completed" or ((p.get("completion_datetime") or "9")[:7] < datetime.date.today().strftime("%Y-%m")):
                continue
            done = (p.get("completion_datetime") or "")[:7]
            rec = {
                "id": p["id"],
                "n": p["name"].strip(),
                "d": DEV_NAMES.get(p.get("developer"), p.get("developer") or ""),
                "em": em,
                "a": (loc.get("sector") if loc.get("sector") and loc.get("sector") not in ("Abu Dhabi", "Dubai") else loc.get("district")) or "",
                "ll": [round(loc.get("longitude") or 0, 4), round(loc.get("latitude") or 0, 4)],
                "p": [r0(p.get("min_price")), r0(p.get("max_price"))],
                "s": [r0(p.get("min_size")), r0(p.get("max_size"))],
                "b": [p.get("min_bedrooms"), p.get("max_bedrooms")],
                "t": p.get("available_unit_types_display") or [],
                "h": done,
                "ss": p.get("sale_status_display") or "",
                "cs": p.get("construction_status_display") or "",
                "img": ((p.get("cover_image") or {}).get("url")) or "",
                "u": p.get("url") or "",
                "x": first_sentence(p.get("overview")),
                "pt": 1,
                "new": 1 if fresh or p.get("sale_status_display") in ("Presale (EOI)", "Start of Sales", "Announced") else 0,
            }
            old = seen.get(rec["id"])
            if old:
                rec["new"] = max(rec["new"], old["new"])
            seen[rec["id"]] = rec
    items = sorted(seen.values(), key=lambda r: (-r["new"], -r["pt"], -r["id"]))
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=4))).strftime("%Y-%m-%d")
    data = {"updated": now, "source": "Reelly", "items": items}
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("window.REELLY = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"{len(items)} projects ({sum(i['new'] for i in items)} new launches, {sum(i['pt'] for i in items)} from partner developers) -> {out}")


if __name__ == "__main__":
    main()
