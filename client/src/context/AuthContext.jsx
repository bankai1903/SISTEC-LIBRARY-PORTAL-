import React, { createContext, useContext, useState, useEffect } from 'react';

export const BASE_URL = window.location.port ? `${window.location.protocol}//${window.location.hostname}:5000` : window.location.origin;

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('lib_token') || null);
  const [loading, setLoading] = useState(true);

  // C-3 FIX: Separate 'clear local session' from 'call logout API'.
  // Using logout() inside apiCall created an infinite loop:
  // 403 → logout() → call /auth/logout → 403 → logout() → ...
  // clearSession() only wipes local state without making any network call.
  const clearSession = () => {
    localStorage.removeItem('lib_token');
    setToken(null);
    setUser(null);
  };

  // Helper for API calls with token
  const apiCall = async (endpoint, options = {}) => {
    const url = `${BASE_URL}/api${endpoint}`;
    const isMultipart = options.body instanceof FormData;
    const headers = {
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    };

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (networkErr) {
      // C-3/L-4 FIX: Network failure (server offline) must NOT log the user out.
      // Only auth errors (401/403) should clear the session.
      throw new Error('Server is unreachable. Please check your connection and try again.');
    }

    if (response.status === 401 || response.status === 403) {
      if (endpoint !== '/auth/login') {
        // C-3 FIX: Use clearSession (no API call) instead of logout() to avoid infinite loop
        clearSession();
        throw new Error('Session expired or unauthorized');
      }
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  };

  const loadUser = async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const url = `${BASE_URL}/api/auth/me`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else if (response.status === 401 || response.status === 403) {
        // C-3/L-4 FIX: Only clear session on actual auth errors, not network failures.
        // This prevents a temporary server restart from logging the user out permanently.
        clearSession();
      }
      // Any other error (500, network timeout) → keep token, don't log out
    } catch (err) {
      // L-4 FIX: Network failure on startup should NOT destroy the session.
      console.warn('Could not reach server during session restore. Will retry on next action.', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, [token]);

  const login = async (username, password) => {
    const url = `${BASE_URL}/api/auth/login`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('lib_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (err) {
        console.error('Logout logging error:', err);
      }
    }
    localStorage.removeItem('lib_token');
    setToken(null);
    setUser(null);
  };

  const register = async (userData) => {
    const url = `${BASE_URL}/api/auth/register`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, register, apiCall, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};
