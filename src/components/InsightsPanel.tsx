
import { useEffect, useState } from 'react';
import {
  ShieldCheck, Footprints, Clock3, Route, TrendingUp,
  Lightbulb, Activity, ArrowUpRight, Info,
} from 'lucide-react';

type InsightsPanelProps = {
  routeReady: boolean;
  routeMode: string;
  city: string;
};

type NetworkSummary = {
  city: string;
  state: string;
  nodes: number;
  directed_edges: number;
  total_edge_length_km: number;
  average_edge_length_m: number;
  data_source: string;
  safety_scores_available: boolean;
};

export default function InsightsPanel({
  routeReady, routeMode, city,
}: InsightsPanelProps) {
  const [network, setNetwork] = useState<NetworkSummary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const cityId = city.split(',')[0].trim().toLowerCase();

  useEffect(() => {
    const controller = new AbortController();

    async function loadNetwork() {
      setStatus('loading');
      setNetwork(null);

      try {
        const response = await fetch(`/api/network/${encodeURIComponent(cityId)}`, {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error('Network request failed');

        const data: NetworkSummary = await response.json();
        setNetwork(data);
        setStatus('ready');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setStatus('error');
      }
    }

    loadNetwork();
    return () => controller.abort();
  }, [cityId]);

  const number = (value: number) => value.toLocaleString('en-IN');

  return (
    <section className="insights-grid">
      <article className="metric-card">
        <div className="metric-top">
          <span>GRAPH NODES</span>
          <span className="metric-icon"><Route size={17} /></span>
        </div>
        <div className="metric-value">
          {network ? number(network.nodes) : '—'}
        </div>
        <div className="metric-foot">
          <Info size={13} />
          {status === 'loading' ? 'Loading pedestrian graph' :
            status === 'error' ? 'Graph unavailable' : 'Real OSM graph nodes'}
        </div>
      </article>

      <article className="metric-card">
        <div className="metric-top">
          <span>NETWORK LENGTH</span>
          <span className="metric-icon"><Footprints size={17} /></span>
        </div>
        <div className="metric-value">
          {network ? `${number(network.total_edge_length_km)} km` : '—'}
        </div>
        <div className="metric-foot">Sum of directed edge lengths</div>
      </article>

      <article className="metric-card">
        <div className="metric-top">
          <span>SAFETY CONFIDENCE</span>
          <span className="metric-icon"><ShieldCheck size={17} /></span>
        </div>
        <div className="metric-value">Unrated</div>
        <div className="metric-foot">Verified risk model not implemented</div>
      </article>

      <article className="metric-card">
        <div className="metric-top">
          <span>WALKING TIME</span>
          <span className="metric-icon"><Clock3 size={17} /></span>
        </div>
        <div className="metric-value">—</div>
        <div className="metric-foot">Available after routing integration</div>
      </article>

      <article className="insight-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">LIVE WORKSPACE</span>
            <h3>Route intelligence</h3>
          </div>
          <Activity size={18} />
        </div>

        <div className="insight-row">
          <span className="insight-symbol cyan"><Route size={17} /></span>
          <div>
            <strong>Routing preference</strong>
            <small>{routeMode}</small>
          </div>
          <ArrowUpRight size={16} className="muted-icon" />
        </div>

        <div className="insight-row">
          <span className="insight-symbol green"><Lightbulb size={17} /></span>
          <div>
            <strong>Street infrastructure</strong>
            <small>OSM attributes require analysis</small>
          </div>
        </div>

        <div className="insight-row">
          <span className="insight-symbol orange"><TrendingUp size={17} /></span>
          <div>
            <strong>Risk distribution</strong>
            <small>Safety scoring is not yet available</small>
          </div>
        </div>
      </article>

      <article className="insight-card city-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CURRENT WORKSPACE</span>
            <h3>City overview</h3>
          </div>
          <span className="city-badge">OSM</span>
        </div>

        <div className="city-coordinate">
          <div className="city-symbol"><Footprints size={22} /></div>
          <div>
            <strong>{network?.city ?? city.split(',')[0]}</strong>
            <small>{network?.state ?? 'Selected map region'}</small>
          </div>
        </div>

        <div className="city-info-row">
          <span>Network status</span>
          <strong>{status === 'ready' ? 'Loaded' : status === 'error' ? 'Unavailable' : 'Loading'}</strong>
        </div>
        <div className="city-info-row">
          <span>Directed edges</span>
          <strong>{network ? number(network.directed_edges) : '—'}</strong>
        </div>
        <div className="city-info-row">
          <span>Source</span>
          <strong>{network?.data_source ?? 'OpenStreetMap'}</strong>
        </div>
        <div className="city-info-row">
          <span>Route selection</span>
          <strong>{routeReady ? 'Points selected' : 'Pending'}</strong>
        </div>
      </article>
    </section>
  );
}
