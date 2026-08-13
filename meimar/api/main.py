"""The Meimar estimate service.

One endpoint. It exists because the models split categorical features by set
membership, which ONNX tree operators cannot express, so there is no way to run
them in the browser. Estimates for listings that already exist are precomputed
into Parquet instead; this service handles only the case that cannot be
precomputed -- a property the user describes themselves.

Run it with:
    uvicorn api.main:app --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Final

from fastapi import FastAPI, HTTPException

from api.predict import LoadedModel, estimate_price, is_unknown, load_model, market_for
from api.schemas import EstimateRequest, EstimateResponse, ServiceDistance
from api.services import ServicesIndex

PROJECT_ROOT: Final[Path] = Path(__file__).resolve().parent.parent
MODELS_DIR: Final[Path] = PROJECT_ROOT / "models"
POI_FEATURES: Final[Path] = PROJECT_ROOT / "data_enriched" / "poi_features.parquet"

# Populated at startup. Loading two boosters costs about 120 MB and a second of
# disk, which is worth paying once rather than on every request.
STATE: dict[str, object] = {}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    STATE["built"] = load_model(MODELS_DIR, "built")
    STATE["land"] = load_model(MODELS_DIR, "land")
    STATE["services"] = ServicesIndex(POI_FEATURES)
    yield
    STATE.clear()


app = FastAPI(title="Meimar estimate service", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, object]:
    """Report what is loaded, and the accuracy of each model as measured."""
    return {
        "status": "ok",
        "models": {
            name: {
                "median_error_pct": model.med_ape,
                "interval": [model.interval_low, model.interval_high],
            }
            for name, model in STATE.items()
            if isinstance(model, LoadedModel)
        },
    }


@app.post("/api/estimate", response_model=EstimateResponse)
def estimate(request: EstimateRequest) -> EstimateResponse:
    """Price one described property, with the services score for its location.

    The estimate answers "what do comparable listings ask?", not "what is this
    worth?" -- both models are fitted on advertised asking prices, never on
    completed transactions. Callers must present it that way.
    """
    market = market_for(request.estate_type)
    model = STATE.get(market)
    if not isinstance(model, LoadedModel):
        raise HTTPException(status_code=503, detail=f"model '{market}' is not loaded")

    payload = request.model_dump()
    value, low, high = estimate_price(payload, model, request.area_m2)

    services: list[ServiceDistance] | None = None
    if request.lat is not None and request.lng is not None:
        index = STATE.get("services")
        if isinstance(index, ServicesIndex):
            services = [
                ServiceDistance(**entry)
                for entry in index.describe_point(request.lat, request.lng)
            ]

    return EstimateResponse(
        estimate=round(value),
        estimate_low=round(low),
        estimate_high=round(high),
        market=market,
        unknown_city=is_unknown(request.city, model.categories["city"]),
        unknown_district=is_unknown(request.district, model.categories["district"]),
        services=services,
    )
