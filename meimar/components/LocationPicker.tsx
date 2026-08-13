"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";

import type { Dictionary } from "@/lib/i18n";

import "leaflet/dist/leaflet.css";

/**
 * Click a point to place the property being estimated.
 *
 * The estimate service has always accepted `lat`/`lng` and answered with the
 * service distances for that exact point, but nothing in the UI ever sent
 * them, so that half of the response was unreachable. This is the missing
 * input.
 *
 * Leaflet is driven imperatively for the same reason as the main map: it owns
 * its DOM, and a wrapper would add a version-coupled dependency to place one
 * marker.
 */

/** Same frame the main map opens on, so the two read as one product. */
const SAUDI_VIEW_BOUNDS: L.LatLngBoundsExpression = [
  [16.0, 34.5],
  [32.5, 55.7],
];

const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/**
 * Zoom the picker settles at once a point is chosen — close enough to see
 * streets and plots, so the placement can be judged and corrected.
 */
const APPROACH_ZOOM = 14;

export type PickedPoint = { lat: number; lng: number };

type LocationPickerProps = {
  dictionary: Dictionary;
  value: PickedPoint | null;
  onChange: (point: PickedPoint) => void;
};

export function LocationPicker({ dictionary, value, onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  // Read through a ref so the click handler is attached once and never needs
  // the map torn down to pick up a new callback identity.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || mapRef.current !== null) return;

    const map = L.map(container, {
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
      preferCanvas: true,
    });
    map.fitBounds(SAUDI_VIEW_BOUNDS);
    L.tileLayer(TILE_URL, {
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      onChangeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
      // Close in on the point so the next click can correct it. Opening at
      // country scale means the first click is necessarily approximate --
      // one pixel is several hundred metres -- and without this there is no
      // way to refine it, or even to see what was picked.
      map.setView(event.latlng, Math.max(map.getZoom(), APPROACH_ZOOM));
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // The marker follows the value rather than the click, so the parent stays the
  // single source of truth and clearing the point clears the pin.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;

    markerRef.current?.remove();
    markerRef.current = null;
    if (value === null) return;

    markerRef.current = L.circleMarker([value.lat, value.lng], {
      radius: 8,
      color: "#ffffff",
      weight: 2.5,
      fillColor: "#d6206e",
      fillOpacity: 1,
    }).addTo(map);
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="meimar-location-picker"
      role="application"
      aria-label={dictionary.estimate.pickLocation}
    />
  );
}
