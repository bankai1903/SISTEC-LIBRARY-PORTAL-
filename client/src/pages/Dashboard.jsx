import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth, BASE_URL } from '../context/AuthContext';
import { 
  Book, BookOpen, Download, Lock, Unlock, Search, LogOut, CheckCircle, 
  Clock, ShieldAlert, BookMarked, User, GraduationCap, X
} from 'lucide-react';

const Dashboard = ({ onSelectBook }) => {
  const { user, logout, apiCall } = useAuth();

  useEffect(() => {
    document.title = 'Student Dashboard - SISTEC Library';
  }, []);
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  
  // Search & Filter state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'home', 'other', 'history'
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [feedbackMsg, setFeedbackMsg] = useState({ text: '', type: '' });
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);

  const showFeedback = useCallback((text, type = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg({ text: '', type: '' }), 5000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [booksData, catsData, branchesData, reqsData, histData] = await Promise.all([
        apiCall('/books'),
        apiCall('/books/categories'),
        apiCall('/books/branches'),
        apiCall('/permissions/my-requests'),
        apiCall('/analytics/my-history')
      ]);
      
      setBooks(booksData);
      setCategories(catsData);
      setBranches(branchesData);
      setRequests(reqsData);
      setHistory(histData);
    } catch (err) {
      showFeedback(err.message || 'Error loading dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiCall, showFeedback]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const handleRequestAccess = async (branchId, branchName) => {
    try {
      setActionLoading(prev => ({ ...prev, [branchId]: true }));
      const data = await apiCall('/permissions/request', {
        method: 'POST',
        body: JSON.stringify({ branch_id: branchId })
      });
      showFeedback(data.message || `Requested access for ${branchName}`, 'success');
      
      // Optimistically update requests
      setRequests(prev => [...prev, { branch_id: branchId, status: 'pending' }]);
      
      // Refresh requests list
      const reqsData = await apiCall('/permissions/my-requests');
      setRequests(reqsData);
    } catch (err) {
      showFeedback(err.message || 'Failed to request branch access', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [branchId]: false }));
    }
  };

  const handleDownload = async (book) => {
    try {
      showFeedback(`Starting download for "${book.title}"...`, 'success');
      await apiCall('/analytics/track', {
        method: 'POST',
        body: JSON.stringify({ book_id: book.id, action_type: 'download' })
      });

      // Trigger browser download for the actual file
      const link = document.createElement('a');
      if (book.pdf_url && book.pdf_url.startsWith('/uploads/')) {
        link.href = `${BASE_URL}${book.pdf_url}`;
        link.setAttribute('target', '_blank');
        const filename = book.pdf_url.split('/').pop();
        link.setAttribute('download', filename);
      } else {
        // Fallback for seeded mock PDF content
        const blob = new Blob([`Simulated PDF Content for ${book.title}`], { type: 'application/pdf' });
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `${book.title.toLowerCase().replace(/ /g, '_')}.pdf`);
      }
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showFeedback(`"${book.title}" downloaded successfully!`, 'success');
      
      // Refresh local lists
      const [histData, booksData] = await Promise.all([
        apiCall('/analytics/my-history'),
        apiCall('/books')
      ]);
      setHistory(histData);
      setBooks(booksData);
    } catch (err) {
      showFeedback(err.message || 'Download failed', 'error');
    }
  };

  const isRequestPending = (branchId) => {
    return requests.some(r => r.branch_id === branchId && r.status === 'pending');
  };

  const isRequestRejected = (branchId) => {
    return requests.some(r => r.branch_id === branchId && r.status === 'rejected');
  };

  // Filter books based on activeTab, search, selectedCategory, and selectedBranch
  const filteredBooks = useMemo(() => {
    return books.filter(book => {
      // 1. Tab filters
      if (activeTab === 'home') {
        if (book.branch_name !== user.branchName) return false;
      } else if (activeTab === 'other') {
        if (book.branch_name === user.branchName) return false;
      }

      // 2. Category filter
      if (selectedCategory && book.category_id !== parseInt(selectedCategory, 10)) {
        return false;
      }

      // 3. Branch filter
      if (selectedBranch && book.branch_id !== parseInt(selectedBranch, 10)) {
        return false;
      }

      if (search) {
        const query = search.toLowerCase();
        const matchTitle = book.title?.toLowerCase().includes(query) || false;
        const matchAuthor = book.author?.toLowerCase().includes(query) || false;
        const matchCat = book.category_name?.toLowerCase().includes(query) || false;
        if (!matchTitle && !matchAuthor && !matchCat) return false;
      }

      return true;
    });
  }, [books, activeTab, selectedCategory, selectedBranch, search, user.branchName]);

  return (
    <div className="app-container">
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={20} color="var(--secondary)" />
          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            SISTEC Library
          </span>
        </div>
        <button 
          onClick={() => setShowProfileDrawer(true)}
          className="btn btn-secondary mobile-profile-btn"
          style={{ padding: '6px', borderRadius: '50%', width: '32px', height: '32px', minWidth: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <User size={16} />
        </button>
      </header>

      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
            <BookOpen size={28} color="var(--secondary)" />
            <h3 style={{ fontSize: '1.25rem', background: 'linear-gradient(135deg, #ffffff, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              SISTEC Library
            </h3>
          </div>

          {/* Student Profile Overview */}
          <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <User size={16} color="var(--primary)" />
              <strong style={{ color: 'var(--text-primary)' }}>{user.fullName}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
              <GraduationCap size={14} />
              <span>{user.rollNumber}</span>
            </div>
            <div style={{ margin: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }} />
            <div style={{ color: 'var(--text-secondary)' }}>
              <strong>Branch:</strong> {user.branchName}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              <strong>Year:</strong> {user.year}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              <strong>Sem:</strong> {user.semester}
            </div>
            <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              <strong>BT ID:</strong> {user.btNumber}
            </div>
          </div>

          {/* Sidebar Nav */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              onClick={() => { setActiveTab('all'); setSelectedBranch(''); }}
              className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 16px' }}
            >
              <Book size={16} /> All Books
            </button>
            <button 
              onClick={() => { setActiveTab('home'); setSelectedBranch(''); }}
              className={`btn ${activeTab === 'home' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 16px' }}
            >
              <CheckCircle size={16} /> Home Branch
            </button>
            <button 
              onClick={() => { setActiveTab('other'); setSelectedBranch(''); }}
              className={`btn ${activeTab === 'other' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 16px' }}
            >
              <Lock size={16} /> Extra Branches
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', width: '100%', padding: '10px 16px' }}
            >
              <Clock size={16} /> Reading Progress
            </button>
          </nav>
        </div>

        <button 
          onClick={logout}
          className="btn btn-secondary"
          style={{ justifyContent: 'center', width: '100%', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
        >
          <LogOut size={16} /> Log Out
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Floating Toast Notification */}
        {feedbackMsg.text && (
          <div className="animate-fade-in" style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 1000,
            padding: '14px 20px',
            borderRadius: '10px',
            background: feedbackMsg.type === 'error' ? '#7f1d1d' : '#064e3b',
            border: `1px solid ${feedbackMsg.type === 'error' ? '#ef4444' : '#10b981'}`,
            color: '#ffffff',
            boxShadow: 'var(--shadow-glass)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            {feedbackMsg.type === 'error' ? <ShieldAlert size={18} /> : <CheckCircle size={18} />}
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Dashboard Title */}
        <div style={{ marginBottom: '32px' }}>
          <h2>Welcome back, {user.fullName}!</h2>
          <p style={{ marginTop: '4px' }}>Browse the library archives and read your reference books.</p>
        </div>

        {activeTab !== 'history' ? (
          <>
            {/* Search & Filters Panel */}
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '32px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="glass-input"
                  placeholder="Search by book title or author..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '48px' }}
                />
              </div>

              <div style={{ width: 'var(--filter-width, 200px)' }}>
                <select
                  className="glass-input glass-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} {cat.parent_name ? `(${cat.parent_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {activeTab === 'all' && (
                <div style={{ width: 'var(--filter-width, 200px)' }}>
                  <select
                    className="glass-input glass-select"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    <option value="">All Branches</option>
                    {branches.map(br => (
                      <option key={br.id} value={br.id}>{br.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--secondary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p>Retrieving library catalog...</p>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
                <Book size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                <h4>No books found</h4>
                <p style={{ marginTop: '8px' }}>No records match the current search filters.</p>
              </div>
            ) : (
              /* Books Grid */
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '24px'
              }}>
                {filteredBooks.map(book => (
                  <div key={book.id} className="glass-panel glass-card-interactive" style={{
                    padding: 'var(--card-inner-padding, 24px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '260px',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Access Indicator Badge */}
                    <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                      {book.hasAccess ? (
                        <span className="badge badge-success" style={{ gap: '4px' }}>
                          <Unlock size={10} /> Unlocked
                        </span>
                      ) : (
                        <span className="badge badge-danger" style={{ gap: '4px' }}>
                          <Lock size={10} /> Locked
                        </span>
                      )}
                    </div>

                    <div>
                      {/* Priority and Category */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        {book.priority === 'main' ? (
                          <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Main Subject</span>
                        ) : (
                          <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Sub Subject</span>
                        )}
                        <span className="badge badge-secondary" style={{ fontSize: '0.65rem', textTransform: 'none' }}>
                          {book.branch_name}
                        </span>
                      </div>

                      {/* Title & Author */}
                      <h4 style={{ fontSize: '1.1rem', marginBottom: '8px', lineHeight: '1.4', paddingRight: '60px' }}>
                        {book.title}
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        By {book.author}
                      </p>
                    </div>

                    <div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 0 0', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Category: {book.category_name}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                        {book.hasAccess ? (
                          <>
                            <button
                              onClick={() => onSelectBook(book)}
                              className="btn btn-primary"
                              style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                            >
                              <BookOpen size={14} /> Read
                            </button>
                            <button
                              onClick={() => handleDownload(book)}
                              className="btn btn-secondary"
                              style={{ padding: '8px 12px' }}
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {isRequestPending(book.branch_id) ? (
                              <button
                                className="btn btn-secondary"
                                style={{ width: '100%', cursor: 'not-allowed', fontSize: '0.85rem' }}
                                disabled
                              >
                                Request Pending Approval
                              </button>
                            ) : isRequestRejected(book.branch_id) ? (
                              <button
                                onClick={() => handleRequestAccess(book.branch_id, book.branch_name)}
                                className="btn btn-danger"
                                style={{ width: '100%', fontSize: '0.85rem' }}
                                disabled={actionLoading[book.branch_id]}
                              >
                                {actionLoading[book.branch_id] ? 'Submitting...' : 'Rejected - Request Again'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRequestAccess(book.branch_id, book.branch_name)}
                                className="btn btn-secondary"
                                style={{ width: '100%', borderColor: 'var(--primary)', color: 'var(--primary)', fontSize: '0.85rem' }}
                                disabled={actionLoading[book.branch_id]}
                              >
                                {actionLoading[book.branch_id] ? 'Submitting...' : 'Request Branch Access'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Reading History / Activity Tab */
          <div className="glass-panel" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
              <BookMarked size={22} color="var(--secondary)" />
              <h3>Your Reading Progress & Logs</h3>
            </div>

            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                <Clock size={32} style={{ marginBottom: '12px' }} />
                <p>No reading history recorded yet. Open a book to begin tracking!</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '12px 16px' }}>Book Title</th>
                      <th style={{ padding: '12px 16px' }}>Branch</th>
                      <th style={{ padding: '12px 16px' }}>Last Page Read</th>
                      <th style={{ padding: '12px 16px' }}>Access Count</th>
                      <th style={{ padding: '12px 16px' }}>Download Count</th>
                      <th style={{ padding: '12px 16px' }}>Last Accessed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '16px', fontWeight: 600 }}>{record.title}</td>
                        <td style={{ padding: '16px' }}>
                          <span className="badge badge-secondary" style={{ fontSize: '0.65rem', textTransform: 'none' }}>
                            {record.branch_name}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                            Page {record.last_page_read}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>{record.accessed_count} times</td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          {record.is_downloaded ? (
                            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Downloaded ({record.downloaded_count})</span>
                          ) : (
                            <span>{record.downloaded_count} times</span>
                          )}
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-muted)' }}>
                          {new Date(record.last_accessed_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <button 
          onClick={() => { setActiveTab('all'); setSelectedBranch(''); }}
          className={`mobile-nav-item ${activeTab === 'all' ? 'active' : ''}`}
        >
          <Book size={18} />
          <span>Catalog</span>
        </button>
        <button 
          onClick={() => { setActiveTab('home'); setSelectedBranch(''); }}
          className={`mobile-nav-item ${activeTab === 'home' ? 'active' : ''}`}
        >
          <CheckCircle size={18} />
          <span>Home</span>
        </button>
        <button 
          onClick={() => { setActiveTab('other'); setSelectedBranch(''); }}
          className={`mobile-nav-item ${activeTab === 'other' ? 'active' : ''}`}
        >
          <Lock size={18} />
          <span>Extra</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`mobile-nav-item ${activeTab === 'history' ? 'active' : ''}`}
        >
          <Clock size={18} />
          <span>History</span>
        </button>
      </nav>

      {/* Mobile Profile Drawer Overlay */}
      {showProfileDrawer && (
        <div className="mobile-drawer-overlay" onClick={() => setShowProfileDrawer(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={18} color="var(--primary)" />
                <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Student Profile</h4>
              </div>
              <button 
                onClick={() => setShowProfileDrawer(false)}
                className="btn btn-secondary mobile-drawer-close"
                style={{ padding: '4px', borderRadius: '50%', width: '28px', height: '28px', minWidth: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="mobile-drawer-content">
              <div className="student-profile-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={20} color="var(--primary)" />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{user.fullName || 'Student'}</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{user.rollNumber || 'No Roll Number'}</p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Branch</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{user.branchName || 'Not Set'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Year</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{user.year || 'Not Set'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Semester</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{user.semester || 'Not Set'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>BT ID</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{user.btNumber || 'Not Set'}</strong>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => {
                  setShowProfileDrawer(false);
                  logout();
                }}
                className="btn btn-secondary logout-btn-mobile"
                style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', marginTop: '20px', display: 'flex', justifyContent: 'center' }}
              >
                <LogOut size={16} /> Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
