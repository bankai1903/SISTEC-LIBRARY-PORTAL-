import { useState, useEffect } from 'react';
import { useAuth, BASE_URL } from '../context/AuthContext';
import { BookOpen, LogIn, Shield, User, Settings } from 'lucide-react';

const Login = ({ onToggleView }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverIp, setServerIp] = useState(localStorage.getItem('lib_server_url') || BASE_URL);

  const saveServerIp = () => {
    if (serverIp.trim()) {
      localStorage.setItem('lib_server_url', serverIp.trim());
      window.location.reload();
    }
  };

  useEffect(() => {
    document.title = 'Login - SISTEC Library';
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (user, pass) => {
    setUsername(user);
    setPassword(pass);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '420px',
        padding: 'var(--card-padding, 40px)',
        position: 'relative'
      }}>
        {/* Server Config Gear Button */}
        <button
          onClick={() => setShowServerConfig(!showServerConfig)}
          className="btn btn-secondary"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '6px',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
          type="button"
          title="Server Settings"
        >
          <Settings size={16} />
        </button>



        {/* Server Config Drawer */}
        {showServerConfig && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-glass)',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <h4 style={{ marginBottom: '12px', fontSize: '0.9rem', color: 'var(--primary)' }}>Server Connection Settings</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                className="glass-input"
                placeholder="e.g. http://192.168.1.3:5000"
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
                style={{ fontSize: '0.85rem', padding: '8px 12px' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  onClick={saveServerIp}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                  type="button"
                >
                  Save & Reload
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('lib_server_url');
                    window.location.reload();
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                  type="button"
                >
                  Reset Default
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-neon)'
          }}>
            <BookOpen size={32} color="#ffffff" />
          </div>
          <h2>Library Portal</h2>
          <p style={{ marginTop: '8px', fontSize: '0.9rem' }}>SISTEC Library Management System</p>
        </div>

        {error && (
          <div className="badge-danger" style={{
            padding: '12px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            width: '100%',
            marginBottom: '20px',
            textTransform: 'none',
            display: 'block',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Username
            </label>
            <input
              type="text"
              className="glass-input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              type="password"
              className="glass-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px' }}
            disabled={loading}
          >
            {loading ? 'Signing In...' : <><LogIn size={18} /> Sign In</>}
          </button>
        </form>

        {/* Quick Fills for Testers */}
        <div style={{
          marginTop: '32px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-glass)',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Quick fill for testing:
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => fillCredentials('admin', 'admin123')}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px' }}
            >
              <Shield size={12} style={{ marginRight: '4px' }} /> Admin
            </button>
            <button
              onClick={() => fillCredentials('student_cs', 'student123')}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px' }}
            >
              <User size={12} style={{ marginRight: '4px' }} /> Student (CS)
            </button>
          </div>
        </div>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem' }}>
            Don't have an account?{' '}
            <span
              onClick={onToggleView}
              style={{
                color: 'var(--secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                textDecoration: 'underline'
              }}
            >
              Register Now
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
