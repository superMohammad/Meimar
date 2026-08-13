"""Request and response contracts for the estimate endpoint."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# The nine sale types the models were fitted on. Anything else is rejected
# rather than estimated: the models never saw offices, rooms, warehouses,
# chalets or campsites, which are rental-dominated in this dataset.
EstateType = Literal[
    "apartment", "building", "esterahah", "farm", "floor",
    "house", "land", "store", "villa",
]


class EstimateRequest(BaseModel):
    """A property to price, described the way the models were trained."""

    city: str
    district: str
    estate_type: EstateType
    area_m2: float = Field(gt=0, le=1_000_000)

    # Structural fields. Optional because land has none of them, and because a
    # user filling a form should not have to invent a bathroom count. Missing
    # values reach XGBoost as NaN, which it routes down each split's default
    # direction -- the same treatment the training rows with gaps received.
    bedrooms: float | None = None
    living_rooms: float | None = None
    bathrooms: float | None = None
    street_width_m: float | None = None
    is_furnished: int | None = None

    has_ac: int = 0
    has_parking: int = 0
    has_pool: int = 0
    has_kitchen: int = 0
    has_driver_room: int = 0
    has_basement: int = 0
    has_garden: int = 0
    has_two_entrances: int = 0
    is_corner: int = 0
    near_masjid: int = 0
    is_investment: int = 0
    is_negotiable: int = 0
    is_urgent: int = 0
    near_park: int = 0
    has_yard: int = 0

    # Optional: supplied when the user drops a pin, which lets the response
    # carry the services score for that exact point.
    lat: float | None = Field(default=None, ge=16.0, le=33.0)
    lng: float | None = Field(default=None, ge=34.0, le=56.0)


class ServiceDistance(BaseModel):
    category: str
    distance_m: float
    count_500m: int
    count_1000m: int
    count_2000m: int


class EstimateResponse(BaseModel):
    """An estimate, its interval, and what the caller should know about it."""

    estimate: float
    estimate_low: float
    estimate_high: float
    market: Literal["built", "land"]

    # True when the submitted city or district was absent from the training
    # vocabulary. The estimate is still returned, because XGBoost handles the
    # unknown category as missing, but it is materially less reliable and the
    # UI has to say so rather than present it as an ordinary answer.
    unknown_city: bool
    unknown_district: bool

    # Distances only. There is no composite score: a weighted mean over
    # categories of very uneven OSM coverage is one confident number the data
    # does not support. See api/services.py for the measurements.
    services: list[ServiceDistance] | None = None
