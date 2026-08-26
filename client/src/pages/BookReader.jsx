import { useState, useEffect } from 'react';
import { useAuth, BASE_URL } from '../context/AuthContext';
import { ArrowLeft, ChevronLeft, ChevronRight, Bookmark, Download } from 'lucide-react';

const BookReader = ({ book, onClose }) => {
  const { apiCall } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  // H-3 FIX: totalPages is only meaningful for the mock reader.
  // For real uploaded PDFs rendered in an iframe, we use a large ceiling value
  // since we cannot determine actual PDF page count without PDF.js.
  const isUploaded = book.pdf_url && (book.pdf_url.startsWith('/uploads/') || book.pdf_url.startsWith('http'));
  const [totalPages] = useState(isUploaded ? 9999 : 60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (book) {
      document.title = `Reading: ${book.title} - SISTEC Library`;
    }
  }, [book]);

  // H-7 FIX: Run fetchProgress FIRST (await), then record the initial view
  // with the ACTUAL restored page number — not the default page=1.
  // Previously both fired simultaneously causing recordInitialView to always
  // overwrite real progress with page=1.
  useEffect(() => {
    const initReader = async () => {
      let restoredPage = 1;

      // Step 1: Restore saved reading position
      try {
        const history = await apiCall('/analytics/my-history');
        const record = history.find(h => h.title === book.title);
        if (record && record.last_page_read) {
          restoredPage = record.last_page_read;
          setCurrentPage(restoredPage);
        }
      } catch (err) {
        console.error('Error fetching book progress:', err);
      }

      // Step 2: Record the view AFTER restoration so we track the correct page
      try {
        await apiCall('/analytics/track', {
          method: 'POST',
          body: JSON.stringify({
            book_id: book.id,
            action_type: 'view',
            last_page_read: restoredPage
          })
        });
      } catch (err) {
        console.error('Error tracking initial view:', err);
      }
    };

    initReader();
  }, [book.id, book.title, apiCall]);

  // Update backend about progress
  const saveProgress = async (page) => {
    try {
      setSaving(true);
      await apiCall('/analytics/track', {
        method: 'POST',
        body: JSON.stringify({
          book_id: book.id,
          action_type: 'view',
          last_page_read: page
        })
      });
    } catch (err) {
      console.error('Error auto-saving page progress:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      saveProgress(newPage);
    }
  };

  // Mock content generation based on page number to feel like a real document reader
  const getPageContent = (page) => {
    const chapters = [
      { title: 'Chapter 1: Foundational Concepts', text: 'This section details the primary elements of the subject. In early stages, researchers discovered that simple systems combined with robust structures yield high performance. Understanding these elements is critical for advanced application design. We will look at structural principles and review initial research papers in this discipline.' },
      { title: 'Chapter 2: Core Methodology', text: 'Methodological approaches define how we execute research. In this page, we establish the standard algorithm structure, analyze resource allocation tables, and diagram workflows. We cover validation techniques and detail sample parameters used to execute test suites under simulated stress.' },
      { title: 'Chapter 3: Deep System Architecture', text: 'Architectural blueprints serve as the backbone of our execution systems. Here, we outline multi-tier pipelines, highlight fail-safe protocols, and explore load distribution logic. Reviewing these layouts helps developers design solutions that scale across both local servers and distributed cloud platforms.' },
      { title: 'Chapter 4: Implementation & Verification', text: 'Transitioning from theoretical designs to concrete code requires robust testing. We implement components, run unit checkers, and analyze the resulting dataset. Automated benchmarks confirm that prioritizing core structures improves responsiveness and decreases memory footprint.' }
    ];

    const chapterIndex = Math.floor((page - 1) / 15) % chapters.length;
    const currentChapter = chapters[chapterIndex];

    return (
      <div style={{ padding: '20px 0' }}>
        <h4 style={{ color: 'var(--secondary)', marginBottom: '16px', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {currentChapter.title}
        </h4>
        <p style={{ fontSize: '1.05rem', lineHeight: '1.8', color: 'var(--text-primary)', textAlign: 'justify', marginBottom: '20px' }}>
          [Page {page}] {currentChapter.text}
        </p>
        <p style={{ fontSize: '1.05rem', lineHeight: '1.8', color: 'var(--text-secondary)', textAlign: 'justify' }}>
          Continuing our analysis of these schemas, we observe that the relative efficiency is dependent on standard deviations of node clusters. Developers should always account for network latency and data synchronization constraints before committing to a final framework. Let us examine the data tables on the subsequent pages to compare standard deviations across our test cases.
        </p>
      </div>
    );
  };

  const fileUrl = isUploaded 
    ? (book.pdf_url.startsWith('http') ? book.pdf_url : `${BASE_URL}${book.pdf_url}`)
    : null;

  if (isUploaded) {
    return (
      <div className="animate-fade-in" style={{
        maxWidth: '1000px',
        margin: '0 auto',
        height: '90vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Top Controls Header */}
        <div className="glass-panel reader-header" style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={16} /> Close Document
          </button>

          <div style={{ textAlign: 'center' }}>
            <h4 style={{ fontSize: '1.1rem', marginBottom: '2px' }}>{book.title}</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>By {book.author}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bookmark Page:</span>
            <input
              type="number"
              min="1"
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (val > 0) {
                  setCurrentPage(val);
                  saveProgress(val);
                }
              }}
              className="glass-input"
              style={{ width: '70px', padding: '6px 10px', textAlign: 'center' }}
            />
          </div>
        </div>

        {/* PDF Iframe Viewer */}
        <div className="glass-panel" style={{
          flex: 1,
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-glass)',
          background: '#0b0f19',
          padding: '4px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* M-5 FIX: Mobile/Tablet PDF Fallback Banner */}
          <div style={{
            padding: '12px 16px',
            background: 'rgba(245, 158, 11, 0.15)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '12px 12px 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.82rem',
            color: 'var(--warning, #f59e0b)'
          }}>
            <span style={{ fontWeight: 500 }}>📱 If the PDF is not displaying on your mobile device, you can open it directly in a new tab.</span>
            <a 
              href={fileUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '6px', textDecoration: 'none' }}
            >
              <Download size={13} /> Open PDF
            </a>
          </div>
          <iframe
            src={fileUrl}
            width="100%"
            height="100%"
            style={{ border: 'none', borderRadius: '0 0 12px 12px', flex: 1 }}
            title={book.title}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{
      maxWidth: '800px',
      margin: '0 auto',
      minHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between'
    }}>
      {/* Top Controls Header */}
      <div className="glass-panel reader-header" style={{
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <button
          onClick={onClose}
          className="btn btn-secondary"
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={16} /> Close Document
        </button>

        <div style={{ textAlign: 'center' }}>
          <h4 style={{ fontSize: '1rem', marginBottom: '2px' }}>{book.title}</h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>By {book.author}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bookmark size={16} color="var(--primary)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Page {currentPage}</span>
        </div>
      </div>

      {/* Reader Page body */}
      <div className="glass-panel reader-body" style={{
        padding: '48px',
        flex: 1,
        marginBottom: '24px',
        boxShadow: 'var(--shadow-glass)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'rgba(10, 15, 26, 0.7)'
      }}>
        {/* Book priority badge */}
        <span className="badge badge-primary" style={{ position: 'absolute', top: '24px', left: '48px', fontSize: '0.65rem' }}>
          {book.priority} subject book
        </span>

        {/* Text Area */}
        <div style={{ minHeight: '300px' }}>
          {getPageContent(currentPage)}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="glass-panel reader-footer" style={{
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1 || saving}
          className="btn btn-secondary"
          style={{ padding: '8px 16px', opacity: currentPage === 1 ? 0.4 : 1 }}
        >
          <ChevronLeft size={18} /> Prev Page
        </button>

        <div style={{ flex: 1, margin: '0 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            height: '6px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '3px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              width: `${(currentPage / totalPages) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--primary), var(--secondary))',
              borderRadius: '3px',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>Progress: {Math.round((currentPage / totalPages) * 100)}%</span>
            <span>Page {currentPage} of {totalPages}</span>
          </div>
        </div>

        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages || saving}
          className="btn btn-secondary"
          style={{ padding: '8px 16px', opacity: currentPage === totalPages ? 0.4 : 1 }}
        >
          Next Page <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default BookReader;
