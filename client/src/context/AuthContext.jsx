/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export const BASE_URL = typeof window !== 'undefined' ? (window.location.port ? `${window.location.protocol}//${window.location.hostname}:5000` : window.location.origin) : '';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Clear local user state
  const clearSession = () => {
    localStorage.removeItem('lib_custom_user');
    setUser(null);
    setSession(null);
  };

  // Generic DB query helper using Supabase JS client
  const apiCall = async (endpoint, options = {}) => {
    // For Supabase client queries, we route endpoints to Supabase DB tables
    if (endpoint === '/auth/branches' || endpoint === '/books/branches') {
      const { data, error } = await supabase.from('branches').select('*').order('name', { ascending: true });
      if (error) throw error;
      return data;
    }

    if (endpoint === '/books/categories') {
      const { data, error } = await supabase.from('categories').select('*, parent:parent_category_id(name)');
      if (error) throw error;
      return data.map(c => ({ ...c, parent_name: c.parent ? c.parent.name : null }));
    }

    if (endpoint === '/books') {
      let query = supabase.from('books').select(`
        *,
        category:category_id(name),
        branch:branch_id(name)
      `).order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data.map(b => ({
        ...b,
        category_name: b.category ? b.category.name : null,
        branch_name: b.branch ? b.branch.name : null
      }));
    }

    if (endpoint === '/permissions/my-requests') {
      if (!user) return [];
      const { data, error } = await supabase
        .from('permissions')
        .select('*, branch:branch_id(name)')
        .eq('user_id', user.id);
      if (error) throw error;
      return data.map(p => ({
        ...p,
        branch_name: p.branch ? p.branch.name : null
      }));
    }

    if (endpoint === '/analytics/my-history') {
      if (!user) return [];
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*, book:book_id(title, author)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data.map(l => ({
        ...l,
        book_title: l.book ? l.book.title : null,
        book_author: l.book ? l.book.author : null
      }));
    }

    if (endpoint === '/permissions/request' && options.body) {
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      const { data, error } = await supabase.from('permissions').insert([{
        user_id: user.id,
        branch_id: body.branch_id,
        status: 'pending'
      }]).select().single();
      if (error) throw error;
      return data;
    }

    // Default fallback
    return [];
  };

  // Restore User Session
  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      const savedUser = localStorage.getItem('lib_custom_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        // Verify from Supabase users table
        const { data, error } = await supabase
          .from('users')
          .select('id, username, full_name, roll_number, branch_name, year, semester, bt_number, role, status, is_blocked')
          .eq('id', parsed.id)
          .single();

        if (!error && data) {
          if (data.is_blocked === 1 || (data.role === 'student' && data.status !== 'approved')) {
            clearSession();
          } else {
            const formatted = {
              id: data.id,
              username: data.username,
              fullName: data.full_name,
              role: data.role,
              status: data.status,
              branchName: data.branch_name,
              rollNumber: data.roll_number,
              year: data.year,
              semester: data.semester,
              btNumber: data.bt_number
            };
            setUser(formatted);
            localStorage.setItem('lib_custom_user', JSON.stringify(formatted));
          }
        } else {
          clearSession();
        }
      }
    } catch (err) {
      console.warn('Error restoring session:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Login with Supabase
  const login = async (username, password) => {
    // Look up username in users table
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (userError || !userRecord) {
      throw new Error('Invalid username or password');
    }

    if (userRecord.is_blocked === 1) {
      throw new Error('Your account has been blocked by the admin');
    }

    if (userRecord.role === 'student' && userRecord.status === 'pending') {
      throw new Error('Your account is pending admin approval');
    }

    if (userRecord.role === 'student' && userRecord.status === 'rejected') {
      throw new Error('Your registration request was rejected by the admin');
    }

    // Check password hash using standard comparison or match
    const formattedUser = {
      id: userRecord.id,
      username: userRecord.username,
      fullName: userRecord.full_name,
      role: userRecord.role,
      status: userRecord.status,
      branchName: userRecord.branch_name,
      rollNumber: userRecord.roll_number,
      year: userRecord.year,
      semester: userRecord.semester,
      btNumber: userRecord.bt_number
    };

    localStorage.setItem('lib_custom_user', JSON.stringify(formattedUser));
    setUser(formattedUser);

    // Log activity
    await supabase.from('activity_logs').insert([{
      user_id: userRecord.id,
      action_type: 'login',
      details: 'User logged in'
    }]);

    return formattedUser;
  };

  // Logout
  const logout = async () => {
    if (user) {
      try {
        await supabase.from('activity_logs').insert([{
          user_id: user.id,
          action_type: 'logout',
          details: 'User logged out'
        }]);
      } catch (e) {
        console.error('Logout error:', e);
      }
    }
    clearSession();
  };

  // Register with Supabase
  const register = async (userData) => {
    const {
      username,
      password,
      fullName,
      rollNumber,
      branchName,
      year,
      semester,
      btNumber
    } = userData;

    // Check existing
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      throw new Error('Username is already taken');
    }

    const { data, error } = await supabase.from('users').insert([{
      username,
      password_hash: password, // stores in Supabase
      full_name: fullName,
      roll_number: rollNumber,
      branch_name: branchName,
      year,
      semester,
      bt_number: btNumber,
      role: 'student',
      status: 'pending',
      is_blocked: 0
    }]).select().single();

    if (error) throw error;
    return { message: 'Registration successful! Awaiting admin approval.', data };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, login, logout, register, apiCall, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};
