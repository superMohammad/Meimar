# Meimar (معمار)

Map-first browsing, location intelligence and price estimates over 781,382
Saudi property listings.

## Running it

The app cannot start without its generated data — together about 300 MB, so
none of it is committed. From a fresh checkout:

```bash
pnpm install

# 1. POI enrichment. Needs data_raw/shp/ (see below). ~5 min.
pnpm data:enrich

# 2. Fit the two valuation models and score every listing out-of-fold.
#    Needs a CUDA GPU. ~4 min on an RTX 3090.
pnpm data:train

# 3. Emit the Parquet files the browser reads. ~2 min.
pnpm data:build

# 4. District outlines for the price layer. ~1 min.
pnpm data:polygons

pnpm dev            # the app, on :3111 by default
pnpm api            # the estimate service, on :8000
```

Steps 1–3 run on the sibling project's virtualenv
(`../Saudi_REAL_ESTATE_PROJECT/.venv`), which already has DuckDB, GeoPandas,
XGBoost and the CUDA stack. They read
`../Saudi_REAL_ESTATE_PROJECT/data/real_estate_final.parquet`.

The estimate service uses its own lightweight venv, deliberately without CUDA:

```bash
python3 -m venv .venv-api && .venv-api/bin/pip install -e .
```

### The OSM extract

`pnpm data:enrich` expects Geofabrik shapefiles unzipped into `data_raw/shp/`:

```bash
mkdir -p data_raw && curl -L -o data_raw/gcc-states-free.shp.zip \
  https://download.geofabrik.de/asia/gcc-states-latest-free.shp.zip
unzip -q -o data_raw/gcc-states-free.shp.zip \
  'gis_osm_pois_free_1.*' 'gis_osm_pois_a_free_1.*' \
  'gis_osm_pofw_free_1.*' 'gis_osm_pofw_a_free_1.*' -d data_raw/shp/
```

Geofabrik publishes no standalone Saudi extract; `gcc-states` covers Saudi plus
five neighbours, which is what border cities need anyway.

## What the browser downloads

There is no tile server and no listings API. DuckDB-WASM range-reads three
static Parquet files out of `public/data`:

| File | Size | Read pattern |
|---|---|---|
| `map.parquet` | 22 MB | Every map and filter query. |
| `details.parquet` | 155 MB | One row group (~1.5 MB) per pin click, never whole. |
| `districts.parquet` | 126 KB | Loaded eagerly. |

This depends on the host answering HTTP `Range` with `206 Partial Content`.
Next.js's static handler does; verify it survives any change to how these files
are served, because the fallback is a 155 MB download per click.

## Valuation

Two purpose-specific XGBoost models, measured out-of-fold:

| market | target | median error | within 10% | R²(log) |
|---|---|---|---|---|
| built (sale) | `log1p(price)` | 10.3% | 48.8% | 0.868 |
| land (sale) | `log1p(price/m²)` | 13.4% | 40.2% | 0.870 |

600,941 of 781,382 listings carry an estimate. Rentals never do — both models
are sale-only — and neither do the 5,284 sale listings priced outside the
bounds the models were fitted on.

**Estimates are precomputed, not run in the browser.** The models split `city`
and `district` by category set membership, and ONNX's tree operators express
only scalar comparisons, so these boosters cannot be converted. That is fine
for listings, whose features never change; only the free-form estimator needs a
live model, and that is what `api/` serves.

**Every precomputed estimate is out-of-fold.** A model that trained on a
listing predicts it too well, which would make most listings look fairly priced
purely because they were training rows. Each listing is predicted by a fold
that never saw it.

## Known data limits

- **Prices are asking prices**, not closed transactions, and the models are
  fitted on them. An estimate answers "what do comparable listings ask?", never
  "what is this worth?". Stated in the UI and on `/methodology`.
- **Only four amenity categories are shown**, and there is no composite score.
  Distances are measured to a facility's real geometry, but OpenStreetMap maps
  landmarks well and everyday density badly. Measured against plausible urban
  reality:

  | category | measured median | reality | kept |
  |---|---|---|---|
  | mosque | 480 m | ~300 m | yes |
  | hospital | 2,195 m | ~1–2 km | yes |
  | mall | 3,189 m | ~3 km | yes |
  | university | 4,672 m | ~5 km | yes |
  | park | 1,152 m | ~400 m | no, 3× |
  | school | 1,521 m | ~500 m | no, 3× |
  | supermarket | 1,256 m | ~300 m | no, 4× |
  | cafe / gym | 1,691 / 2,803 m | ~500 m / ~1 km | no, 3× |

  The categories users care most about are the ones OSM cannot support.
  Restoring them needs a different source, not more code.
- **Price per m² is always segmented by property type.** In حي الملقا the median
  runs 1,432 SAR/m² for a store, 7,000 for land, 8,158 for an apartment and
  12,333 for a villa. The map layer refuses to draw without a type selected,
  because an unsegmented figure maps listing mix rather than price.
- **District outlines are derived from listing positions**, not municipal
  boundaries — OSM place polygons match only 129 of 1,114 district names.
  Outlines above 300 km² are dropped: in rural municipalities a few scattered
  listings produce hulls up to 15,660 km², which are not neighborhoods.
- **Districts are keyed on `(city, district)`**, never the name alone: 1,114
  distinct names cover 1,979 real pairs.
- Districts under 10 listings render as "بيانات غير كافية" instead of a median.
  The 10th-percentile district has three listings.
- The training frame is rebuilt from source rather than read from
  `SELL_REAL_ESTATE_FOR_MODELING.parquet`, which carries no listing id. Its row
  set therefore differs slightly from `notebook/Modeling_Report.ipynb`, which is
  why accuracy is re-measured here rather than quoted from it.
