const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');  // C-4: needed to delete orphaned PDF files
const { dbQuery } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Multer storage setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ''));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed!'), false);
    }
    cb(null, true);
  },
  // C-2 FIX: Limit individual file size to 200 MB to prevent disk-fill attacks
  limits: { fileSize: 200 * 1024 * 1024 }
});

// Multer for bulk upload (up to 50 PDFs at once)
const bulkUpload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed!'), false);
    }
    cb(null, true);
  },
  // C-2 FIX: 200 MB per file, max 50 files
  limits: { fileSize: 200 * 1024 * 1024, files: 50 }
});

// Get all branches (useful for filters/selectors)
router.get('/branches', authenticateToken, async (req, res) => {
  try {
    const branches = await dbQuery.all('SELECT * FROM branches ORDER BY name ASC');
    return res.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all categories (useful for filters/selectors)
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await dbQuery.all(`
      SELECT c.*, p.name AS parent_name
      FROM categories c
      LEFT JOIN categories p ON c.parent_category_id = p.id
      ORDER BY c.name ASC
    `);
    return res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all books with permission checks (Student or Admin)
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const userBranch = req.user.branch_name;

  try {
    // Fetch all books sorted by category name, then priority (main first, then sub), then title
    const books = await dbQuery.all(`
      SELECT b.id, b.title, b.author, b.category_id, b.branch_id, b.priority, b.pdf_url, b.created_at,
             br.name AS branch_name, c.name AS category_name, c.parent_category_id
      FROM books b
      JOIN branches br ON b.branch_id = br.id
      JOIN categories c ON b.category_id = c.id
      ORDER BY c.name ASC, 
               CASE WHEN b.priority = 'main' THEN 1 ELSE 2 END ASC, 
               b.title ASC
    `);

    if (userRole === 'admin') {
      // Admins have access to all books
      return res.json(books.map(book => ({ ...book, hasAccess: true })));
    }

    // Students: Fetch approved permissions for additional branches
    const approvedPermissions = await dbQuery.all(
      'SELECT branch_id FROM permissions WHERE user_id = ? AND status = "approved"',
      [userId]
    );
    const permittedBranchIds = new Set(approvedPermissions.map(p => p.branch_id));

    // Map books with access indicators
    const mappedBooks = books.map(book => {
      // H-1 FIX: Normalize both strings (trim + lowercase) before comparing.
      // Previously strict '===' could silently deny access if branch names
      // differed by casing or whitespace between user record and book record.
      const normalizedBookBranch = (book.branch_name || '').trim().toLowerCase();
      const normalizedUserBranch = (userBranch || '').trim().toLowerCase();
      const isHomeBranch = normalizedBookBranch === normalizedUserBranch;
      const isPermitted = permittedBranchIds.has(book.branch_id);
      return {
        ...book,
        hasAccess: isHomeBranch || isPermitted
      };
    });

    return res.json(mappedBooks);
  } catch (error) {
    console.error('Error fetching books:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get details of a single book by ID
router.get('/:id', authenticateToken, async (req, res) => {
  const bookId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;
  const userBranch = req.user.branch_name;

  try {
    const book = await dbQuery.get(`
      SELECT b.id, b.title, b.author, b.category_id, b.branch_id, b.priority, b.pdf_url, b.created_at,
             br.name AS branch_name, c.name AS category_name, c.parent_category_id
      FROM books b
      JOIN branches br ON b.branch_id = br.id
      JOIN categories c ON b.category_id = c.id
      WHERE b.id = ?
    `, [bookId]);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    if (userRole === 'admin') {
      return res.json({ ...book, hasAccess: true });
    }

    // Students: check access permissions
    const normalizedBookBranch = (book.branch_name || '').trim().toLowerCase();
    const normalizedUserBranch = (userBranch || '').trim().toLowerCase();
    const isHomeBranch = normalizedBookBranch === normalizedUserBranch;

    if (isHomeBranch) {
      return res.json({ ...book, hasAccess: true });
    }

    // Check approved cross-branch permissions
    const approvedPermission = await dbQuery.get(
      'SELECT id FROM permissions WHERE user_id = ? AND branch_id = ? AND status = "approved"',
      [userId, book.branch_id]
    );

    return res.json({
      ...book,
      hasAccess: !!approvedPermission
    });
  } catch (error) {
    console.error('Error fetching book details:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin Route: Add a book with PDF upload
router.post('/', authenticateToken, requireAdmin, upload.single('pdf'), async (req, res) => {
  const { title, author, category_id, branch_id, priority } = req.body;

  if (!title || !author || !category_id || !branch_id || !priority) {
    return res.status(400).json({ error: 'Required fields: title, author, category_id, branch_id, priority' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Please upload the Book PDF file' });
  }

  try {
    const pdf_url = `/uploads/${req.file.filename}`;
    const result = await dbQuery.run(`
      INSERT INTO books (title, author, category_id, branch_id, priority, pdf_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [title, author, parseInt(category_id, 10), parseInt(branch_id, 10), priority, pdf_url]);

    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, book_id, details)
      VALUES (?, 'admin_action', ?, ?)
    `, [req.user.id, result.id, `Added new book: "${title}" by ${author}`]);

    return res.status(201).json({ message: 'Book added successfully', bookId: result.id });
  } catch (error) {
    console.error('Error adding book:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin Route: Edit a book (optional PDF upload)
router.put('/:id', authenticateToken, requireAdmin, upload.single('pdf'), async (req, res) => {
  const bookId = req.params.id;
  const { title, author, category_id, branch_id, priority } = req.body;

  if (!title || !author || !category_id || !branch_id || !priority) {
    return res.status(400).json({ error: 'Required fields: title, author, category_id, branch_id, priority' });
  }

  try {
    const existingBook = await dbQuery.get('SELECT title, pdf_url FROM books WHERE id = ?', [bookId]);
    if (!existingBook) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Determine PDF path (new upload or fallback to existing)
    let pdf_url = existingBook.pdf_url;
    if (req.file) {
      const newPdfUrl = `/uploads/${req.file.filename}`;

      // C-4 FIX: Delete the old file from disk when replaced with a new upload
      if (existingBook.pdf_url && existingBook.pdf_url.startsWith('/uploads/')) {
        const oldFilePath = path.join(__dirname, '..', existingBook.pdf_url);
        fs.unlink(oldFilePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            console.warn('Could not delete old PDF file:', oldFilePath, err.message);
          }
        });
      }
      pdf_url = newPdfUrl;
    }

    await dbQuery.run(`
      UPDATE books
      SET title = ?, author = ?, category_id = ?, branch_id = ?, priority = ?, pdf_url = ?
      WHERE id = ?
    `, [title, author, parseInt(category_id, 10), parseInt(branch_id, 10), priority, pdf_url, bookId]);

    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, book_id, details)
      VALUES (?, 'admin_action', ?, ?)
    `, [req.user.id, bookId, `Updated book "${existingBook.title}" -> "${title}"` ]);

    return res.json({ message: 'Book updated successfully' });
  } catch (error) {
    console.error('Error updating book:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin Route: Delete a book
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const bookId = req.params.id;

  try {
    const book = await dbQuery.get('SELECT title, pdf_url FROM books WHERE id = ?', [bookId]);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Delete the book record (cascades to user_book_progress via FK)
    await dbQuery.run('DELETE FROM books WHERE id = ?', [bookId]);

    // C-4 FIX: Delete the physical PDF file from uploads/ to prevent disk accumulation
    if (book.pdf_url && book.pdf_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', book.pdf_url);
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.warn('Could not delete PDF file on book deletion:', filePath, err.message);
        }
      });
    }

    // Log the deleted book event
    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, details)
      VALUES (?, 'admin_action', ?)
    `, [req.user.id, `Deleted book ID ${bookId}: "${book.title}"`]);

    return res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin Route: Bulk Upload Books (multiple PDFs, shared metadata)
router.post('/bulk', authenticateToken, requireAdmin, bulkUpload.array('pdfs', 50), async (req, res) => {
  const { category_id, branch_id, priority, author } = req.body;

  if (!category_id || !branch_id || !priority) {
    return res.status(400).json({ error: 'Required fields: category_id, branch_id, priority' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Please upload at least one PDF file' });
  }

  const results = [];

  try {
    await dbQuery.run('BEGIN TRANSACTION');

    for (const file of req.files) {
      // Derive title from filename: strip extension and clean up
      const rawName = path.basename(file.originalname, '.pdf');
      const title = rawName
        .replace(/[_\-]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const bookAuthor = (author && author.trim()) ? author.trim() : 'Unknown';
      const pdf_url = `/uploads/${file.filename}`;

      try {
        // Skip if already exists (same title + branch)
        const existing = await dbQuery.get(
          'SELECT id FROM books WHERE title = ? AND branch_id = ?',
          [title, parseInt(branch_id, 10)]
        );

        if (existing) {
          results.push({ file: file.originalname, title, status: 'skipped', reason: 'Already exists' });
          continue;
        }

        const result = await dbQuery.run(
          `INSERT INTO books (title, author, category_id, branch_id, priority, pdf_url)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [title, bookAuthor, parseInt(category_id, 10), parseInt(branch_id, 10), priority, pdf_url]
        );

        await dbQuery.run(
          `INSERT INTO activity_logs (user_id, action_type, book_id, details) VALUES (?, 'admin_action', ?, ?)`,
          [req.user.id, result.id, `Bulk added book: "${title}" by ${bookAuthor}`]
        );

        results.push({ file: file.originalname, title, status: 'success', bookId: result.id });
      } catch (err) {
        results.push({ file: file.originalname, title, status: 'error', reason: err.message });
      }
    }

    await dbQuery.run('COMMIT');
  } catch (transactionErr) {
    console.error('Fatal bulk upload transaction error, rolling back:', transactionErr);
    try {
      await dbQuery.run('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr);
    }
    return res.status(500).json({ error: 'Database transaction failed during bulk import' });
  }

  const imported = results.filter(r => r.status === 'success').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  return res.status(201).json({
    message: `Bulk import complete: ${imported} added, ${skipped} skipped, ${errors} errors`,
    imported,
    skipped,
    errors,
    results
  });
});

module.exports = router;
