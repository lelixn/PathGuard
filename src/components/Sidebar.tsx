
import {
  ArrowUpDown, LocateFixed, Route, Shield, Footprints,
  Lightbulb, CarFront, Camera, Trees, Layers3, MapPin,
  ChevronDown, SlidersHorizontal
} from 'lucide-react';

export type RouteMode = 'safest' | 'balanced' | 'shortest';

export type LayerState = {
  heatmap: boolean;
  lighting: boolean;
  footpaths: boolean;
  traffic: boolean;
  publicPlaces: boolean;
  incidents: boolean;
};

type SidebarProps = {
  city: string;
  setCity: (city: string) => void;
  start: string;
  setStart: (value: string) => void;
  end: string;
  setEnd: (value: string) => void;
  mode: RouteMode;
  setMode: (mode: RouteMode) => void;
  layers: LayerState;
  setLayers: (layers: LayerState) => void;
  onFindRoute: () => void;
  onLocate: () => void;
  loading: boolean;
};

const cities = [
  'Bhubaneswar, Odisha',
  'Delhi, India',
  'Mumbai, Maharashtra',
  'Bengaluru, Karnataka',
  'Hyderabad, Telangana',
  'Chennai, Tamil Nadu',
];

const layerOptions = [
  { key: 'heatmap', label: 'Safety heatmap', Icon: Layers3 },
  { key: 'lighting', label: 'Street lighting', Icon: Lightbulb },
  { key: 'footpaths', label: 'Footpaths', Icon: Footprints },
  { key: 'traffic', label: 'Traffic exposure', Icon: CarFront },
  { key: 'publicPlaces', label: 'Public facilities', Icon: Trees },
  { key: 'incidents', label: 'Incident data', Icon: Camera },
] as const;

export default function Sidebar(props: SidebarProps) {
  const {
    city, setCity, start, setStart, end, setEnd, mode, setMode,
    layers, setLayers, onFindRoute, onLocate, loading,
  } = props;

  function swapLocations() {
    setStart(end);
    setEnd(start);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <div>
          <span className="eyebrow">NAVIGATION SYSTEM</span>
          <h2>Route planner</h2>
        </div>
        <span className="live-dot" title="Interface ready" />
      </div>

      <div className="field-group">
        <label htmlFor="city">Operating city</label>
        <div className="select-wrap">
          <select id="city" value={city} onChange={(e) => setCity(e.target.value)}>
            {cities.map((item) => <option key={item}>{item}</option>)}
          </select>
          <ChevronDown size={16} />
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="start">Starting point</label>
        <div className="location-input start-input">
          <span className="location-dot green" />
          <input
            id="start"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="Enter starting point"
          />
          <button className="field-action" onClick={onLocate} title="Use map center" aria-label="Use map center">
            <LocateFixed size={17} />
          </button>
        </div>
      </div>

      <div className="field-group destination-group">
        <label htmlFor="end">Destination</label>
        <div className="location-input end-input">
          <span className="location-dot red" />
          <input
            id="end"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="Enter destination"
          />
        </div>
        <button className="swap-button" onClick={swapLocations} title="Swap start and destination" aria-label="Swap locations">
          <ArrowUpDown size={17} />
        </button>
      </div>

      <div className="section-label">
        <span>ROUTE PREFERENCE</span>
        <SlidersHorizontal size={14} />
      </div>

      <div className="route-modes">
        {([
          { id: 'safest', label: 'Safest', Icon: Shield },
          { id: 'balanced', label: 'Balanced', Icon: Route },
          { id: 'shortest', label: 'Shortest', Icon: Footprints },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`mode-card ${mode === id ? 'selected' : ''}`}
            onClick={() => setMode(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <button className="primary-button" onClick={onFindRoute} disabled={loading}>
        {loading ? 'Preparing route...' : 'Find safe route'}
        {!loading && <Route size={18} />}
      </button>

      <div className="section-label layer-heading">
        <span>MAP OVERLAYS</span>
        <Layers3 size={15} />
      </div>

      <div className="layer-list">
        {layerOptions.map(({ key, label, Icon }) => (
          <label key={key} className="layer-row">
            <Icon size={17} />
            <span>{label}</span>
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
            />
            <span className="toggle" />
          </label>
        ))}
      </div>

      <div className="sidebar-note">
        <Shield size={18} />
        <div>
          <strong>Data transparency</strong>
          <p>Risk estimates are provisional until validated against local evidence.</p>
        </div>
      </div>

      <div className="sidebar-footer">
        <MapPin size={14} />
        <span>PATHGUARD / PROTOTYPE 01</span>
        <span className="version">v0.1.0</span>
      </div>
    </aside>
  );
}
