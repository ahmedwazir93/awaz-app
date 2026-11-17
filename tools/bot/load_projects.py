#!/usr/bin/env python3
"""Turn a private projects.json (from Ahmed's desk) into SQL for D1.
Usage: python3 load_projects.py projects.json > projects.sql
       npx wrangler d1 execute ahmed-assistant --remote --file projects.sql
Never commit projects.json or projects.sql: public project prices need a DLD permit."""
import json, sys
d = json.load(open(sys.argv[1]))
q = lambda v: "NULL" if v is None else (str(v) if isinstance(v, (int, float)) else "'" + str(v).replace("'", "''") + "'")
print("DELETE FROM projects;")
for p in d.get("projects", d):
    row = [p.get("id"), p.get("n"), p.get("d"), p.get("em"), p.get("a"), json.dumps(p.get("t") or []), p.get("h"), p.get("ss"), p.get("cs"),
           p.get("p0"), p.get("p1"), p.get("s0"), p.get("s1"), p.get("b0"), p.get("b1"), p.get("ua"), p.get("tu"), p.get("esc"), p.get("dld"), p.get("cp"), p.get("ov")]
    print("INSERT INTO projects VALUES (" + ",".join(q(v) for v in row) + ");")
