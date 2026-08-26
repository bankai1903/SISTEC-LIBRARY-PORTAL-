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

  // Clear local session state
  const clearSession = () => {
    localStorage.removeItem('lib_custom_user');
    setUser(null);
    setSession(null);
  };

  // Comprehensive Supabase Router for frontend actions
  const apiCall = async (endpoint, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};

    // 1. Branches
    if (endpoint === '/auth/branches' || endpoint === '/books/branches') {
      const { data, error } = await supabase.from('branches').select('*').order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    }

    // 2. Categories
    if (endpoint === '/books/categories') {
      const { data, error } = await supabase.from('categories').select('*, parent:parent_category_id(name)');
      if (error) throw error;
      return (data || []).map(c => ({ ...c, parent_name: c.parent ? c.parent.name : null }));
    }

    // 3. Books & PDF Storage
    if (endpoint === '/books' || endpoint.startsWith('/books/')) {
      if (endpoint === '/books' && method === 'GET') {
        const { data, error } = await supabase.from('books').select(`
          *,
          category:category_id(name),
          branch:branch_id(name)
        `).order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(b => ({
          ...b,
          category_name: b.category ? b.category.name : null,
          branch_name: b.branch ? b.branch.name : null,
          hasAccess: true  // All books unlocked for all users
        }));
      }

      // Bulk Upload Books (multiple PDFs)
      if (endpoint === '/books/bulk' && method === 'POST' && options.body instanceof FormData) {
        const formData = options.body;
        const category_id = parseInt(formData.get('category_id'));
        const branch_id = parseInt(formData.get('branch_id'));
        const priority = formData.get('priority');
        const sharedAuthor = (formData.get('author') || '').trim() || 'Unknown';
        const pdfFiles = formData.getAll('pdfs');

        let imported = 0, skipped = 0, errors = 0;
        const results = [];

        for (const pdfFile of pdfFiles) {
          const rawName = pdfFile.name.replace(/\.pdf$/i, '');
          const title = rawName.replace(/[_\-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

          try {
            // Check for duplicate (same title + branch)
            const { data: existing } = await supabase
              .from('books')
              .select('id')
              .eq('title', title)
              .eq('branch_id', branch_id)
              .maybeSingle();

            if (existing) {
              skipped++;
              results.push({ file: pdfFile.name, title, status: 'skipped', reason: 'Already exists' });
              continue;
            }

            // Upload PDF to Supabase Storage
            const fileName = `${Date.now()}-${pdfFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
            let pdf_url = null;
            const { error: uploadErr } = await supabase.storage
              .from('pdfs')
              .upload(fileName, pdfFile, { upsert: true });

            if (!uploadErr) {
              const { data: publicUrlData } = supabase.storage.from('pdfs').getPublicUrl(fileName);
              pdf_url = publicUrlData ? publicUrlData.publicUrl : null;
            } else {
              console.warn('Storage upload note for', pdfFile.name, ':', uploadErr.message);
            }

            const bookPayload = { title, author: sharedAuthor, category_id, branch_id, priority };
            if (pdf_url) bookPayload.pdf_url = pdf_url;

            const { data: inserted, error: insertErr } = await supabase
              .from('books')
              .insert([bookPayload])
              .select()
              .single();

            if (insertErr) throw insertErr;

            imported++;
            results.push({ file: pdfFile.name, title, status: 'success', bookId: inserted.id });
          } catch (err) {
            errors++;
            results.push({ file: pdfFile.name, title, status: 'error', reason: err.message });
          }
        }

        return {
          message: `Bulk import complete: ${imported} added, ${skipped} skipped, ${errors} errors`,
          imported,
          skipped,
          errors,
          results
        };
      }

      // Add or Edit Book with PDF file
      if (options.body instanceof FormData) {
        const formData = options.body;
        const title = formData.get('title');
        const author = formData.get('author');
        const category_id = parseInt(formData.get('category_id'));
        const branch_id = parseInt(formData.get('branch_id'));
        const priority = formData.get('priority');
        const pdfFile = formData.get('pdf');

        let pdf_url = null;
        if (pdfFile && pdfFile.name) {
          const fileName = `${Date.now()}-${pdfFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
          const { error: uploadErr } = await supabase.storage
            .from('pdfs')
            .upload(fileName, pdfFile, { upsert: true });

          if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage.from('pdfs').getPublicUrl(fileName);
            pdf_url = publicUrlData ? publicUrlData.publicUrl : null;
          } else {
            console.warn('Storage upload note:', uploadErr.message);
            pdf_url = `/uploads/${fileName}`;
          }
        }

        const bookPayload = { title, author, category_id, branch_id, priority };
        if (pdf_url) bookPayload.pdf_url = pdf_url;

        if (endpoint.startsWith('/books/') && method === 'PUT') {
          const bookId = endpoint.split('/').pop();
          const { data, error } = await supabase.from('books').update(bookPayload).eq('id', bookId).select().single();
          if (error) throw error;
          return { message: 'Book updated successfully', data };
        } else {
          const { data, error } = await supabase.from('books').insert([bookPayload]).select().single();
          if (error) throw error;
          return { message: 'Book created successfully', data };
        }
      }

      // Delete Single Book
      if (endpoint.startsWith('/books/') && method === 'DELETE') {
        const bookId = endpoint.split('/').pop();
        const { error } = await supabase.from('books').delete().eq('id', bookId);
        if (error) throw error;
        return { message: 'Book deleted successfully' };
      }

      // Bulk Delete Books
      if (endpoint === '/books/bulk-delete' && method === 'POST') {
        const { bookIds } = body;
        const { error } = await supabase.from('books').delete().in('id', bookIds);
        if (error) throw error;
        return { message: 'Selected books deleted successfully' };
      }

      if (method === 'POST') {
        const { data, error } = await supabase.from('books').insert([body]).select().single();
        if (error) throw error;
        return data;
      }
    }

    // 4. Users / Students
    if (endpoint === '/auth/users') {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    if (endpoint === '/auth/pending-users') {
      const { data, error } = await supabase.from('users').select('*').eq('role', 'student').eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    // Approve / Reject User
    if (endpoint.startsWith('/auth/approve-user/')) {
      const userId = endpoint.split('/').pop();
      const { data, error } = await supabase.from('users').update({ status: body.status }).eq('id', userId).select().single();
      if (error) throw error;
      return { message: `User status updated to ${body.status}`, data };
    }

    // Block User
    if (endpoint.endsWith('/block')) {
      const parts = endpoint.split('/');
      const userId = parts[parts.length - 2];
      const { data, error } = await supabase.from('users').update({ is_blocked: 1 }).eq('id', userId).select().single();
      if (error) throw error;
      return { message: 'User blocked', data };
    }

    // Unblock User
    if (endpoint.endsWith('/unblock')) {
      const parts = endpoint.split('/');
      const userId = parts[parts.length - 2];
      const { data, error } = await supabase.from('users').update({ is_blocked: 0 }).eq('id', userId).select().single();
      if (error) throw error;
      return { message: 'User unblocked', data };
    }

    // Delete single user
    if (endpoint.startsWith('/auth/users/') && method === 'DELETE') {
      const userId = endpoint.split('/').pop();
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw error;
      return { message: 'User deleted' };
    }

    // Bulk delete users
    if (endpoint === '/auth/bulk-delete') {
      const { userIds } = body;
      const { error } = await supabase.from('users').delete().in('id', userIds);
      if (error) throw error;
      return { message: 'Users deleted successfully' };
    }

    // 5. Permissions / Requests
    if (endpoint === '/permissions/pending-requests') {
      const { data, error } = await supabase.from('permissions').select('*, user:user_id(full_name, roll_number, branch_name), branch:branch_id(name)').eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(p => ({
        ...p,
        full_name: p.user ? p.user.full_name : null,
        roll_number: p.user ? p.user.roll_number : null,
        student_branch: p.user ? p.user.branch_name : null,
        requested_branch_name: p.branch ? p.branch.name : null,
        // keep legacy aliases too
        user_name: p.user ? p.user.full_name : null,
        user_branch: p.user ? p.user.branch_name : null,
        branch_name: p.branch ? p.branch.name : null
      }));
    }

    if (endpoint === '/permissions/my-requests') {
      if (!user) return [];
      const { data, error } = await supabase.from('permissions').select('*, branch:branch_id(name)').eq('user_id', user.id);
      if (error) throw error;
      return (data || []).map(p => ({ ...p, branch_name: p.branch ? p.branch.name : null }));
    }

    if (endpoint.startsWith('/permissions/action/') || endpoint.startsWith('/permissions/approve/')) {
      const permId = endpoint.split('/').pop();
      const { data, error } = await supabase.from('permissions').update({ status: body.status }).eq('id', permId).select().single();
      if (error) throw error;
      return { message: `Permission ${body.status}`, data };
    }

    if (endpoint === '/permissions/request' && method === 'POST') {
      const branchId = body.branchId || body.branch_id;

      // Check if request already exists
      const { data: existing } = await supabase
        .from('permissions')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('branch_id', branchId)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'pending') {
          throw new Error('You already have a pending request for this branch');
        }
        // Re-open a rejected request back to pending
        const { data, error } = await supabase
          .from('permissions')
          .update({ status: 'pending' })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      // New request
      const { data, error } = await supabase.from('permissions').insert([{
        user_id: user.id,
        branch_id: branchId,
        status: 'pending'
      }]).select().single();
      if (error) throw error;
      return data;
    }


    // 6. Analytics & Logs
    if (endpoint === '/analytics/dashboard') {
      const [{ count: totalStudents }, { count: totalBooks }, { count: totalDownloads }, { count: totalViews }, { count: totalLogins }, { count: totalLogouts }] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('books').select('*', { count: 'exact', head: true }),
        supabase.from('activity_logs').select('*', { count: 'exact', head: true }).eq('action_type', 'download'),
        supabase.from('activity_logs').select('*', { count: 'exact', head: true }).eq('action_type', 'view'),
        supabase.from('activity_logs').select('*', { count: 'exact', head: true }).eq('action_type', 'login'),
        supabase.from('activity_logs').select('*', { count: 'exact', head: true }).eq('action_type', 'logout')
      ]);

      const { data: logsData } = await supabase.from('activity_logs').select('*, user:user_id(full_name, role, roll_number), book:book_id(title)').order('created_at', { ascending: false }).limit(10);

      return {
        stats: {
          logins: totalLogins || 0,
          logouts: totalLogouts || 0,
          downloads: totalDownloads || 0,
          views: totalViews || 0,
          books: totalBooks || 0,
          students: totalStudents || 0
        },
        mostReadPerBranch: [],
        bestBook: null,
        topUser: null,
        activityLogs: (logsData || []).map(l => ({
          ...l,
          full_name: l.user ? l.user.full_name : null,
          role: l.user ? l.user.role : null,
          roll_number: l.user ? l.user.roll_number : null,
          book_title: l.book ? l.book.title : null
        })),
        branchPerformance: []
      };
    }

    if (endpoint === '/analytics/my-history') {
      if (!user) return [];
      const { data, error } = await supabase.from('activity_logs').select('*, book:book_id(title, author)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return (data || []).map(l => ({
        ...l,
        book_title: l.book ? l.book.title : null,
        book_author: l.book ? l.book.author : null
      }));
    }

    if (endpoint.startsWith('/analytics/logs')) {
      const { data, error, count } = await supabase.from('activity_logs').select('*, user:user_id(full_name, role), book:book_id(title)', { count: 'exact' }).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return {
        logs: (data || []).map(l => ({
          ...l,
          user_name: l.user ? l.user.full_name : null,
          user_role: l.user ? l.user.role : null,
          book_title: l.book ? l.book.title : null
        })),
        pagination: { page: 1, limit: 50, total: count || 0, totalPages: 1 }
      };
    }

    return [];
  };

  // Restore User Session
  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !currentSession) {
        clearSession();
        return;
      }

      setSession(currentSession);
      const authUserId = currentSession.user.id;

      const { data, error } = await supabase
        .from('users')
        .select('id, username, full_name, roll_number, branch_name, year, semester, bt_number, role, status, is_blocked')
        .eq('id', authUserId)
        .single();

      if (!error && data) {
        if (data.is_blocked === 1 || (data.role === 'student' && data.status !== 'approved')) {
          await supabase.auth.signOut();
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
        await supabase.auth.signOut();
        clearSession();
      }
    } catch (err) {
      console.warn('Error restoring session:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_OUT') {
        clearSession();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadUser();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [loadUser]);

  // Login
  const login = async (username, password) => {
    const fakeEmail = `${username.toLowerCase()}@sistec.local`;
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password: password
    });

    if (authError || !authData.user) {
      throw new Error('Invalid username or password');
    }

    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userRecord) {
      await supabase.auth.signOut();
      throw new Error('User profile not found in database');
    }

    if (userRecord.is_blocked === 1) {
      await supabase.auth.signOut();
      throw new Error('Your account has been blocked by the admin');
    }

    if (userRecord.role === 'student' && userRecord.status === 'pending') {
      await supabase.auth.signOut();
      throw new Error('Your account is pending admin approval');
    }

    if (userRecord.role === 'student' && userRecord.status === 'rejected') {
      await supabase.auth.signOut();
      throw new Error('Your registration request was rejected by the admin');
    }

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

    try {
      await supabase.from('activity_logs').insert([{
        user_id: userRecord.id,
        action_type: 'login',
        details: 'User logged in securely'
      }]);
    } catch (e) {
      console.warn('Could not write login activity log:', e);
    }

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
        console.error('Logout log error:', e);
      }
    }
    await supabase.auth.signOut();
    clearSession();
  };

  // Register
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

    // First check if username exists in our public table
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      throw new Error('Username is already taken');
    }

    // Sign up with Supabase Auth using a synthetic email
    const fakeEmail = `${username.toLowerCase()}@sistec.local`;
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: fakeEmail,
      password: password,
    });

    if (authError) {
      throw new Error(authError.message);
    }

    if (!authData.user) {
      throw new Error('Registration failed, please try again.');
    }

    const userId = authData.user.id; // UUID from Supabase Auth

    // Insert the public user profile
    const { data, error } = await supabase.from('users').insert([{
      id: userId,
      username,
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

    if (error) {
      // Rollback logic could go here if needed
      throw new Error('Failed to create user profile: ' + error.message);
    }
    
    // Automatically sign out so they wait for approval
    await supabase.auth.signOut();

    return { message: 'Registration successful! Awaiting admin approval.', data };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, login, logout, register, apiCall, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};
