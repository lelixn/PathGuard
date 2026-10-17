
import { Search, ShieldCheck, UserRound, Menu } from 'lucide-react';

type HeaderProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onMenuClick: () => void;
};

const tabs = ['Map', 'Find Route', 'Safety Insights', 'Cities'];

export default function Header({
  activeTab,
  onTabChange,
  onMenuClick,
}: HeaderProps) {
  return (
    <header className="topbar">
      <button className="mobile-menu icon-button" onClick={onMenuClick} aria-label="Open sidebar">
        <Menu size={20} />
      </button>

      <button className="brand" onClick={() => onTabChange('Map')} aria-label="PATHGUARD home">
        <span className="brand-mark"><ShieldCheck size={25} /></span>
        <span className="brand-copy">
          <strong>PATHGUARD<span>.</span></strong>
          <small>SAFER STREETS. SMARTER CITIES.</small>
        </span>
      </button>

      <nav className="topnav" aria-label="Main navigation">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <label className="global-search">
        <Search size={18} />
        <input
          type="search"
          placeholder="Search a place or landmark..."
          aria-label="Search a place or landmark"
        />
        <kbd>⌘ K</kbd>
      </label>

      <button className="avatar-button" aria-label="User profile">
        <UserRound size={19} />
      </button>
    </header>
  );
}
