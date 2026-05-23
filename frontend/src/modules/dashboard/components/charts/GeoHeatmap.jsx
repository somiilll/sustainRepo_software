/**
 * GeoHeatmap — leaflet.heat geographic heatmap with India/Global toggle.
 *
 * Uses dynamic ESM imports so the chunk only loads when this card is
 * mounted. Heat points are derived from facility.state via
 * INDIAN_STATE_COORDS in dataTransformers.
 */
import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

const INDIA_VIEW = { center: [22.5937, 80.9629], zoom: 4.5 };
const GLOBAL_VIEW = { center: [20, 10], zoom: 1.8 };

export default function GeoHeatmap({ points = [], height = 360 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const heatLayerRef = useRef(null);
  const [view, setView] = useState('india');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet.heat'); // registers L.heatLayer
      if (cancelled || !containerRef.current) return;
      if (mapRef.current) return; // already initialized
      const initial = view === 'india' ? INDIA_VIEW : GLOBAL_VIEW;
      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      }).setView(initial.center, initial.zoom);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;

      // initial heat layer
      heatLayerRef.current = L.heatLayer(points, {
        radius: 35,
        blur: 28,
        maxZoom: 10,
        gradient: { 0.2: '#10B981', 0.4: '#84CC16', 0.6: '#F59E0B', 0.8: '#F97316', 1: '#EF4444' },
      }).addTo(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update heat data when points change.
  useEffect(() => {
    if (heatLayerRef.current) heatLayerRef.current.setLatLngs(points);
  }, [points]);

  // Switch India/Global.
  useEffect(() => {
    if (!mapRef.current) return;
    const target = view === 'india' ? INDIA_VIEW : GLOBAL_VIEW;
    mapRef.current.flyTo(target.center, target.zoom, { duration: 0.6 });
  }, [view]);

  return (
    <div data-testid="geo-heatmap" className="relative">
      <div className="flex items-center justify-end gap-1 mb-2">
        <button
          onClick={() => setView('india')}
          className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
            view === 'india' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
          }`}
          data-testid="heatmap-toggle-india"
        >
          India
        </button>
        <button
          onClick={() => setView('global')}
          className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
            view === 'global' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
          }`}
          data-testid="heatmap-toggle-global"
        >
          Global
        </button>
      </div>
      <div
        ref={containerRef}
        style={{ height, borderRadius: 12, overflow: 'hidden', border: '1px solid #E7E5E4' }}
      />
      {!points.length && (
        <p className="text-[11px] text-stone-400 mt-2">No facility location data available for heatmap.</p>
      )}
    </div>
  );
}
