Deliver what was asked Always use the suitable skill for the task, at the scope intended. Make routine judgment calls yourself, and check in only when different readings of the request would lead to materially different work. If the request seems mistaken or a better approach exists, say so in a sentence and continue with the task as asked rather than quietly narrowing, widening, or transforming it. Finish the whole task, and stop short of actions that are clearly beyond what was asked.


### About the Project
'''Miemar (معمار) — Project Goal

Build a Saudi real estate platform that mirrors what Aqar, Sanadak, and Bayut do well, and adds a valuation and location-intelligence layer none of them provide.

Map
Map-first interface (Leaflet + OpenStreetMap) over ~810K listings using existing lat/lon. Pins are a single unified color and display the advertised listing price — no predictive coloring. Rendering scales by zoom: H3 hexagons when zoomed out, individual pins at street level.

Location intelligence
Every listing enriched offline (BallTree over an OSM PBF extract) with distance to nearest school, hospital, mosque, supermarket, café, gym, park, university, and mall, plus service counts within 500m/1km/2km. Surfaced as a 0–100 services score with an interactive radius circle.

Valuation
A family of purpose-specific XGBoost models rather than one general model:

built properties for sale — log1p(price)

land for sale — log1p(price/m²)

Served as ONNX in-browser for existing listings; a server endpoint handles free-form estimates where POI features must be computed on the fly.

Runs in the browser
Leaflet rendering, DuckDB-WASM for filtering and aggregation over Parquet, ONNX inference, services score, affordability and rental-yield calculators. The backend stays thin: tiles, listing details, LLM.

LLM (Gemma, server-side)

Online with function calling: parse Saudi-dialect queries into structured filters, and call platform functions — get_district_stats, estimate_price, find_listings, compute_yield — so the model retrieves and fills real numbers instead of generating them. Constrained JSON output with a deterministic fallback to standard search.

Borrowed from competitors
Map-first browsing (Sanadak), distance/commute search and affordability calculator (Bayut), neighborhood rating cards and per-district SEO pages (Aqar).

Positioning
Not another listing board — a price and location intelligence engine. Estimates derive from asking prices, not closed transactions, and this is stated plainly.'''

#### use the project "../Saudi_REAL_ESTATE_PROJECT_COPY" there is a link between them.
#### color palettes as identity of the project
'''
["#ede0d4","#e6ccb2","#ddb892","#b08968","#7f5539"]
'''
#### use grillme after planing.
#### use icons , and `Thamanyah` fonts. 
#### use ponytail skills before writing any code.
#### simplicity over complexity.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
