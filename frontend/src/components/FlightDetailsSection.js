/**
 * FlightDetailsSection — Per-month airport selection + distance calculation.
 *
 * Two modes:
 *   1. Airport mode: Select From/To airports → auto-calculate distance (overridable)
 *   2. Manual mode: Directly enter distance (existing behavior)
 *
 * Props:
 *   monthKey        — e.g. "01", "02" ... "12"
 *   data            — monthlyData[monthKey] object
 *   updateMonthData — (monthKey, field, value) => void
 *   disabled        — disable all inputs
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Plane, ArrowRight, RotateCcw } from 'lucide-react';
import { AirportSearchInput } from './AirportSearchInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const FlightDetailsSection = ({
  monthKey,
  data = {},
  updateMonthData,
  disabled = false,
}) => {
  const [isAirportMode, setIsAirportMode] = useState(
    // Default to airport mode unless we have manual distance but no airports
    () => {
      if (data.from_airport || data.to_airport) return true;
      if (data.flight_distance_manual && !data.from_airport) return false;
      return true;
    }
  );
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [distanceError, setDistanceError] = useState('');

  // Re-sync mode when data changes (e.g. editing an existing record)
  useEffect(() => {
    if (data.from_airport || data.to_airport) {
      setIsAirportMode(true);
    }
  }, [data.from_airport, data.to_airport]);

  const fetchDistance = useCallback(async (fromAirport, toAirport) => {
    if (!fromAirport?.iata_code || !toAirport?.iata_code) return;

    setCalculatingDistance(true);
    setDistanceError('');

    try {
      const res = await fetch(`${BACKEND_URL}/api/airports/calculate-distance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_airport_code: fromAirport.iata_code,
          to_airport_code: toAirport.iata_code,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setDistanceError(err.detail || 'Distance calculation failed');
        return;
      }

      const result = await res.json();
      // Store the backend-calculated distance and full audit data
      updateMonthData(monthKey, 'flight_distance', result.distance_km);
      updateMonthData(monthKey, 'flight_distance_method', result.method);
      updateMonthData(monthKey, 'flight_distance_overridden', false);

      if (fromAirport.iata_code === toAirport.iata_code) {
        setDistanceError('From and To airports are the same. Distance is 0 km.');
      }
    } catch {
      setDistanceError('Failed to calculate distance. Please try again.');
    } finally {
      setCalculatingDistance(false);
    }
  }, [monthKey, updateMonthData]);

  const handleFromAirportChange = (airport) => {
    updateMonthData(monthKey, 'from_airport', airport);
    // Store snapshot for audit trail
    if (airport) {
      updateMonthData(monthKey, 'from_location', `${airport.iata_code} — ${airport.airport_name}`);
    } else {
      updateMonthData(monthKey, 'from_location', '');
      updateMonthData(monthKey, 'flight_distance', null);
    }
    // Recalculate if both airports selected
    const toAirport = data.to_airport;
    if (airport && toAirport) {
      fetchDistance(airport, toAirport);
    }
  };

  const handleToAirportChange = (airport) => {
    updateMonthData(monthKey, 'to_airport', airport);
    if (airport) {
      updateMonthData(monthKey, 'to_location', `${airport.iata_code} — ${airport.airport_name}`);
    } else {
      updateMonthData(monthKey, 'to_location', '');
      updateMonthData(monthKey, 'flight_distance', null);
    }
    const fromAirport = data.from_airport;
    if (fromAirport && airport) {
      fetchDistance(fromAirport, airport);
    }
  };

  const handleDistanceOverride = (val) => {
    const numVal = val === '' ? null : parseFloat(val);
    updateMonthData(monthKey, 'flight_distance', numVal);
    updateMonthData(monthKey, 'flight_distance_overridden', true);
  };

  const handleResetDistance = () => {
    if (data.from_airport && data.to_airport) {
      fetchDistance(data.from_airport, data.to_airport);
    }
  };

  const handleManualDistance = (val) => {
    const numVal = val === '' ? null : parseFloat(val);
    updateMonthData(monthKey, 'flight_distance', numVal);
    updateMonthData(monthKey, 'flight_distance_manual', true);
  };

  const handleModeToggle = (useAirport) => {
    setIsAirportMode(useAirport);
    if (useAirport) {
      // Switching to airport mode — clear manual flag
      updateMonthData(monthKey, 'flight_distance_manual', false);
    } else {
      // Switching to manual mode — clear airport data
      updateMonthData(monthKey, 'from_airport', null);
      updateMonthData(monthKey, 'to_airport', null);
      updateMonthData(monthKey, 'from_location', '');
      updateMonthData(monthKey, 'to_location', '');
      updateMonthData(monthKey, 'flight_distance_method', null);
      updateMonthData(monthKey, 'flight_distance_overridden', false);
      updateMonthData(monthKey, 'flight_distance_manual', true);
    }
  };

  const distanceDisplay = data.flight_distance != null
    ? Number(data.flight_distance).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : '—';

  return (
    <div
      className="p-3 bg-sky-50/60 border border-sky-200 rounded-lg space-y-3"
      data-testid={`flight-details-${monthKey}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Plane className="w-4 h-4 text-sky-600" />
          <span className="text-sm font-medium text-sky-800">Flight Details</span>
        </div>
        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-sky-100 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => handleModeToggle(true)}
            disabled={disabled}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              isAirportMode
                ? 'bg-white text-sky-700 shadow-sm font-medium'
                : 'text-sky-500 hover:text-sky-700'
            }`}
            data-testid={`flight-mode-airport-${monthKey}`}
          >
            Airport Lookup
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle(false)}
            disabled={disabled}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              !isAirportMode
                ? 'bg-white text-sky-700 shadow-sm font-medium'
                : 'text-sky-500 hover:text-sky-700'
            }`}
            data-testid={`flight-mode-manual-${monthKey}`}
          >
            Manual Distance
          </button>
        </div>
      </div>

      {isAirportMode ? (
        <>
          {/* Airport selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-sky-700">From Airport</Label>
              <AirportSearchInput
                value={data.from_airport || null}
                onChange={handleFromAirportChange}
                placeholder="Search departure airport..."
                disabled={disabled}
                dataTestId={`from-airport-${monthKey}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-sky-700">To Airport</Label>
              <AirportSearchInput
                value={data.to_airport || null}
                onChange={handleToAirportChange}
                placeholder="Search arrival airport..."
                disabled={disabled}
                dataTestId={`to-airport-${monthKey}`}
              />
            </div>
          </div>

          {/* Distance display + override */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-sky-600">Distance:</span>
              {calculatingDistance ? (
                <span className="text-xs text-sky-500 animate-pulse">Calculating...</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={data.flight_distance ?? ''}
                    onChange={(e) => handleDistanceOverride(e.target.value)}
                    disabled={disabled || (!data.from_airport && !data.to_airport)}
                    className="w-28 h-8 text-sm bg-white"
                    placeholder="—"
                    data-testid={`flight-distance-${monthKey}`}
                  />
                  <span className="text-xs text-sky-600 font-medium">km</span>
                </div>
              )}
            </div>

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

            {data.from_airport && data.to_airport && !calculatingDistance && (
              <span className="text-xs text-sky-400 flex items-center gap-1">
                {data.from_airport.iata_code}
                <ArrowRight className="w-3 h-3" />
                {data.to_airport.iata_code}
              </span>
            )}
          </div>

          {distanceError && (
            <p className="text-xs text-amber-600" data-testid={`flight-distance-error-${monthKey}`}>
              {distanceError}
            </p>
          )}
          {!distanceError && data.from_airport && data.to_airport && data.flight_distance != null && (
            <p className="text-[11px] text-sky-400">
              Haversine great-circle distance. You can override the value if needed.
            </p>
          )}
        </>
      ) : (
        /* Manual distance entry */
        <div className="space-y-1.5">
          <Label className="text-xs text-sky-700">Distance (km)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="any"
              min="0"
              value={data.flight_distance ?? ''}
              onChange={(e) => handleManualDistance(e.target.value)}
              disabled={disabled}
              placeholder="Enter distance in km"
              className="w-40 h-8 text-sm bg-white"
              data-testid={`flight-distance-manual-input-${monthKey}`}
            />
            <span className="text-xs text-sky-600 font-medium">km</span>
          </div>
          <p className="text-[11px] text-sky-400">
            Enter the one-way flight distance manually.
          </p>
        </div>
      )}
    </div>
  );
};

export default FlightDetailsSection;
