/**
 * FlightDetailsSection — Per-month airport selection for C6 air travel.
 *
 * Two modes (toggled at top):
 *   1. Airport Lookup: Select From/To airports → auto-fills Distance Travelled
 *   2. Manual Distance: Section hides; user types distance in the existing field
 *
 * The calculated distance is written into `km_travelled` — the same variable
 * the dynamic "Distance Travelled" input reads from. This avoids duplicate fields.
 *
 * Props:
 *   monthKey        — e.g. "04", "05" ... "03"
 *   data            — monthlyData[monthKey] object
 *   updateMonthData — (monthKey, field, value) => void
 *   disabled        — disable all inputs
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Label } from '../components/ui/label';
import { Plane, ArrowRight, RotateCcw } from 'lucide-react';
import { AirportSearchInput } from './AirportSearchInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const DISTANCE_FIELD = 'km_travelled';

export const FlightDetailsSection = ({
  monthKey,
  data = {},
  updateMonthData,
  disabled = false,
}) => {
  const [isAirportMode, setIsAirportMode] = useState(() => {
    if (data.from_airport || data.to_airport) return true;
    if (data.flight_distance_manual && !data.from_airport) return false;
    return true;
  });
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (data.from_airport || data.to_airport) setIsAirportMode(true);
  }, [data.from_airport, data.to_airport]);

  const fetchDistance = useCallback(async (from, to) => {
    if (!from?.iata_code || !to?.iata_code) return;
    setCalculating(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/airports/calculate-distance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_airport_code: from.iata_code,
          to_airport_code: to.iata_code,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail || 'Distance calculation failed');
        return;
      }
      const result = await res.json();
      // Write into the existing Distance Travelled field
      updateMonthData(monthKey, DISTANCE_FIELD, result.distance_km);
      updateMonthData(monthKey, 'flight_distance_method', result.method);
      updateMonthData(monthKey, 'flight_distance_overridden', false);
      if (from.iata_code === to.iata_code) {
        setError('From and To airports are the same. Distance is 0 km.');
      }
    } catch {
      setError('Failed to calculate distance. Please try again.');
    } finally {
      setCalculating(false);
    }
  }, [monthKey, updateMonthData]);

  const handleAirportChange = (field, airport) => {
    const isFrom = field === 'from';
    const airportKey = isFrom ? 'from_airport' : 'to_airport';
    const locationKey = isFrom ? 'from_location' : 'to_location';
    const otherAirport = isFrom ? data.to_airport : data.from_airport;

    updateMonthData(monthKey, airportKey, airport);
    updateMonthData(monthKey, locationKey,
      airport ? `${airport.iata_code} — ${airport.airport_name}` : ''
    );

    if (!airport) {
      updateMonthData(monthKey, DISTANCE_FIELD, null);
      return;
    }
    if (airport && otherAirport) {
      const from = isFrom ? airport : otherAirport;
      const to = isFrom ? otherAirport : airport;
      fetchDistance(from, to);
    }
  };

  const handleResetDistance = () => {
    if (data.from_airport && data.to_airport) {
      fetchDistance(data.from_airport, data.to_airport);
    }
  };

  const handleModeToggle = (useAirport) => {
    setIsAirportMode(useAirport);
    if (!useAirport) {
      // Switching to manual — clear airport data, keep distance for manual entry
      updateMonthData(monthKey, 'from_airport', null);
      updateMonthData(monthKey, 'to_airport', null);
      updateMonthData(monthKey, 'from_location', '');
      updateMonthData(monthKey, 'to_location', '');
      updateMonthData(monthKey, 'flight_distance_method', null);
      updateMonthData(monthKey, 'flight_distance_overridden', false);
      updateMonthData(monthKey, 'flight_distance_manual', true);
    } else {
      updateMonthData(monthKey, 'flight_distance_manual', false);
    }
  };

  // In manual mode, just show a minimal toggle — the existing Distance Travelled field handles input
  if (!isAirportMode) {
    return (
      <div
        className="flex items-center justify-between p-2.5 bg-sky-50/60 border border-sky-200 rounded-lg"
        data-testid={`flight-details-${monthKey}`}
      >
        <div className="flex items-center gap-1.5">
          <Plane className="w-3.5 h-3.5 text-sky-600" />
          <span className="text-xs text-sky-600">
            Enter distance manually in the Distance Travelled field below.
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleModeToggle(true)}
          disabled={disabled}
          className="px-2.5 py-1 text-xs rounded bg-white text-sky-600 border border-sky-200 hover:bg-sky-50 transition-colors"
          data-testid={`flight-mode-airport-${monthKey}`}
        >
          Use Airport Lookup
        </button>
      </div>
    );
  }

  return (
    <div
      className="p-3 bg-sky-50/60 border border-sky-200 rounded-lg space-y-3"
      data-testid={`flight-details-${monthKey}`}
    >
      {/* Header + mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Plane className="w-4 h-4 text-sky-600" />
          <span className="text-sm font-medium text-sky-800">Flight Details</span>
        </div>
        <button
          type="button"
          onClick={() => handleModeToggle(false)}
          disabled={disabled}
          className="px-2.5 py-1 text-xs rounded text-sky-500 hover:text-sky-700 hover:bg-sky-100 transition-colors"
          data-testid={`flight-mode-manual-${monthKey}`}
        >
          Enter Distance Manually
        </button>
      </div>

      {/* Airport selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-sky-700">From Airport</Label>
          <AirportSearchInput
            value={data.from_airport || null}
            onChange={(apt) => handleAirportChange('from', apt)}
            placeholder="Search departure airport..."
            disabled={disabled}
            dataTestId={`from-airport-${monthKey}`}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-sky-700">To Airport</Label>
          <AirportSearchInput
            value={data.to_airport || null}
            onChange={(apt) => handleAirportChange('to', apt)}
            placeholder="Search arrival airport..."
            disabled={disabled}
            dataTestId={`to-airport-${monthKey}`}
          />
        </div>
      </div>

      {/* Status line: calculating, route summary, reset */}
      <div className="flex items-center gap-3 flex-wrap min-h-[20px]">
        {calculating && (
          <span className="text-xs text-sky-500 animate-pulse">Calculating distance...</span>
        )}
        {!calculating && data.from_airport && data.to_airport && (
          <span className="text-xs text-sky-500 flex items-center gap-1">
            {data.from_airport.iata_code}
            <ArrowRight className="w-3 h-3" />
            {data.to_airport.iata_code}
            {data[DISTANCE_FIELD] != null && (
              <span className="ml-1 font-medium">
                ({Number(data[DISTANCE_FIELD]).toLocaleString(undefined, { maximumFractionDigits: 0 })} km)
              </span>
            )}
          </span>
        )}
        {data.flight_distance_overridden && data.from_airport && data.to_airport && (
          <button
            type="button"
            onClick={handleResetDistance}
            disabled={disabled}
            className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-700 transition-colors"
            data-testid={`flight-distance-reset-${monthKey}`}
          >
            <RotateCcw className="w-3 h-3" />
            Reset to calculated
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-amber-600" data-testid={`flight-distance-error-${monthKey}`}>
          {error}
        </p>
      )}
    </div>
  );
};

export default FlightDetailsSection;
