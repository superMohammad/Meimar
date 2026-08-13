import type { Dictionary } from "./ar";

/**
 * English dictionary. Typed as `Dictionary`, so dropping or misspelling a key
 * fails the build rather than rendering an empty label.
 */
export const en: Dictionary = {
  brand: "Meimar",
  tagline: "Price and location intelligence for Saudi real estate",

  nav: {
    skipToContent: "Skip to content",
    map: "Map",
    estimate: "Estimate",
    districts: "Districts",
    methodology: "Methodology",
    about: "About",
    contact: "Contact",
    privacy: "Privacy",
    terms: "Terms",
    language: "العربية",
    menu: "Menu",
  },

  landing: {
    headline: "Know the price per m² before you negotiate",
    sub: "A map of Saudi property listings, with a price estimate on every listing and a comparison against similar listings in the same district.",
    openMap: "Open the map",
    tryEstimate: "Estimate your property",
    statListings: "listings",
    statEstimates: "with an estimate",
    statDistricts: "districts",
    statAccuracy: "median estimate error",
    featureMapTitle: "Map first",
    featureMapBody:
      "Browse listings over satellite imagery, with a layer showing price per m² in each district.",
    featureValueTitle: "Price estimates",
    featureValueBody:
      "Every sale listing carries an estimate and an expected range, compared against similar listings of the same type nearby.",
    featureAreaTitle: "District intelligence",
    featureAreaBody:
      "Median prices, listing counts and nearby services for each district, derived from the listings themselves.",
    more: "Learn more",
    popularDistricts: "Most active districts",
    allDistricts: "All districts",
    honestyTitle: "Where these numbers come from",
    honestyBody:
      "Every price here is an advertised asking price, not a completed transaction. The estimate is a model fitted on those asking prices, with a median error of {pct} on listings it never saw. We say so plainly so you know what you are reading.",
  },

  filters: {
    title: "Filters",
    purpose: "Purpose",
    sell: "For sale",
    rental: "For rent",
    estateType: "Property type",
    priceRange: "Price range",
    areaRange: "Area",
    minBeds: "Bedrooms",
    city: "City",
    district: "District",
    all: "All",
    reset: "Reset",
    apply: "Apply",
    activeCount: "{count} filters active",
    close: "Close filters",
    min: "Minimum",
    max: "Maximum",
  },

  near: {
    title: "Search by distance",
    pick: "Pick a point on the map",
    picking: "Tap the map to place the point",
    cancel: "Cancel",
    clear: "Clear point",
    radius: "Within",
    note: "Straight-line distance, not travel time.",
    active: "Within {km} km of the chosen point",
  },

  estateTypes: {
    land: "Land",
    villa: "Villa",
    apartment: "Apartment",
    building: "Building",
    floor: "Floor",
    store: "Store",
    esterahah: "Rest house",
    room: "Room",
    office: "Office",
    house: "House",
    farm: "Farm",
    warehouse: "Warehouse",
    chalet: "Chalet",
    campsite: "Campsite",
    furnished_apartment: "Furnished apartment",
  },

  map: {
    loading: "Loading data…",
    listingsInView: "listings in view",
    showingCapped: "Showing {shown} of {total} results",
    zoomForPins: "Zoom in to see individual listings",
  },

  listing: {
    area: "Area",
    beds: "Bedrooms",
    livings: "Living rooms",
    bathrooms: "Bathrooms",
    streetWidth: "Street width",
    age: "Property age",
    years: "years",
    furnished: "Furnished",
    amenities: "Features",
    description: "Description",
    close: "Close",
    noDescription: "No description",
  },

  amenities: {
    f_ac: "Air conditioning",
    f_parking: "Parking",
    f_pool: "Pool",
    f_kitchen: "Kitchen",
    f_driver: "Driver's room",
    f_basement: "Basement",
    f_garden: "Garden",
    f_two_entr: "Two entrances",
    f_corner: "Corner plot",
    f_near_masjid: "Near a mosque",
    f_investment: "Investment",
    f_negotiable: "Negotiable",
    f_urgent: "Urgent sale",
    f_near_park: "Near a park",
    f_yard: "Yard",
    f_new: "New",
  },

  services: {
    title: "Nearby services",
    radius: "Radius",
    facilities: "facilities",
    disclaimer:
      "Distances are to the nearest facility recorded in OpenStreetMap. Only categories with adequate coverage are shown.",
    categories: {
      mosque: "Mosque",
      hospital: "Hospital / clinic",
      mall: "Mall",
      university: "University",
    },
  },

  valuation: {
    title: "Price estimate",
    estimate: "Estimate",
    asking: "Asking price",
    range: "Expected range",
    above: "{pct} above comparable listings",
    below: "{pct} below comparable listings",
    inline: "In line with comparable listings",
    none: "No estimate",
    noneRental: "Estimates are available for sale listings only.",
    noneOutOfRange: "This listing's price falls outside the range the model was trained on.",
    basis:
      "An estimate based on what comparable listings ask — not an appraisal of market value, and not a transaction price.",
    accuracy: "Median error {pct} on listings the model did not train on.",
    basedOn: "Based on {count} {type} listings in {district}",
    typicalRange: "Typical price per m²: {low} – {high} {unit}",
  },

  priceLayer: {
    title: "Map layers",
    pricePerM2: "Price per m²",
    off: "No layer",
    needsType: "Choose a property type to show price per m²",
    legend: "SAR/m²",
    noData: "Not enough data",
  },

  listingPage: {
    permalink: "Open listing page",
    backToMap: "Back to the map",
    notFound: "This listing was not found",
    loading: "Loading…",
  },

  estimate: {
    title: "Estimate your property",
    subtitle: "Describe the property to get an estimate based on comparable listings",
    submit: "Calculate estimate",
    calculating: "Calculating…",
    pickLocation: "Pick the location on the map",
    locationHint: "Optional — adds the services score for that point",
    result: "Estimate",
    unknownCity: "This city is not in the training data, so the estimate is less reliable.",
    unknownDistrict: "This district is not in the training data, so the estimate is less reliable.",
    error: "Could not calculate an estimate",
    errorUnsupportedType: "The models cover sale property only, and this type is not among them.",
    errorUnavailable: "The estimate service is unavailable. Try again shortly.",
    clearLocation: "Clear location",
  },

  district: {
    title: "About this district",
    listings: "Listings",
    medianPrice: "Median price",
    medianPricePerM2: "Median price per m²",

    insufficient: "Not enough data",
    insufficientHint:
      "This district has too few listings to support a reliable median.",
  },

  districtPage: {
    columnNote: "Figures are median price per m² (SAR/m²), all property types",
    searchLabel: "Search districts",
    searchPlaceholder: "Type a district or city name…",
    resultCount: "{count} districts",
    noResults: "No district matches that name.",
    lede: "{count} listings in {district}, {city}.",
    metaDescription:
      "Property prices in {district}, {city}: median price and price per m² from {count} listings.",
    mixedTypes:
      "These medians cover every property type in the district. Land is priced very differently from a villa or an apartment — use the price-per-m² layer on the map with a type selected.",
    exploreTitle: "See the listings on the map",
    exploreBody: "Open the map and zoom to this district to see listings, prices and estimates.",
    indexLede:
      "Every district with enough listings to support reliable medians, grouped by city.",
  },

  pages: {
    about: {
      title: "About Meimar",
      lede: "Meimar is a price and location intelligence engine for Saudi real estate, not a listing board.",
      whatTitle: "What we do",
      whatBody: [
        "We collect advertised property listings across Saudi Arabia, put them on a map, and add the layer other platforms do not: a price estimate for every listing, compared against similar listings of the same type in the same district.",
        "The idea is simple. An advertiser writes the price they want. We tell you what people ask for comparable property nearby, so you can see where that price sits.",
      ],
      whyTitle: "Why the honesty matters here",
      whyBody: [
        "Any platform can print a number and call it 'the value'. We would rather say where the number came from and how often it is wrong, because buying property is too large a decision to rest on a figure of unknown origin.",
      ],
    },
    contact: {
      title: "Contact",
      lede: "Spotted a wrong number? A listing with bad data? We want to hear it.",
      dataTitle: "Data corrections",
      dataBody: [
        "If a listing has the wrong location or price, send us the listing link and what is wrong with it.",
      ],
      generalTitle: "General enquiries",
      generalBody: ["For questions about the methodology or partnerships, reach us by email."],
    },
    methodology: {
      title: "Methodology",
      lede: "Where every number in Meimar comes from, and what it cannot tell you.",
      pricesTitle: "Prices are asking prices",
      pricesBody: [
        "Every price on the platform is what the advertiser wrote, not a completed transaction. We have no access to actual sale prices, and we say so rather than implying a precision we do not have.",
        "So the estimate answers 'what do people ask for comparable property?' — not 'what is this property worth?'.",
      ],
      modelTitle: "How the estimate is calculated",
      modelBody: [
        "Two separate models: one for built property for sale, predicting total price, and one for land, predicting price per square metre which is then multiplied by area. They are separate because land is priced by the metre and a villa is priced as a whole.",
        "Every estimate shown on an existing listing is computed out-of-fold: the model that predicted it never trained on it. Without that the estimate would sit closer to the asking price than it deserves, because the model simply remembers the listing.",
        "Median error is {builtPct} for built property and {landPct} for land, measured on listings the models never saw. That is why we always show a range rather than a single number.",
      ],
      servicesTitle: "Nearby services",
      servicesBody: [
        "Distances are measured to the actual shape of the facility in OpenStreetMap — to the edge of a park or hospital, not to its centre.",
        "We show only four categories: mosque, hospital or clinic, mall, and university. We measured the others and found OpenStreetMap coverage three to four times short of reality, particularly for schools, supermarkets and parks. We removed them rather than display numbers we know are wrong.",
        "That means the everyday amenities people care most about are currently absent. Fixing it needs a better data source, not more code.",
      ],
      districtsTitle: "District boundaries",
      districtsBody: [
        "District outlines on the map are derived from the listing locations themselves, because OpenStreetMap does not cover Saudi neighbourhoods. They approximate where listings are, and are not official municipal boundaries.",
      ],
    },
    privacy: {
      title: "Privacy policy",
      lede: "How we handle your data.",
      notice:
        "This draft is structural. Final text compliant with the Saudi Personal Data Protection Law (PDPL), together with consent mechanics, will be added in the next phase before any personal data is collected.",
      collectTitle: "What we collect today",
      collectBody: [
        "The platform is browse-only: no accounts, no sign-in, no personal data collection. Listing data shown is public advertising.",
      ],
      futureTitle: "What we plan",
      futureBody: [
        "We plan to collect usage data later to improve recommendations and for advertising purposes. That will not begin before an explicit consent mechanism exists that you can decline or withdraw, in line with PDPL.",
      ],
    },
    terms: {
      title: "Terms of use",
      lede: "Terms for using Meimar.",
      notice: "This draft is structural and will be legally reviewed before launch.",
      useTitle: "Nature of the information",
      useBody: [
        "Information on Meimar is for guidance only. It is not a certified property valuation and not investment advice. Estimates are built on advertised asking prices and may differ substantially from market value.",
        "Consult a licensed property valuer before any purchase or sale decision.",
      ],
      contentTitle: "Listing content",
      contentBody: [
        "Listing data originates from advertisements published by third parties. We do not guarantee its accuracy, the availability of the property, or the correctness of its price.",
      ],
    },
  },

  units: {
    sar: "SAR",
    sqm: "m²",
    sarPerSqm: "SAR/m²",
    m: "m",
    km: "km",
    thousands: "thousands",
    millions: "millions",
  },

  disclaimer:
    "Prices shown are advertised asking prices, not completed transactions.",
};
