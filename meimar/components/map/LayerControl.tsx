"use client";

import { useRef } from "react";

import type { Dictionary } from "@/lib/i18n";

import { CHOROPLETH_NO_DATA, CHOROPLETH_STEPS } from "./palette";

/**
 * Map layer picker and its legend.
 *
 * One overlay exists today. It is a list rather than a checkbox so a second
 * layer is an entry, not a rewrite.
 */

export type OverlayName = "none" | "price";

const OVERLAYS: readonly OverlayName[] = ["none", "price"];

type LayerControlProps = {
  dictionary: Dictionary;
  active: OverlayName;
  onChange: (overlay: OverlayName) => void;
  /** Quantile breaks of what is on screen; empty when the layer is off. */
  breaks: readonly number[];
  /** Set when the price layer is chosen but no property type is selected. */
  blockedReason: string | null;
};

/**
 * One scale for the whole legend, chosen from its largest break.
 *
 * Per-figure compacting ("1.9K", "2.6K") repeats the scale word in every band,
 * which in Arabic is a whole word -- "1.9 ألف–2.6 ألف" -- and ten of those
 * across five columns collide into an unreadable run of text. Naming the scale
 * once above the ramp lets the bands be bare numbers, which is how a legend is
 * normally read anyway.
 */
function legendScale(
  breaks: readonly number[],
  dictionary: Dictionary,
): { divisor: number; note: string | null } {
  const largest = breaks[breaks.length - 1] ?? 0;
  if (largest >= 1_000_000) {
    return { divisor: 1_000_000, note: dictionary.units.millions };
  }
  if (largest >= 1_000) return { divisor: 1_000, note: dictionary.units.thousands };
  return { divisor: 1, note: null };
}

/** At most one decimal, and no trailing ".0" — legends do not need precision. */
function scaled(value: number, divisor: number): string {
  const result = value / divisor;
  return (result >= 100 ? result.toFixed(0) : result.toFixed(1)).replace(/\.0$/, "");
}

/**
 * Label each swatch with the span it covers, not a bare edge.
 *
 * The legend used to print one number under each colour, which left the reader
 * guessing whether it was that band's floor or its ceiling -- and printed a
 * lone "+" under the last. A range answers the question the reader actually
 * has, which is "what does this colour mean".
 */
function bandLabels(breaks: readonly number[], divisor: number): string[] {
  return CHOROPLETH_STEPS.map((_, index) => {
    if (index === 0) return `< ${scaled(breaks[0], divisor)}`;
    if (index === breaks.length) return `${scaled(breaks[index - 1], divisor)}+`;
    return `${scaled(breaks[index - 1], divisor)}–${scaled(breaks[index], divisor)}`;
  });
}

export function LayerControl({
  dictionary,
  active,
  onChange,
  breaks,
  blockedReason,
}: LayerControlProps) {
  const groupRef = useRef<HTMLDivElement | null>(null);

  /**
   * Arrow keys move between radios, which is how a radiogroup is operated.
   * Paired with the roving `tabIndex` below: a conforming group is one tab
   * stop, not one per option.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const back = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!forward && !back) return;

    event.preventDefault();
    const index = OVERLAYS.indexOf(active);
    const next = OVERLAYS[(index + (forward ? 1 : -1) + OVERLAYS.length) % OVERLAYS.length];
    onChange(next);
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-overlay="${next}"]`)
      ?.focus();
  }

  const showLegend = active === "price" && blockedReason === null && breaks.length > 0;
  const scale = legendScale(breaks, dictionary);
  const labels = showLegend ? bandLabels(breaks, scale.divisor) : [];

  return (
    <div className="meimar-layers">
      <div
        ref={groupRef}
        className="meimar-layer-options"
        role="radiogroup"
        aria-label={dictionary.priceLayer.title}
        onKeyDown={onKeyDown}
      >
        {(
          [
            ["none", dictionary.priceLayer.off],
            ["price", dictionary.priceLayer.pricePerM2],
          ] as const
        ).map(([name, label]) => (
          <button
            key={name}
            type="button"
            role="radio"
            data-overlay={name}
            aria-checked={active === name}
            tabIndex={active === name ? 0 : -1}
            className={active === name ? "is-active" : ""}
            onClick={() => onChange(name)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Says why rather than silently showing nothing: an unsegmented price
          per m² would shade districts by which property types they advertise,
          so the layer refuses instead of guessing. Stated at full text colour,
          because a faint 11px note next to an apparently-active button reads
          as decoration and the user concludes the layer is broken. */}
      {blockedReason !== null ? (
        <p className="meimar-layer-note is-blocking" role="status">
          {blockedReason}
        </p>
      ) : null}

      {showLegend ? (
        <div className="meimar-legend">
          <span className="meimar-legend-unit">
            {dictionary.priceLayer.legend}
            {scale.note === null ? null : ` · ${scale.note}`}
          </span>
          <div className="meimar-legend-scale">
            {CHOROPLETH_STEPS.map((colour, index) => (
              <span key={colour} className="meimar-legend-step">
                <i style={{ background: colour }} aria-hidden="true" />
                <small className="tabular">{labels[index]}</small>
              </span>
            ))}
          </div>
          {/* Districts that exist but have nothing to report for this type.
              Drawn on the map as a dashed outline, so the legend has to name
              it -- otherwise an empty district reads as a rendering fault. */}
          <p className="meimar-legend-nodata">
            <i
              style={{ borderColor: CHOROPLETH_NO_DATA }}
              aria-hidden="true"
            />
            {dictionary.priceLayer.noData}
          </p>
        </div>
      ) : null}
    </div>
  );
}
