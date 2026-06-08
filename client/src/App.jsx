import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ThemeToggle from './components/ThemeToggle';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import BookReader from './pages/BookReader';
import AdminDashboard from './pages/AdminDashboard';

const AppContent = () => {
  const { user, loading } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-main)',
        color: 'var(--text-primary)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(255, 255, 255, 0.1)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }} />
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem' }}>Authenticating user session...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Not Logged In
  if (!user) {
    return isRegistering ? (
      <Register onToggleView={() => setIsRegistering(false)} />
    ) : (
      <Login onToggleView={() => setIsRegistering(true)} />
    );
  }

  // Admin View
  if (user.role === 'admin') {
    return <AdminDashboard />;
  }

  // Student View (Reader or Dashboard)
  if (selectedBook) {
    return (
      <div style={{ padding: '40px 20px', minHeight: '100vh', background: 'var(--bg-main)' }}>
        <BookReader
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
        />
      </div>
    );
  }

  return (
    <Dashboard
      onSelectBook={(book) => setSelectedBook(book)}
    />
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        {/* Floating Theme Studio – always visible on every page */}
        <ThemeToggle />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
