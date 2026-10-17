
import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  ShieldCheck,
  X,
} from 'lucide-react';
import Header from './components/Header';
import Sidebar, {
  type LayerState,
  type RouteMode,
} from './components/Sidebar';
import MapView, { type MapPoint } from './components/MapView';
import InsightsPanel from './components/InsightsPanel';

type RouteFeature = {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  properties: Record<string, unknown>;
};

type RouteResult = {
  type: 'FeatureCollection';
  features: RouteFeature[];
  metadata: {
    city: string;
    mode: string;
    distance_m: number;
    distance_km: number;
    estimated_walking_minutes: number;
    average_estimated_safety_score: number | null;
    mapped_attribute_coverage_percent: number;
    route_segments: number;
    snapped_start_distance_m: number;
    snapped_end_distance_m: number;
    data_source: string;
    safety_model: string;
    validated_safety_data: boolean;
  };
};

function formatPoint(point: MapPoint) {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('Map');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [city, setCity] = useState('Bhubaneswar, Odisha');

  const [start, setStart] = useState('KIIT University');
  const [end, setEnd] = useState('Master Canteen Square');

  const [startPoint, setStartPoint] = useState<MapPoint | null>(null);
  const [endPoint, setEndPoint] = useState<MapPoint | null>(null);
  const [nextPoint, setNextPoint] = useState<'start' | 'end'>('start');

  const [mode, setMode] = useState<RouteMode>('safest');
  const [loading, setLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [notice, setNotice] = useState('');

  const [layers, setLayers] = useState<LayerState>({
    heatmap: true,
    lighting: false,
    footpaths: true,
    traffic: false,
    publicPlaces: false,
    incidents: false,
  });

  const clearRouteResult = useCallback(() => {
    setRouteResult(null);
  }, []);

  const onMapClick = useCallback(
    (lng: number, lat: number) => {
      const point = { lng, lat };

      clearRouteResult();

      if (nextPoint === 'start') {
        setStartPoint(point);
        setStart(formatPoint(point));
        setNextPoint('end');
        setNotice(
          'Starting point A selected. Click the map again to set destination B.',
        );
      } else {
        setEndPoint(point);
        setEnd(formatPoint(point));
        setNextPoint('start');
        setNotice(
          'Destination B selected. Select Find Route to calculate a real walking route.',
        );
      }
    },
    [nextPoint, clearRouteResult],
  );

  function resetRoute() {
    clearRouteResult();
    setStartPoint(null);
    setEndPoint(null);
    setNextPoint('start');
    setNotice('Route markers cleared. Select a new starting point.');
  }

  async function findRoute() {
    if (loading) return;

    if (!start.trim() || !end.trim()) {
      setNotice('Enter both a starting point and a destination.');
      return;
    }

    if (!startPoint || !endPoint) {
      setNotice(
        'Select both points on the map first. Click once for A and again for B.',
      );
      return;
    }

    const cityId = city.split(',')[0].trim().toLowerCase();
    const requestedMode = mode;
    const requestedCity = cityId;
    const requestedStart = { ...startPoint };
    const requestedEnd = { ...endPoint };

    setLoading(true);
    setRouteResult(null);
    setNotice('Calculating a pedestrian route from the street network...');

    const params = new URLSearchParams({
      start_lat: String(requestedStart.lat),
      start_lng: String(requestedStart.lng),
      end_lat: String(requestedEnd.lat),
      end_lng: String(requestedEnd.lng),
      mode: requestedMode,
    });

    try {
      const response = await fetch(
        `/api/route/${encodeURIComponent(requestedCity)}?${params.toString()}`,
      );

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          typeof body?.detail === 'string'
            ? body.detail
            : `Route calculation failed (HTTP ${response.status}).`;

        throw new Error(detail);
      }

      if (
        body?.type !== 'FeatureCollection' ||
        !Array.isArray(body.features) ||
        !body.metadata
      ) {
        throw new Error('The routing API returned an unexpected response.');
      }

      // Ignore a response if the user changed the requested route meanwhile.
      if (
        requestedCity !== city.split(',')[0].trim().toLowerCase() ||
        requestedMode !== mode ||
        requestedStart.lat !== startPoint?.lat ||
        requestedStart.lng !== startPoint?.lng ||
        requestedEnd.lat !== endPoint?.lat ||
        requestedEnd.lng !== endPoint?.lng
      ) {
        return;
      }

      setRouteResult(body as RouteResult);

      const distance = Number(body.metadata.distance_km);
      const minutes = Number(body.metadata.estimated_walking_minutes);

      setNotice(
        `Walking route found: ${distance.toFixed(2)} km, approximately ${Math.round(minutes)} minutes.`,
      );
    } catch (error) {
      if (error instanceof Error) {
        setNotice(error.message);
      } else {
        setNotice('Unable to calculate the walking route. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function useMapCenter() {
    if (startPoint) {
      setStart(formatPoint(startPoint));
      setNotice('Start field updated to marker A coordinates.');
    } else {
      setNotice('Click the map to place the starting marker first.');
    }
  }

  function changeCity(value: string) {
    setCity(value);
    clearRouteResult();
    setStartPoint(null);
    setEndPoint(null);
    setNextPoint('start');
    setNotice(`Map centered on ${value}. Select new route points.`);
  }

  function changeMode(value: RouteMode) {
    setMode(value);
    clearRouteResult();
  }

  return (
    <div className="app-shell">
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setNotice(
            tab === 'Map'
              ? ''
              : `${tab} workspace selected. Return to Map to plan a route.`,
          );
        }}
        onMenuClick={() => setSidebarOpen(true)}
      />

      {activeTab !== 'Map' && (
        <div className="workspace-banner">
          <ShieldCheck size={17} />
          <span>
            <strong>{activeTab}</strong> is part of the PATHGUARD roadmap.
            The map workspace remains available under Map.
          </span>
          <button
            onClick={() => setActiveTab('Map')}
            aria-label="Return to map"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <main className="workspace">
        {sidebarOpen && (
          <button
            className="mobile-scrim"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        <div className={`sidebar-wrap ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={19} />
          </button>

          <Sidebar
            city={city}
            setCity={changeCity}
            start={start}
            setStart={(value) => {
              setStart(value);
              clearRouteResult();
            }}
            end={end}
            setEnd={(value) => {
              setEnd(value);
              clearRouteResult();
            }}
            mode={mode}
            setMode={changeMode}
            layers={layers}
            setLayers={setLayers}
            onFindRoute={findRoute}
            onLocate={useMapCenter}
            loading={loading}
          />
        </div>

        <section className="main-content">
          {notice && (
            <div className="notice-banner" role="status">
              <AlertTriangle size={16} />
              <span>{notice}</span>
              <button
                onClick={() => setNotice('')}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>
          )}

          <div className="map-heading">
            <div>
              <span className="eyebrow">GEOSPATIAL INTELLIGENCE / 02</span>
              <h1>
                Street safety <span>command center</span>
              </h1>
              <p>
                Explore pedestrian infrastructure and risk-aware navigation.
              </p>
            </div>
            <div className="workspace-status">
              <span className="status-dot" /> MAP INTERACTIVE
            </div>
          </div>

          <div className="map-frame">
            <MapView
              city={city}
              layers={layers}
              startPoint={startPoint}
              endPoint={endPoint}
              onMapClick={onMapClick}
              onResetRoute={resetRoute}
              routeData={routeResult}
            />

            <div className="map-frame-footer">
              <span>
                <Crosshair size={13} />
                {startPoint
                  ? `A: ${formatPoint(startPoint)}`
                  : 'A: Not selected'}
              </span>
              <span>
                {endPoint
                  ? `B: ${formatPoint(endPoint)}`
                  : 'B: Not selected'}
              </span>
              <span>© OpenStreetMap contributors</span>
            </div>
          </div>

          {routeResult && (
            <section className="route-results" aria-live="polite">
              <div className="route-results-heading">
                <div>
                  <span className="eyebrow">CALCULATED WALKING ROUTE</span>
                  <h2>{routeResult.metadata.distance_km.toFixed(2)} km</h2>
                </div>
                <span className="route-mode-label">
                  {routeResult.metadata.mode.toUpperCase()}
                </span>
              </div>

              <div className="route-result-grid">
                <div>
                  <span>Estimated walking time</span>
                  <strong>
                    {Math.round(
                      routeResult.metadata.estimated_walking_minutes,
                    )} min
                  </strong>
                </div>
                <div>
                  <span>Route segments</span>
                  <strong>{routeResult.metadata.route_segments}</strong>
                </div>
                <div>
                  <span>Estimated score</span>
                  <strong>
                    {routeResult.metadata.average_estimated_safety_score ??
                      'N/A'}
                    {routeResult.metadata.average_estimated_safety_score !==
                    null
                      ? '/100'
                      : ''}
                  </strong>
                </div>
                <div>
                  <span>Mapped attributes</span>
                  <strong>
                    {routeResult.metadata.mapped_attribute_coverage_percent}%
                  </strong>
                </div>
              </div>

              <p className="route-disclaimer">
                Walking time is an estimate. Safety scores use mapped street
                attributes and are not validated crime or personal-safety
                predictions.
              </p>

              {Math.max(
                routeResult.metadata.snapped_start_distance_m,
                routeResult.metadata.snapped_end_distance_m,
              ) > 30 && (
                <p className="route-disclaimer">
                  One or more selected points were snapped to a mapped street.
                  Start offset:{' '}
                  {routeResult.metadata.snapped_start_distance_m} m; destination
                  offset: {routeResult.metadata.snapped_end_distance_m} m.
                </p>
              )}
            </section>
          )}

          <InsightsPanel
            routeReady={Boolean(routeResult)}
            routeMode={mode}
            city={city}
          />

          <footer className="app-footer">
            <span>
              PATHGUARD <span className="footer-separator">/</span> BUILT FOR
              SAFER WALKING
            </span>
            <span>
              Prototype v0.3.0 <span className="footer-separator">·</span>{' '}
              {routeResult ? 'Route calculated' : 'Pedestrian routing enabled'}
            </span>
          </footer>
        </section>
      </main>
    </div>
  );
}
