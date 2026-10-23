/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { GeoJsonGeometry } from '../../validators/spatial/boundary.schema';
import { calculateGeodesicAreaSqm } from '../../lib/geo-utils';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

interface ProjectBoundaryMapProps {
  initialGeometry?: GeoJsonGeometry | null;
  onChange?: (geometry: GeoJsonGeometry | null, areaSqm: number) => void;
  readOnly?: boolean;
  height?: string;
  adminUnitCode?: string;
}

// Coordinate centers for key Indian administrative regions
const REGION_CENTERS: Record<string, [number, number, number]> = {
  IND: [78.9629, 20.5937, 4.5], // All India
  KA: [76.5, 14.5, 6.8], // Karnataka
  'KA-BLR': [77.5946, 12.9716, 11], // Bengaluru Urban
  MH: [75.7139, 19.7515, 6.5], // Maharashtra
  DL: [77.1025, 28.7041, 10.5], // Delhi
};

export function ProjectBoundaryMap({
  initialGeometry,
  onChange,
  readOnly = false,
  height = '480px',
  adminUnitCode,
}: ProjectBoundaryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const drawInstanceRef = useRef<any>(null);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [currentGeometry, setCurrentGeometry] = useState<GeoJsonGeometry | null>(
    initialGeometry ?? null
  );
  const [calculatedAreaSqm, setCalculatedAreaSqm] = useState<number>(() =>
    calculateGeodesicAreaSqm(initialGeometry)
  );
  const [serverAreaSqm, setServerAreaSqm] = useState<number | null>(null);
  const [isValidatingServer, setIsValidatingServer] = useState(false);
  const [activeDrawMode, setActiveDrawMode] = useState<'simple_select' | 'draw_polygon'>('simple_select');

  // Verify and measure area via server PostGIS
  const verifyServerArea = useCallback(async (geometry: GeoJsonGeometry | null) => {
    if (!geometry) {
      setServerAreaSqm(null);
      return;
    }

    setIsValidatingServer(true);
    try {
      const res = await fetch('/api/projects/calculate-area', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.areaSqm !== undefined) {
          setServerAreaSqm(json.data.areaSqm);
        }
      }
    } catch {
      // Graceful fallback to client calculation
    } finally {
      setIsValidatingServer(false);
    }
  }, []);

  // Update geometry handler
  const handleGeometryUpdate = useCallback(
    (geom: GeoJsonGeometry | null) => {
      setCurrentGeometry(geom);
      const area = calculateGeodesicAreaSqm(geom);
      setCalculatedAreaSqm(area);
      if (onChange) {
        onChange(geom, area);
      }
      if (geom) {
        verifyServerArea(geom);
      } else {
        setServerAreaSqm(null);
      }
    },
    [onChange, verifyServerArea]
  );

  // Initialize Map
  useEffect(() => {
    let isCancelled = false;

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      try {
        const maplibregl = await import('maplibre-gl');
        const MapboxDraw = (await import('@mapbox/mapbox-gl-draw')).default;

        if (isCancelled || !mapContainerRef.current) return;

        // Correctly set MapLibre GL JS web worker URL so all GeoJSON sources & drawing layers function
        try {
          if (typeof (maplibregl as any).setWorkerUrl === 'function') {
            (maplibregl as any).setWorkerUrl('/maplibre-gl-worker.mjs');
          } else if ((maplibregl as any).config) {
            (maplibregl as any).config.WORKER_URL = '/maplibre-gl-worker.mjs';
          }
        } catch {
          /* non-critical fallback */
        }

        // Determine initial center and zoom based on adminUnitCode
        const region = adminUnitCode ? REGION_CENTERS[adminUnitCode] : null;
        const [initLng, initLat, initZoom] = region ?? REGION_CENTERS['IND'];

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: 'raster',
                tiles: [
                  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                ],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors | NLAMS Spatial',
              },
            },
            layers: [
              {
                id: 'osm-layer',
                type: 'raster',
                source: 'osm',
                minzoom: 0,
                maxzoom: 19,
              },
            ],
          },
          center: [initLng, initLat],
          zoom: initZoom,
          pitchWithRotate: false,
        });

        // Navigation controls
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

        mapInstanceRef.current = map;

        map.on('load', () => {
          if (isCancelled) return;
          setIsMapLoaded(true);

          if (!readOnly) {
            // Custom modes ensuring ALL vertices are emitted with exact coordinates
            // during drawing AND after double-click completion, without premature termination
            const customModes = {
              ...MapboxDraw.modes,
              draw_polygon: {
                ...MapboxDraw.modes.draw_polygon,
                clickOnVertex(state: any, e: any) {
                  // Only allow closing if we have at least 3 points placed AND the vertex clicked is the starting vertex '0.0'
                  const isStartVertex = e?.featureTarget?.properties?.coord_path === '0.0';
                  if (state.currentVertexPosition >= 2 && isStartVertex) {
                    return (this as any).changeMode(MapboxDraw.constants.modes.SIMPLE_SELECT, {
                      featureIds: [state.polygon.id],
                    });
                  }
                  // Do not close or delete if fewer than 3 points are placed
                  return (this as any).clickAnywhere(state, e);
                },
                clickAnywhere(state: any, e: any) {
                  // Only allow double-click close if at least 3 points have been placed
                  const isEventAtCoords = (MapboxDraw as any).lib.isEventAtCoordinates;
                  if (
                    state.currentVertexPosition >= 2 &&
                    isEventAtCoords &&
                    isEventAtCoords(e, state.polygon.coordinates[0][state.currentVertexPosition - 1])
                  ) {
                    return (this as any).changeMode(MapboxDraw.constants.modes.SIMPLE_SELECT, {
                      featureIds: [state.polygon.id],
                    });
                  }
                  (this as any).updateUIClasses({ mouse: MapboxDraw.constants.cursors.ADD });
                  state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, e.lngLat.lng, e.lngLat.lat);
                  state.currentVertexPosition++;
                  state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, e.lngLat.lng, e.lngLat.lat);
                },
                toDisplayFeatures(state: any, geojson: any, display: any) {
                  const isActivePolygon = geojson.properties.id === state.polygon.id;
                  geojson.properties.active = isActivePolygon ? 'true' : 'false';
                  if (!isActivePolygon) return display(geojson);

                  if (geojson.geometry.coordinates.length === 0) return;

                  const coordinateCount = geojson.geometry.coordinates[0].length;
                  if (coordinateCount < 3) return;

                  geojson.properties.meta = 'feature';

                  // Emit start vertex with meta: 'vertex' (interactive target for closing)
                  display((MapboxDraw as any).lib.createVertex(
                    state.polygon.id,
                    geojson.geometry.coordinates[0][0],
                    '0.0',
                    false
                  ));

                  // Emit all other fixed vertices with meta: 'vertex-display'
                  // so they are visible on the map, but cannot be accidentally clicked as closing targets
                  const numFixedPoints = coordinateCount - 1;
                  for (let i = 1; i < numFixedPoints; i++) {
                    display({
                      type: 'Feature',
                      properties: {
                        meta: 'vertex-display',
                        parent: state.polygon.id,
                        coord_path: `0.${i}`,
                        active: 'false',
                      },
                      geometry: {
                        type: 'Point',
                        coordinates: geojson.geometry.coordinates[0][i],
                      },
                    });
                  }

                  if (coordinateCount <= 4) {
                    const lineCoordinates = [
                      [geojson.geometry.coordinates[0][0][0], geojson.geometry.coordinates[0][0][1]],
                      [geojson.geometry.coordinates[0][1][0], geojson.geometry.coordinates[0][1][1]],
                    ];
                    display({
                      type: 'Feature',
                      properties: geojson.properties,
                      geometry: {
                        coordinates: lineCoordinates,
                        type: 'LineString',
                      },
                    });
                    if (coordinateCount === 3) return;
                  }

                  return display(geojson);
                },
              },
              simple_select: {
                ...MapboxDraw.modes.simple_select,
                toDisplayFeatures(state: any, geojson: any, display: any) {
                  geojson.properties.active = (this as any).isSelected(geojson.properties.id) ? 'true' : 'false';
                  display(geojson);
                  (this as any).fireActionable();
                  if (geojson.geometry.type === 'Point') return;
                  // Always emit vertices for completed polygons so they remain visible after double-click
                  const suppPoints = (MapboxDraw as any).lib.createSupplementaryPoints(geojson, { midpoints: false });
                  suppPoints.forEach(display);
                },
              },
            };

            // Initialize Drawing Plugin with custom modes and styles
            const draw = new MapboxDraw({
              displayControlsDefault: false,
              controls: {
                polygon: false,
                trash: false,
              },
              modes: customModes,
              styles: [
                // === Polygon Fill (completed / inactive) ===
                {
                  id: 'gl-draw-polygon-fill-inactive',
                  type: 'fill',
                  filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                  paint: {
                    'fill-color': '#3b82f6',
                    'fill-outline-color': '#2563eb',
                    'fill-opacity': 0.2,
                  },
                },
                // === Polygon Fill (active / being drawn) ===
                {
                  id: 'gl-draw-polygon-fill-active',
                  type: 'fill',
                  filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                  paint: {
                    'fill-color': '#3b82f6',
                    'fill-outline-color': '#60a5fa',
                    'fill-opacity': 0.25,
                  },
                },
                // === Polygon Stroke (completed / inactive) ===
                {
                  id: 'gl-draw-polygon-stroke-inactive',
                  type: 'line',
                  filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                  layout: { 'line-cap': 'round', 'line-join': 'round' },
                  paint: {
                    'line-color': '#2563eb',
                    'line-width': 2.5,
                  },
                },
                // === Polygon Stroke (active / being drawn) ===
                {
                  id: 'gl-draw-polygon-stroke-active',
                  type: 'line',
                  filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                  layout: { 'line-cap': 'round', 'line-join': 'round' },
                  paint: {
                    'line-color': '#2563eb',
                    'line-dasharray': [0.2, 2],
                    'line-width': 2.5,
                  },
                },
                // === Line (rubberband guide line while drawing) ===
                {
                  id: 'gl-draw-line-active',
                  type: 'line',
                  filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
                  layout: { 'line-cap': 'round', 'line-join': 'round' },
                  paint: {
                    'line-color': '#2563eb',
                    'line-dasharray': [0.2, 2],
                    'line-width': 2.5,
                  },
                },
                // === Midpoints (orange dot between vertices if editing) ===
                {
                  id: 'gl-draw-polygon-midpoint',
                  type: 'circle',
                  filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
                  paint: {
                    'circle-radius': 4.5,
                    'circle-color': '#f97316',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                  },
                },
                // === First Vertex Highlight (start point to click for closing) ===
                {
                  id: 'gl-draw-first-vertex-highlight',
                  type: 'circle',
                  filter: ['all', ['==', 'meta', 'vertex'], ['==', 'coord_path', '0.0'], ['==', 'mode', 'draw_polygon']],
                  paint: {
                    'circle-radius': 8.5,
                    'circle-color': '#16a34a',
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#ffffff',
                  },
                },
                // === Vertex Points Outer Ring (visible while drawing AND after completion) ===
                {
                  id: 'gl-draw-polygon-vertex-outer',
                  type: 'circle',
                  filter: ['all', ['in', 'meta', 'vertex', 'vertex-display'], ['==', '$type', 'Point']],
                  paint: {
                    'circle-radius': 6.5,
                    'circle-color': '#ffffff',
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#2563eb',
                  },
                },
                // === Vertex Points Inner Core (crisp center pin) ===
                {
                  id: 'gl-draw-polygon-vertex-inner',
                  type: 'circle',
                  filter: ['all', ['in', 'meta', 'vertex', 'vertex-display'], ['==', '$type', 'Point']],
                  paint: {
                    'circle-radius': 3,
                    'circle-color': '#2563eb',
                  },
                },
                // === Active Drawing Cursor Dot ===
                {
                  id: 'gl-draw-point-stroke-active',
                  type: 'circle',
                  filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'true'], ['!=', 'meta', 'midpoint'], ['!=', 'meta', 'vertex']],
                  paint: {
                    'circle-radius': 6,
                    'circle-color': '#2563eb',
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#ffffff',
                  },
                },
              ],
            });

            map.addControl(draw as any, 'top-left');
            drawInstanceRef.current = draw;

            // Load initial geometry into draw if provided
            if (initialGeometry) {
              draw.add({
                type: 'Feature',
                properties: {},
                geometry: initialGeometry as any,
              });

              // Fit bounds to polygon
              try {
                fitGeometryBounds(map, initialGeometry);
              } catch {
                /* ignore */
              }
            }

            // ─── Draw event listeners ─────────────────────────────────────────
            const syncDraw = () => {
              const allFeatures = draw.getAll();
              if (allFeatures.features.length > 0) {
                // Take latest polygon feature
                const latestFeature = allFeatures.features[allFeatures.features.length - 1];
                const geom = latestFeature.geometry as unknown as GeoJsonGeometry;
                handleGeometryUpdate(geom);
                setActiveDrawMode('simple_select');
              } else {
                handleGeometryUpdate(null);
                setActiveDrawMode('simple_select');
              }
            };

            (map as any).on('draw.create', syncDraw);
            (map as any).on('draw.update', syncDraw);
            (map as any).on('draw.delete', syncDraw);
            (map as any).on('draw.modechange', (e: any) => {
              setActiveDrawMode(e.mode);
            });
          } else {
            // Read-only mode: render geometry layer directly
            if (initialGeometry) {
              map.addSource('readonly-boundary', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: initialGeometry as any,
                },
              });

              map.addLayer({
                id: 'readonly-boundary-fill',
                type: 'fill',
                source: 'readonly-boundary',
                paint: {
                  'fill-color': '#3b82f6',
                  'fill-opacity': 0.2,
                },
              });

              map.addLayer({
                id: 'readonly-boundary-line',
                type: 'line',
                source: 'readonly-boundary',
                paint: {
                  'line-color': '#2563eb',
                  'line-width': 2.5,
                },
              });

              // Also render vertices in read-only mode
              const coords =
                initialGeometry.type === 'Polygon'
                  ? initialGeometry.coordinates[0]
                  : initialGeometry.type === 'MultiPolygon'
                  ? initialGeometry.coordinates[0][0]
                  : [];
              if (coords.length > 0) {
                map.addSource('readonly-vertices', {
                  type: 'geojson',
                  data: {
                    type: 'FeatureCollection',
                    features: coords.slice(0, -1).map((pt: any) => ({
                      type: 'Feature',
                      properties: {},
                      geometry: { type: 'Point', coordinates: pt },
                    })),
                  },
                });

                map.addLayer({
                  id: 'readonly-vertices-outer',
                  type: 'circle',
                  source: 'readonly-vertices',
                  paint: {
                    'circle-radius': 6.5,
                    'circle-color': '#ffffff',
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#2563eb',
                  },
                });

                map.addLayer({
                  id: 'readonly-vertices-inner',
                  type: 'circle',
                  source: 'readonly-vertices',
                  paint: {
                    'circle-radius': 3,
                    'circle-color': '#2563eb',
                  },
                });
              }

              fitGeometryBounds(map, initialGeometry);
            }
          }
        });
      } catch (err: unknown) {
        if (!isCancelled) {
          setMapError(err instanceof Error ? err.message : 'Failed to load interactive map');
        }
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        drawInstanceRef.current = null;
      }
    };
  }, []); // Run on mount

  // Helper to fit map bounds to geometry
  function fitGeometryBounds(map: any, geom: GeoJsonGeometry) {
    if (!geom || !geom.coordinates) return;
    const lons: number[] = [];
    const lats: number[] = [];

    function extractPoints(arr: any) {
      if (typeof arr[0] === 'number') {
        lons.push(arr[0]);
        lats.push(arr[1]);
      } else {
        for (const item of arr) extractPoints(item);
      }
    }

    extractPoints(geom.coordinates);

    if (lons.length >= 3) {
      const minLng = Math.min(...lons);
      const maxLng = Math.max(...lons);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);

      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 40, maxZoom: 16, duration: 800 }
      );
    }
  }

  // Draw controls actions
  const handleStartDraw = () => {
    if (!drawInstanceRef.current) return;
    drawInstanceRef.current.deleteAll();
    drawInstanceRef.current.changeMode('draw_polygon');
    setActiveDrawMode('draw_polygon');
    handleGeometryUpdate(null);
  };

  const handleClear = () => {
    if (!drawInstanceRef.current) return;
    drawInstanceRef.current.deleteAll();
    handleGeometryUpdate(null);
    setActiveDrawMode('simple_select');
  };

  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    if (currentGeometry) {
      fitGeometryBounds(mapInstanceRef.current, currentGeometry);
    } else {
      const region = adminUnitCode ? REGION_CENTERS[adminUnitCode] : null;
      const [lng, lat, zoom] = region ?? REGION_CENTERS['IND'];
      mapInstanceRef.current.flyTo({ center: [lng, lat], zoom, duration: 800 });
    }
  };

  return (
    <div className="project-map-wrapper" style={{ width: '100%', position: 'relative' }}>
      {/* Top Map Toolbar */}
      {!readOnly && (
        <div className="map-toolbar-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={activeDrawMode === 'draw_polygon' ? 'btn-primary' : 'btn-secondary'}
              onClick={handleStartDraw}
              id="btn-draw-polygon"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8125rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.35rem' }}>
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              <span>{currentGeometry ? 'Redraw Polygon' : 'Draw Polygon Boundary'}</span>
            </button>

            {currentGeometry && (
              <button
                type="button"
                className="btn-cancel"
                onClick={handleClear}
                id="btn-clear-boundary"
                style={{ padding: '0.4rem 0.85rem', fontSize: '0.8125rem', color: 'var(--status-danger)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.35rem' }}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Clear Boundary</span>
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={handleRecenter}
              title="Recenter view on project area"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8125rem' }}
            >
              <span>Fit / Recenter</span>
            </button>
          </div>

          {/* Active drawing hint */}
          {activeDrawMode === 'draw_polygon' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="spinner-sm" style={{ width: '12px', height: '12px' }} />
              <span>Click map to add polygon vertices. Double-click or click first point to close.</span>
            </div>
          )}
        </div>
      )}

      {/* Map Error Banner */}
      {mapError && (
        <div className="alert-banner-error" style={{ marginBottom: '0.75rem' }}>
          <span>Error loading map: {mapError}</span>
        </div>
      )}

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        id="project-boundary-map-container"
        style={{
          width: '100%',
          height,
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          backgroundColor: '#0f172a',
          position: 'relative',
        }}
      >
        {!isMapLoaded && !mapError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              color: 'var(--text-muted)',
              fontSize: '0.875rem',
            }}
          >
            <span className="spinner-sm" />
            <span>Loading OpenStreetMap geospatial canvas...</span>
          </div>
        )}
      </div>

      {/* Spheroidal Area Display Card */}
      {currentGeometry && (
        <div
          className="map-area-summary-card"
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            backgroundColor: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: 'var(--status-active)',
              }}
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Calculated Geometry Area (PostGIS / Spheroidal):
            </span>
            <strong style={{ fontSize: '0.9375rem', color: '#fff' }} id="calculated-geometry-area-val">
              {(serverAreaSqm ?? calculatedAreaSqm).toLocaleString('en-IN', {
                maximumFractionDigits: 2,
              })}{' '}
              sq m
            </strong>
            <span style={{ fontSize: '0.8125rem', color: 'var(--accent-secondary)' }}>
              ({((serverAreaSqm ?? calculatedAreaSqm) / 10000).toFixed(4)} ha /{' '}
              {((serverAreaSqm ?? calculatedAreaSqm) / 4046.8564224).toFixed(4)} acres)
            </span>
          </div>

          {isValidatingServer && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Verifying PostGIS measurement...
            </span>
          )}
        </div>
      )}
    </div>
  );
}
