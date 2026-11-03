/** World choropleth (d3-geo + world-atlas 110m, bundled locally - no network needed). */
import { createElement, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";

import world from "world-atlas/countries-110m.json";









const W = 960, H = 470;
const countries = feature(world , (world ).objects.countries) ;
countries.features = countries.features.filter((f) => f.id !== "010"); // drop Antarctica

const projectionPath = geoPath(geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], countries));
const shapes = countries.features
  .map((f) => ({ id: String(f.id), name: f.properties?.name ?? "", d: projectionPath(f) }))
  .filter((shape) => shape.d);

// Plain createElement (no JSX .map): the editor build wraps JSX arrays in HTML <span>s, which SVG never draws.
function Shapes({ values, color, selected, onHover, onSelect }) {
  return createElement("g", null, shapes.map((shape) => {
    const v = values[shape.id];
    const isSel = selected?.has(shape.id);
    return createElement("path", {
      key: shape.id,
      d: shape.d,
      fill: v ? color(v.value) : "#e2e8f0",
      stroke: isSel ? "#14532d" : "#ffffff",
      strokeWidth: isSel ? 1.6 : 0.5,
      className: v ? "cursor-pointer transition-opacity hover:opacity-80" : undefined,
      onMouseMove: (e) => {
        const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
        onHover({ id: shape.id, x: e.clientX - r.left, y: e.clientY - r.top });
      },
      onClick: () => v && onSelect?.(v.row),
    });
  }));
}

export function Choropleth({ values, color, tooltip, onSelect, selected }) {
  const [hover, setHover] = useState(null);
  const hv = hover ? values[hover.id] : undefined;
  const name = hover ? shapes.find((shape) => shape.id === hover.id)?.name ?? "" : "";
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ aspectRatio: `${W} / ${H}` }} role="img"
        aria-label="Map of embedded emissions by country of origin" onMouseLeave={() => setHover(null)}>
        <rect x="0" y="0" width={W} height={H} fill="#f8fafc" />
        <Shapes values={values} color={color} selected={selected} onHover={setHover} onSelect={onSelect} />
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 min-w-[180px] rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hv ? tooltip(hv.row, name) : <span className="text-ink-soft">{name} · no CBAM imports</span>}
        </div>
      )}
    </div>
  );
}
