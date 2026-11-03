/** World choropleth (d3-geo + world-atlas 110m, bundled locally - no network needed). */
import { useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";

import world from "world-atlas/countries-110m.json";









const W = 960, H = 470;
const countries = feature(world , (world ).objects.countries) ;
countries.features = countries.features.filter((f) => f.id !== "010"); // drop Antarctica

export function Choropleth({ values, color, tooltip, onSelect, selected }) {
  const path = useMemo(() => geoPath(geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], countries)), []);
  const [hover, setHover] = useState(null);
  const hv = hover ? values[hover.id] : undefined;
  const name = hover ? countries.features.find((f) => f.id === hover.id)?.properties.name ?? "" : "";
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of embedded emissions by country of origin"
        onMouseLeave={() => setHover(null)}>
        {countries.features.map((f) => {
          const id = String(f.id);
          const v = values[id];
          const isSel = selected?.has(id);
          return (
            <path key={id} d={path(f) ?? ""} fill={v ? color(v.value) : "#eef2f0"}
              stroke={isSel ? "#14532d" : "#ffffff"} strokeWidth={isSel ? 1.6 : 0.5}
              className={v ? "cursor-pointer transition-opacity hover:opacity-80" : ""}
              onMouseMove={(e) => {
                const r = (e.currentTarget.ownerSVGElement ).getBoundingClientRect();
                setHover({ id, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onClick={() => v && onSelect?.(v.row)} />
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 min-w-[180px] rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14 }}>
          {hv ? tooltip(hv.row, name) : <span className="text-ink-soft">{name} · no CBAM imports</span>}
        </div>
      )}
    </div>
  );
}
