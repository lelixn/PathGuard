
import { useCallback, useState } from 'react';
import { AlertTriangle, Crosshair, ShieldCheck, X } from 'lucide-react';
import Header from './components/Header';
import Sidebar, {
  type LayerState,
  type RouteMode,
} from './components/Sidebar';
import MapView, { type MapPoint } from './components/MapView';
import InsightsPanel from './components/InsightsPanel';

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
  const [loading] = useState(false);
  const [notice, setNotice] = useState('');

  const [layers, setLayers] = useState<LayerState>({
    heatmap: true,
    lighting: false,
    footpaths: true,
    traffic: false,
    publicPlaces: false,
    incidents: false,
  });

  const onMapClick = useCallback((lng: number, lat: number) => {
    const point = { lng, lat };

    if (nextPoint === 'start') {
      setStartPoint(point);
      setStart(formatPoint(point));
      setNextPoint('end');
      setNotice('Start point A selected. Click the map again to set destination B.');
    } else {
      setEndPoint(point);
      setEnd(formatPoint(point));
      setNextPoint('start');
      setNotice('Destination B selected. The line is a straight-line preview, not a walking route.');
    }
  }, [nextPoint]);

  

  function resetRoute() {
    setStartPoint(null);
    setEndPoint(null);
    setNextPoint('start');
    setNotice('Route markers cleared. Click the map to select a new start point.');
  }

  function findRoute() {
    if (!start.trim() || !end.trim()) {
      setNotice('Enter both a starting point and a destination.');
      return;
    }

    if (!startPoint || !endPoint) {
      setNotice('Select both points on the map first. Click once for A and again for B.');
      return;
    }

    setNotice(
      `Preview ready: ${mode} preference selected. Real pedestrian routing will be added when the backend is connected.`,
    );
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
    setStartPoint(null);
    setEndPoint(null);
    setNextPoint('start');
    setNotice(`Map centered on ${value}. Select new route points on the map.`);
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
              : `${tab} workspace selected. Additional functionality will be added in later stages.`,
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
          <button onClick={() => setActiveTab('Map')} aria-label="Return to map">
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
            setStart={setStart}
            end={end}
            setEnd={setEnd}
            mode={mode}
            setMode={setMode}
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
              <button onClick={() => setNotice('')} aria-label="Dismiss notification">
                <X size={15} />
              </button>
            </div>
          )}

          <div className="map-heading">
            <div>
              <span className="eyebrow">GEOSPATIAL INTELLIGENCE / 02</span>
              <h1>Street safety <span>command center</span></h1>
              <p>Explore pedestrian infrastructure and risk-aware navigation.</p>
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
            />

            <div className="map-frame-footer">
              <span>
                <Crosshair size={13} />
                {startPoint ? `A: ${formatPoint(startPoint)}` : 'A: Not selected'}
              </span>
              <span>
                {endPoint ? `B: ${formatPoint(endPoint)}` : 'B: Not selected'}
              </span>
              <span>© OpenStreetMap contributors</span>
            </div>
          </div>

          <InsightsPanel
            routeReady={Boolean(startPoint && endPoint)}
            routeMode={mode}
            city={city}
          />

          <footer className="app-footer">
            <span>PATHGUARD <span className="footer-separator">/</span> BUILT FOR SAFER WALKING</span>
            <span>Prototype v0.2.0 <span className="footer-separator">·</span> Routing backend pending</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
