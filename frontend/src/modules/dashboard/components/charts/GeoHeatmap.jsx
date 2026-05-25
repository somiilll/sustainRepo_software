/**
 * GeoHeatmap — leaflet.heat geographic heatmap with India/Global toggle.
 *
 * Uses dynamic ESM imports so the chunk only loads when this card is
 * mounted. Heat points are derived from facility.state via
 * INDIAN_STATE_COORDS in dataTransformers.
 */

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

const INDIA_VIEW = {
  center: [22.5937, 80.9629],
  zoom: 4,
};

const GLOBAL_VIEW = {
  center: [20, 10],
  zoom: 2,
};

export default function GeoHeatmap({
  points = [],
  height = 360,
  view = 'india',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const heatLayerRef = useRef(null);
  const leafletRef = useRef(null);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const L = (await import('leaflet')).default;

        await import('leaflet.heat');

        leafletRef.current = L;

        if (
          cancelled ||
          !containerRef.current ||
          mapRef.current
        ) {
          return;
        }

        const initial =
          view === 'india'
            ? INDIA_VIEW
            : GLOBAL_VIEW;

        const map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
        }).setView(initial.center, initial.zoom);

        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          {
            subdomains: 'abcd',
            maxZoom: 19,
          }
        ).addTo(map);

        mapRef.current = map;

        setTimeout(() => {
          map.invalidateSize();
          setReady(true);
        }, 120);
      } catch (e) {
        console.error('Heatmap init failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Heat layer
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;

    if (!map || !L || !ready) {
      return;
    }

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (!points?.length) {
      return;
    }

    heatLayerRef.current = L.heatLayer(points, {
      radius: 42,
      blur: 32,
      maxZoom: 10,
      minOpacity: 0.45,

      gradient: {
        0.2: '#10B981',
        0.4: '#84CC16',
        0.6: '#F59E0B',
        0.8: '#F97316',
        1: '#EF4444',
      },
    }).addTo(map);
  }, [points, ready]);

  // Toggle India / Global
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    const target =
      view === 'india'
        ? INDIA_VIEW
        : GLOBAL_VIEW;

    mapRef.current.flyTo(
      target.center,
      target.zoom,
      {
        duration: 0.6,
      }
    );
  }, [view]);

  return (
    <div
      data-testid="geo-heatmap"
      className="relative"
    >
      <div
        ref={containerRef}
        style={{
          height,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #E7E5E4',
        }}
      />

      {!points.length && (
        <p className="text-[11px] text-stone-400 mt-2">
          No facility location data available for heatmap.
        </p>
      )}
    </div>
  );
}