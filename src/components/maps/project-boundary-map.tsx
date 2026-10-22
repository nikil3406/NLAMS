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
  // DOM-based vertex markers — visible regardless of WebGL/worker state
  const vertexMarkersRef = useRef<any[]>([]);

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

  // Clear all DOM vertex markers (safe to call at any time)
  const clearVertexMarkers = useCallback(() => {
    vertexMarkersRef.current.forEach((m) => m.remove());
    vertexMarkersRef.current = [];
  }, []);

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

        // Fix: MapLibre GL JS 6.x uses an ES module worker (.mjs). Next.js dev
        // server returns text/html for unknown module requests → worker fails →
        // GeoJSON sources (including draw hot/cold) cannot render features.
        // Serve the worker from /public where Next.js sets the correct MIME type.
        try {
          (maplibregl as any).workerUrl = '/maplibre-gl-worker.mjs';
        } catch {
          /* non-critical — map still renders raster tiles without worker */
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
            // Initialize Drawing Plugin
            const draw = new MapboxDraw({
              displayControlsDefault: false,
              controls: {
                polygon: false,
                trash: false,
              },
              styles: [
                // === Polygon Fill (inactive) ===
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
                    'fill-opacity': 0.3,
                  },
                },
                // === Polygon Stroke (inactive) ===
                {
                  id: 'gl-draw-polygon-stroke-inactive',
                  type: 'line',
                  filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                  layout: { 'line-cap': 'round', 'line-join': 'round' },
                  paint: {
                    'line-color': '#2563eb',
                    'line-width': 2,
                  },
                },
                // === Polygon Stroke (active) ===
                {
                  id: 'gl-draw-polygon-stroke-active',
                  type: 'line',
                  filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                  layout: { 'line-cap': 'round', 'line-join': 'round' },
                  paint: {
                    'line-color': '#60a5fa',
                    'line-dasharray': [0.2, 2],
                    'line-width': 2.5,
                  },
                },
                // === Line (active guide line while drawing) ===
                {
                  id: 'gl-draw-line-active',
                  type: 'line',
                  filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
                  layout: { 'line-cap': 'round', 'line-join': 'round' },
                  paint: {
                    'line-color': '#60a5fa',
                    'line-dasharray': [0.2, 2],
                    'line-width': 2,
                  },
                },
                // === Midpoints (orange dots between vertices for editing) ===
                {
                  id: 'gl-draw-polygon-midpoint',
                  type: 'circle',
                  filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
                  paint: {
                    'circle-radius': 4,
                    'circle-color': '#f97316',
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': '#fff',
                  },
                },
                // === Vertex Points (inactive polygon, white circle with blue ring) ===
                {
                  id: 'gl-draw-polygon-and-line-vertex-inactive',
                  type: 'circle',
                  filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
                  paint: {
                    'circle-radius': 5,
                    'circle-color': '#fff',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#2563eb',
                  },
                },
                // === Selected / Hot Vertex (blue filled, white ring) ===
                {
                  id: 'gl-draw-polygon-and-line-vertex-stroke-inactive',
                  type: 'circle',
                  filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
                  paint: {
                    'circle-radius': 7,
                    'circle-color': '#60a5fa',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#1e3a5f',
                  },
                },
                // === Active drawing point (cursor snapping dot) ===
                {
                  id: 'gl-draw-point-point-stroke-active',
                  type: 'circle',
                  filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'true'], ['!=', 'meta', 'midpoint']],
                  paint: {
                    'circle-radius': 8,
                    'circle-color': '#ffffff',
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#2563eb',
                  },
                },
              ],
            });

            map.addControl(draw as any, 'top-left');
            drawInstanceRef.current = draw;

            // Load initial geometry into draw if provided
            if (initialGeometry) {
              const featureId = draw.add({
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

            // ─── DOM Vertex Markers ────────────────────────────────────────────
            // MapboxDraw only emits 1-2 vertex GeoJSON features during drawing
            // AND the hot GeoJSON source requires a working WebGL worker to
            // render. Both issues are bypassed by placing maplibregl.Marker
            // objects (positioned <div> elements) on every map click while in
            // draw_polygon mode. They are always visible irrespective of worker
            // or WebGL state.

            const addVertexMarker = (lngLat: [number, number]) => {
              const el = document.createElement('div');
              el.style.cssText = [
                'width:12px', 'height:12px', 'border-radius:50%',
                'background:#ffffff', 'border:2.5px solid #2563eb',
                'box-shadow:0 0 0 3px rgba(37,99,235,0.3),0 1px 4px rgba(0,0,0,0.5)',
                'pointer-events:none', 'position:relative', 'z-index:10',
              ].join(';');
              const marker = new (maplibregl as any).Marker({ element: el, anchor: 'center' })
                .setLngLat(lngLat)
                .addTo(map);
              vertexMarkersRef.current.push(marker);
            };

            // Attach click listener — fires AFTER MapboxDraw processes the click
            const handleMapClickForVertex = (e: any) => {
              if (drawInstanceRef.current?.getMode?.() === 'draw_polygon') {
                addVertexMarker([e.lngLat.lng, e.lngLat.lat]);
              }
            };
            map.on('click', handleMapClickForVertex);

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

            (map as any).on('draw.create', () => {
              // Polygon completed — DOM markers served their purpose, remove them
              clearVertexMarkers();
              syncDraw();
            });
            (map as any).on('draw.update', syncDraw);
            (map as any).on('draw.delete', () => {
              clearVertexMarkers();
              syncDraw();
            });
            (map as any).on('draw.modechange', (e: any) => {
              setActiveDrawMode(e.mode);
              // Clean up markers whenever we leave draw_polygon mode
              if (e.mode !== 'draw_polygon') {
                clearVertexMarkers();
              }
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
      clearVertexMarkers();
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
    clearVertexMarkers(); // Remove any leftover vertex dots from a previous draw
    drawInstanceRef.current.deleteAll();
    drawInstanceRef.current.changeMode('draw_polygon');
    setActiveDrawMode('draw_polygon');
    handleGeometryUpdate(null);
  };

  const handleClear = () => {
    if (!drawInstanceRef.current) return;
    clearVertexMarkers(); // Remove vertex dots
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
