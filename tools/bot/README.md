# Ahmed's AI assistant

Built and switched off. Turning it on needs the paid and account steps below.

| File | What it is |
| --- | --- |
| `rules.md` | The bot's rules. The same text runs in the private desk's test console and in the live bot. |
| `worker.js` | Backend (Cloudflare Worker): chat via Anthropic's API with project tools, form leads, owner-only lead API, meeting alerts by email, 12-month auto-delete. |
| `schema.sql` | Database tables (Cloudflare D1). |
| `load_projects.py` | Loads the private project file into the database. The project file is never committed: public project prices need a DLD permit. |
| `widget.js` | Chat bubble for the website and app: consent first, four languages, voice input through the browser (no paid speech service). Shows nothing until an endpoint is set. |
| `privacy-ai.md` | Privacy policy section to add when the chat goes live. |

## Go-live (Claude does these with you)
1. Springfield compliance signs off the rules and the Abu Dhabi hand-off; name the Abu Dhabi colleague.
2. Reelly confirms in writing that the data may be used in a public assistant.
3. Anthropic API key; Cloudflare account (free tier).
4. `npx wrangler d1 create ahmed-assistant`, then `npx wrangler d1 execute ahmed-assistant --remote --file schema.sql`.
5. Load projects: `python3 load_projects.py projects.json > projects.sql` and execute it the same way.
6. `cp wrangler.toml.example wrangler.toml`, fill in, `npx wrangler secret put ANTHROPIC_API_KEY`, `npx wrangler deploy`.
7. Protect `/api/*` with Cloudflare Access (only your email), point the desk at it.
8. Add the privacy section, then the widget script tag (with `data-endpoint`) to the website and app, and set the website form endpoint to `/lead`.
