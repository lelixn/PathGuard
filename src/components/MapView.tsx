
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import {
  Plus,
  Minus,
  LocateFixed,
  Layers,
  Compass,
  RotateCcw,
} from 'lucide-react';
import type { LayerState } from './Sidebar';

export type MapPoint = {
  lng: number;
  lat: number;
};

type RouteData = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'LineString';
      coordinates: number[][];
    };
    properties: Record<string, unknown>;
  }>;
  metadata: {
    distance_km: number;
    estimated_walking_minutes: number;
    mode: string;
  };
};

type MapViewProps = {
  city: string;
  layers: LayerState;
  startPoint: MapPoint | null;
  endPoint: MapPoint | null;
  onMapClick: (lng: number, lat: number) => void;
  onResetRoute: () => void;
  routeData: RouteData | null;
};

type StreetProperties = {
  safety_score?: number | null;
  risk_level?: string;
  name?: string | null;
  highway?: string | null;
  reasons?: string[];
  data_completeness?: string;
};

type StreetCollection = FeatureCollection<LineString, StreetProperties> & {
  metadata?: {
    city?: string;
    returned_edges?: number;
    total_graph_edges?: number;
    truncated?: boolean;
    data_source?: string;
  };
};

const CITY_CENTERS: Record<string, [number, number]> = {
  'Bhubaneswar, Odisha': [85.8245, 20.2961],
  'Delhi, India': [77.209, 28.6139],
  'Mumbai, Maharashtra': [72.8777, 19.076],
  'Bengaluru, Karnataka': [77.5946, 12.9716],
  'Hyderabad, Telangana': [78.4867, 17.385],
  'Chennai, Tamil Nadu': [80.2707, 13.0827],
};

type OverlayStatus = 'loading' | 'ready' | 'empty' | 'error';

type OverlayResult = {
  cityId: string;
  status: Exclude<OverlayStatus, 'loading'>;
  streetCount: number;
  truncated: boolean;
};

const EMPTY_GEOJSON: FeatureCollection<LineString> = {
  type: 'FeatureCollection' as const,
  features: [],
};

export default function MapView({
  city,
  layers,
  startPoint,
  endPoint,
  onMapClick,
  onResetRoute,
  routeData,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const clickCallback = useRef(onMapClick);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [streetData, setStreetData] = useState<{
    cityId: string;
    collection: StreetCollection;
  } | null>(null);
  const [overlayResult, setOverlayResult] =
    useState<OverlayResult | null>(null);
  const cityId = city.split(',')[0].trim().toLowerCase();
  const currentOverlay =
    overlayResult?.cityId === cityId ? overlayResult : null;
  const overlayStatus: OverlayStatus = currentOverlay?.status ?? 'loading';
  const streetCount = currentOverlay?.streetCount ?? 0;
  const truncated = currentOverlay?.truncated ?? false;

  useEffect(() => {
    clickCallback.current = onMapClick;
  }, [onMapClick]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: CITY_CENTERS['Bhubaneswar, Odisha'],
      zoom: 12,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-base',
            type: 'raster',
            source: 'osm',
            paint: { 'raster-opacity': 0.95 },
          },
        ],
      },
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );

    map.on('load', () => {
      map.getCanvas().style.cursor = 'crosshair';

      // Real street geometry from the FastAPI backend.
      map.addSource('safety-streets', {
        type: 'geojson',
        data: EMPTY_GEOJSON,
      });

      map.addLayer({
        id: 'safety-streets-line',
        type: 'line',
        source: 'safety-streets',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: 'visible',
        },
        paint: {
          'line-color': [
            'match',
            ['get', 'risk_level'],
            'lower_estimated',
            '#17d9a3',
            'moderate_estimated',
            '#f5c451',
            'higher_estimated',
            '#ff625e',
            '#8795a5',
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 1.5,
            14, 3,
            17, 5,
          ],
          'line-opacity': 0.9,
        },
      });

      // Selected points and preview line.
      map.addSource('selected-route', {
        type: 'geojson',
        data: EMPTY_GEOJSON,
      });

      map.addLayer({
        id: 'selected-route-glow',
        type: 'line',
        source: 'selected-route',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#40dcf2',
          'line-width': 10,
          'line-opacity': 0.16,
          'line-blur': 4,
        },
      });

      map.addLayer({
        id: 'selected-route-line',
        type: 'line',
        source: 'selected-route',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#40dcf2',
          'line-width': 4,
          'line-opacity': 0.95,
        },
      });

      setMapLoaded(true);
    });

    map.on('click', (event) => {
      clickCallback.current(
        event.lngLat.lng,
        event.lngLat.lat,
      );
    });

    mapRef.current = map;

    return () => {
      startMarkerRef.current?.remove();
      endMarkerRef.current?.remove();
      startMarkerRef.current = null;
      endMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  const source = map.getSource(
    'selected-route',
  ) as maplibregl.GeoJSONSource | undefined;

  const features = routeData
    ? routeData.features
    : startPoint && endPoint
      ? [
          {
            type: 'Feature' as const,
            properties: { kind: 'preview' },
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [startPoint.lng, startPoint.lat],
                [endPoint.lng, endPoint.lat],
              ],
            },
          },
        ]
      : [];

  const data = {
    type: 'FeatureCollection' as const,
    features,
  };

  source?.setData(data);

  if (routeData && routeData.features.length > 0) {
    const bounds = new maplibregl.LngLatBounds();

    routeData.features.forEach((feature) => {
      feature.geometry.coordinates.forEach(([lng, lat]) => {
        bounds.extend([lng, lat]);
      });
    });

    map.fitBounds(bounds, {
      padding: { top: 90, bottom: 100, left: 90, right: 90 },
      maxZoom: 16,
      duration: 800,
    });
  }
}, [routeData, startPoint, endPoint]);

  // Move the map when the selected city changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const center =
      CITY_CENTERS[city] ?? CITY_CENTERS['Bhubaneswar, Odisha'];

    map.flyTo({
      center,
      zoom: 12,
      duration: 1000,
    });
  }, [city]);

  // Load the real street network and its estimated safety attributes.
  useEffect(() => {
    const controller = new AbortController();

    async function loadStreetData() {
      try {
        const response = await fetch(
          `/api/network/${encodeURIComponent(cityId)}/streets?limit=5000`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(
            `Street API returned ${response.status}: ${detail.slice(0, 250)}`,
          );
        }

        const data = (await response.json()) as StreetCollection;

        if (
          data.type !== 'FeatureCollection' ||
          !Array.isArray(data.features)
        ) {
          throw new Error('The street API returned invalid GeoJSON.');
        }

        // Keep only valid line features.
        const validFeatures = data.features.filter(
          (feature) =>
            feature?.type === 'Feature' &&
            feature.geometry?.type === 'LineString' &&
            Array.isArray(feature.geometry.coordinates),
        );

        const safeData: StreetCollection = {
          ...data,
          features: validFeatures,
        };

        setStreetData({ cityId, collection: safeData });
        setOverlayResult({
          cityId,
          status: validFeatures.length > 0 ? 'ready' : 'empty',
          streetCount: validFeatures.length,
          truncated: Boolean(data.metadata?.truncated),
        });
      } catch (error) {
        if (controller.signal.aborted) return;

        setStreetData(null);
        setOverlayResult({
          cityId,
          status: 'error',
          streetCount: 0,
          truncated: false,
        });
        console.error('PATHGUARD street overlay failed:', error);
      }
    }

    void loadStreetData();

    return () => controller.abort();
  }, [cityId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource(
      'safety-streets',
    ) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const collection =
      streetData?.cityId === cityId
        ? streetData.collection
        : EMPTY_GEOJSON;
    source.setData(collection);
  }, [cityId, mapLoaded, streetData]);

  // Toggle the real safety overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const updateVisibility = () => {
      if (!map.getLayer('safety-streets-line')) return;

      map.setLayoutProperty(
        'safety-streets-line',
        'visibility',
        layers.heatmap ? 'visible' : 'none',
      );
    };

    if (map.isStyleLoaded()) {
      updateVisibility();
    } else {
      map.once('load', updateVisibility);
    }
  }, [layers.heatmap, mapLoaded]);

  // Keep the A-to-B preview synchronized with the selected points.
  useEffect(() => {
    const features: Feature<LineString>[] = [];

    if (startPoint && endPoint) {
      features.push({
        type: 'Feature' as const,
        properties: { kind: 'preview' },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [startPoint.lng, startPoint.lat],
            [endPoint.lng, endPoint.lat],
          ],
        },
      });
    }

    const data = {
      type: 'FeatureCollection' as const,
      features,
    };

    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map?.getSource(
      'selected-route',
    ) as maplibregl.GeoJSONSource | undefined;

    source?.setData(data);
  }, [startPoint, endPoint, mapLoaded]);

  // Render A and B markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    startMarkerRef.current?.remove();
    endMarkerRef.current?.remove();

    startMarkerRef.current = null;
    endMarkerRef.current = null;

    if (startPoint) {
      const element = document.createElement('div');
      element.className = 'route-marker route-marker-start';
      element.textContent = 'A';
      element.setAttribute('aria-label', 'Starting point');

      startMarkerRef.current = new maplibregl.Marker({
        element,
        anchor: 'bottom',
      })
        .setLngLat([startPoint.lng, startPoint.lat])
        .addTo(map);
    }

    if (endPoint) {
      const element = document.createElement('div');
      element.className = 'route-marker route-marker-end';
      element.textContent = 'B';
      element.setAttribute('aria-label', 'Destination');

      endMarkerRef.current = new maplibregl.Marker({
        element,
        anchor: 'bottom',
      })
        .setLngLat([endPoint.lng, endPoint.lat])
        .addTo(map);
    }
  }, [startPoint, endPoint]);

  function fitSelectedPoints() {
    const points = [startPoint, endPoint].filter(
      (point): point is MapPoint => point !== null,
    );

    const map = mapRef.current;
    if (!map || points.length === 0) return;

    if (points.length === 1) {
      map.flyTo({
        center: [points[0].lng, points[0].lat],
        zoom: 15,
      });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point) =>
      bounds.extend([point.lng, point.lat]),
    );

    map.fitBounds(bounds, {
      padding: {
        top: 90,
        bottom: 100,
        left: 90,
        right: 90,
      },
      maxZoom: 15,
      duration: 800,
    });
  }

  const overlayLabel = {
    loading: 'LOADING STREET DATA',
    ready: `REAL STREET DATA · ${streetCount.toLocaleString()} SEGMENTS`,
    empty: 'NO STREET DATA AVAILABLE',
    error: 'STREET DATA UNAVAILABLE',
  }[overlayStatus];

  return (
    <div className="map-shell">
      <div className="map-container" ref={containerRef} />

      <div className="map-status">
        <span
          className={`status-dot ${overlayStatus === 'error' ? 'status-dot-error' : ''}`}
        />
        <span>BASE MAP ONLINE</span>
        <span className="status-divider" />
        <span>{overlayLabel}</span>
        {truncated && overlayStatus === 'ready' && (
          <>
            <span className="status-divider" />
            <span>FIRST 5,000 SEGMENTS</span>
          </>
        )}
      </div>

      {overlayStatus === 'error' && (
        <div className="map-data-warning">
          Safety overlay unavailable. Check the backend and try again.
        </div>
      )}

      {overlayStatus === 'empty' && (
        <div className="map-data-warning">
          No street segments were returned for this city.
        </div>
      )}

      <div className="map-controls">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus size={19} />
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus size={19} />
        </button>
        <button
          onClick={() =>
            mapRef.current?.easeTo({ bearing: 0, pitch: 0 })
          }
          title="Reset orientation"
          aria-label="Reset orientation"
        >
          <Compass size={18} />
        </button>
        <button
          onClick={fitSelectedPoints}
          title="Fit selected points"
          aria-label="Fit selected points"
        >
          <LocateFixed size={18} />
        </button>
        <button
          onClick={onResetRoute}
          title="Clear route points"
          aria-label="Clear route points"
        >
          <RotateCcw size={17} />
        </button>
      </div>

      <div className="map-legend">
        <div className="legend-title">
          <Layers size={14} /> ESTIMATED STREET RISK
        </div>
        <div>
          <i className="legend-swatch very-safe" /> Lower estimated risk
        </div>
        <div>
          <i className="legend-swatch moderate" /> Moderate estimated risk
        </div>
        <div>
          <i className="legend-swatch risky" /> Higher estimated risk
        </div>
        <small>
          OSM-based heuristic · not validated safety data
        </small>
      </div>

      <div className="map-hint">
        Click the map to set A, then B
      </div>
    </div>
  );
}
