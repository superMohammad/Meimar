<div align="center">

<h1>معمار · Meimar</h1>

**A price and location intelligence engine for Saudi real estate.**

**English** · [العربية](README.ar.md)

![Next.js](https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=nextdotjs)
![DuckDB](https://img.shields.io/badge/DuckDB-WASM-FFF000?style=flat-square&logo=duckdb&logoColor=000)
![XGBoost](https://img.shields.io/badge/XGBoost-models-b08968?style=flat-square)
![Leaflet](https://img.shields.io/badge/Leaflet-maps-199900?style=flat-square&logo=leaflet)

</div>

---

Most property sites show you what a place costs. Meimar shows you whether that
price makes sense — and what living there would actually be like.

It puts **781,382 listings** across **97 Saudi cities** on one map, and for
**600,941** of them it also shows an estimate of what comparable properties are
asking. Open any listing and you can see how far it sits from the nearest
mosque, hospital, mall or university.

<div align="center">

![A tour of the map](docs/images/map-tour.gif)

</div>

---

## Have a look

Zoom out and the whole country is a heat map of where the market is busy. Zoom
in and every property becomes a pin with its price on it.

![The map at street level](docs/images/app-map.jpg)

Click a pin and the panel tells you the story of that property: the asking
price, our estimate beside it, and how far it sits above or below comparable
listings. The dotted circle on the map is the walking radius you selected.

![A listing with its price estimate](docs/images/app-listing.jpg)

Own a property, or thinking of buying one? Describe it and get an estimate
without a listing at all.

![The estimate page](docs/images/app-estimate.png)

Every neighborhood also gets its own page — how many properties are listed
there and what the typical price looks like.

![A district page](docs/images/app-district.png)

The whole site works in Arabic and English, right-to-left included.

![The Arabic interface](docs/images/app-listing-ar.jpg)

---

## What the data says

Before any of this was built, the listings were explored to find out what the
Saudi market actually looks like. A few of those findings:

**Riyadh is the market.** It holds more listings for sale than every other city
in the country put together.

![Listings per city](docs/images/eda-cities-bar.png)

**And it is where the supply sits.** Each bubble is a city, sized by how many
properties are for sale there.

![Where supply is concentrated](docs/images/eda-supply-map.png)

**Price is a matter of address.** The most expensive neighborhoods in Riyadh
ask roughly three times what the cheapest ones do, per square meter.

![Riyadh's most expensive districts](docs/images/eda-expensive-districts-bar.png)

**And the split is geographic.** North and west of the city lean expensive, south
and east lean affordable — a pattern you can see in a single picture.

![Riyadh's price split](docs/images/eda-riyadh-price-map.png)

---

## How to use it

1. **Open the map.** Pick what you're after — for sale or for rent, villa, apartment or land — and set your price and size range.
2. **Zoom to a neighborhood.** Prices appear directly on the map, so you can compare streets at a glance.
3. **Click any property.** You get its details, the price estimate, and the services nearby at 500 m, 1 km or 2 km.
4. **Or estimate your own.** Describe a property on the estimate page and get a number back, with the range it could reasonably fall in.

---

## How it's built

The unusual part: **almost everything runs in your browser.** There's no server
querying a database behind the scenes. The listings travel to you as compressed
files, and the filtering, the maps and the statistics all happen on your own
machine. That's what makes it fast at this size.

| Piece | What it does |
|---|---|
| **Next.js + React** | The site itself, in Arabic and English |
| **Leaflet + OpenStreetMap** | The map, from country view down to individual streets |
| **DuckDB-WASM + Parquet** | Searches 781,382 listings inside the browser |
| **XGBoost** | The price models |
| **FastAPI** | The small service behind free-form estimates |
| **Gemma (via Ollama)** | Read the Arabic listing text to recover missing details |

### The models

Two models, because land and buildings behave differently and one model would
be worse at both:

| Model | Covers | Typical error |
|---|---|---|
| **Built properties** | Villas, apartments, buildings, floors | 10.3% |
| **Land** | Plots, priced by the square meter | 13.4% |

Each is measured only on listings it never saw during training, so the accuracy
above is what you'd get on a new property rather than a flattering number.

Location matters to those models, so every listing was matched against
OpenStreetMap to work out how far it sits from real facilities nearby.

### One honest note

**These are asking prices, not sale prices.** Saudi Arabia does not publish what
properties actually sold for, so an estimate here answers *"what are comparable
properties asking?"* — not *"what is this worth?"*. The site says so wherever a
number appears, and so do we.

---

## Repository

| Folder | Contents |
|---|---|
| [`meimar/`](meimar) | The web application, the estimate service and the trained models |
| [`Saudi_REAL_ESTATE_PROJECT/`](Saudi_REAL_ESTATE_PROJECT) | Data preparation, exploration notebooks and the text-extraction pipeline |

Setup instructions live in [`meimar/README.md`](meimar/README.md). The app needs
its data files generated first — they're too large to keep in the repository.

---

<div align="center">
<sub>Built with a five-color palette, the Thmanyah typeface, and a lot of listings.</sub>
</div>
