import { useState } from 'react';
import { Sun, Moon, Palette, X, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = () => {
  const {
    mode, toggleMode,
    paletteId, selectPalette,
    palettes,
    customPrimary, setCustomPrimary,
    customSecondary, setCustomSecondary,
  } = useTheme();

  const [panelOpen, setPanelOpen] = useState(false);

  const isDark = mode === 'dark';

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes themeSlideUp {
          from { opacity:0; transform: translateY(16px) scale(0.96); }
          to   { opacity:1; transform: translateY(0) scale(1); }
        }
        .theme-fab:hover { transform: scale(1.12) !important; }
        .palette-swatch:hover { transform: scale(1.18) !important; }
      `}</style>

      {/* FAB group */}
      <div className="theme-fab-container">
        {/* Mode toggle */}
        <button
          className="theme-fab theme-fab-btn"
          onClick={toggleMode}
          title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
          aria-label="Toggle dark/light mode"
        >
          {isDark
            ? <Sun size={20} color="var(--warning)" />
            : <Moon size={20} color="var(--primary)" />
          }
        </button>

        {/* Palette picker toggle */}
        <button
          className={`theme-fab theme-fab-btn ${panelOpen ? 'active' : ''}`}
          onClick={() => setPanelOpen(o => !o)}
          title="Customise theme palette"
          aria-label="Open theme panel"
        >
          {panelOpen
            ? <X size={20} />
            : <Palette size={20} />
          }
        </button>
      </div>

      {/* Colour Palette Panel */}
      {panelOpen && (
        <div className="theme-studio-panel">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Palette size={18} color="var(--primary)" />
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Theme Studio
              </span>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Dark / Light Mode Row */}
          <div style={{ marginBottom: '22px' }}>
            <p className="theme-studio-section-title">Mode</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isDark
                  ? <Moon size={16} color="var(--primary)" />
                  : <Sun size={16} color="var(--warning)" />
                }
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </span>
              </div>
              <button className={`theme-mode-track ${isDark ? 'active' : ''}`} onClick={toggleMode} aria-label="Toggle mode">
                <div className={`theme-mode-knob ${isDark ? 'active' : ''}`}>
                  {isDark
                    ? <Moon size={11} color="var(--primary)" />
                    : <Sun size={11} color="var(--warning)" />
                  }
                </div>
              </button>
            </div>
          </div>

          {/* Preset Palettes */}
          <div style={{ marginBottom: '22px' }}>
            <p className="theme-studio-section-title">Colour Palette</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {palettes.filter(p => p.id !== 'custom').map(palette => {
                const isActive = paletteId === palette.id;
                return (
                  <button
                    key={palette.id}
                    className="palette-swatch"
                    onClick={() => selectPalette(palette.id)}
                    title={palette.label}
                    aria-label={`Select ${palette.label} palette`}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: '12px',
                      border: isActive ? '2.5px solid var(--text-primary)' : '2px solid transparent',
                      background: `linear-gradient(135deg, ${palette.primary}, ${palette.secondary})`,
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'transform 0.15s ease, border 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isActive ? `0 0 0 1px rgba(255,255,255,0.2)` : 'none',
                    }}
                  >
                    {isActive && (
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.3)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={11} color="#fff" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Palette name labels row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '6px' }}>
              {palettes.filter(p => p.id !== 'custom').map(palette => (
                <span key={palette.id} style={{
                  fontSize: '0.6rem',
                  color: paletteId === palette.id ? 'var(--primary)' : 'var(--text-muted)',
                  textAlign: 'center',
                  fontWeight: paletteId === palette.id ? 700 : 400,
                  lineHeight: 1.2,
                }}>
                  {palette.label}
                </span>
              ))}
            </div>
          </div>

          {/* Custom Colour Pickers */}
          <div>
            <p className="theme-studio-section-title">Custom Colours</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Primary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: customPrimary,
                  border: '2px solid var(--border-glass)',
                  flexShrink: 0,
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <input
                    type="color"
                    value={customPrimary}
                    onChange={(e) => { setCustomPrimary(e.target.value); selectPalette('custom'); }}
                    style={{
                      position: 'absolute', inset: '-4px',
                      width: 'calc(100% + 8px)', height: 'calc(100% + 8px)',
                      border: 'none', cursor: 'pointer', opacity: 0,
                    }}
                    title="Pick primary colour"
                  />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Palette size={14} color="rgba(255,255,255,0.8)" />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block' }}>Primary</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customPrimary}</span>
                </div>
                <label style={{
                  padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem',
                  fontWeight: 600, cursor: 'pointer',
                  background: 'var(--primary)', color: '#fff',
                  border: 'none', fontFamily: 'var(--font-sans)',
                }}>
                  Pick
                  <input
                    type="color"
                    value={customPrimary}
                    onChange={(e) => { setCustomPrimary(e.target.value); selectPalette('custom'); }}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Secondary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: customSecondary,
                  border: '2px solid var(--border-glass)',
                  flexShrink: 0,
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <input
                    type="color"
                    value={customSecondary}
                    onChange={(e) => { setCustomSecondary(e.target.value); selectPalette('custom'); }}
                    style={{
                      position: 'absolute', inset: '-4px',
                      width: 'calc(100% + 8px)', height: 'calc(100% + 8px)',
                      border: 'none', cursor: 'pointer', opacity: 0,
                    }}
                    title="Pick secondary colour"
                  />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Palette size={14} color="rgba(255,255,255,0.8)" />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block' }}>Secondary / Accent</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customSecondary}</span>
                </div>
                <label style={{
                  padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem',
                  fontWeight: 600, cursor: 'pointer',
                  background: 'var(--secondary)', color: '#fff',
                  border: 'none', fontFamily: 'var(--font-sans)',
                }}>
                  Pick
                  <input
                    type="color"
                    value={customSecondary}
                    onChange={(e) => { setCustomSecondary(e.target.value); selectPalette('custom'); }}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {/* Live preview strip */}
            <div style={{
              marginTop: '16px',
              height: '8px',
              borderRadius: '4px',
              background: `linear-gradient(90deg, var(--primary), var(--secondary))`,
              transition: 'background 0.3s ease',
            }} />
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textAlign: 'center', marginTop: '6px' }}>
              Live preview ↑
            </span>
          </div>
        </div>
      )}
    </>
  );
};

export default ThemeToggle;
