const express = require('express');
const router = express.Router();
const { dbQuery } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Track user action on a book (student reading progress, downloading, etc.)
router.post('/track', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { book_id, action_type, last_page_read } = req.body;

  if (!book_id || !action_type) {
    return res.status(400).json({ error: 'Fields book_id and action_type are required' });
  }

  if (!['view', 'download', 'delete_log'].includes(action_type)) {
    return res.status(400).json({ error: 'Invalid action type' });
  }

  try {
    // Verify book exists
    const book = await dbQuery.get('SELECT title FROM books WHERE id = ?', [book_id]);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Verify student has permission for this book
    const bookAccess = await dbQuery.get(`
      SELECT b.id, br.name AS branch_name
      FROM books b
      JOIN branches br ON b.branch_id = br.id
      WHERE b.id = ?
    `, [book_id]);

    // H-1 FIX: Normalize branch names before comparison to prevent silent access denial
    // due to casing or whitespace differences between user and book records.
    const normalizedBookBranch = (bookAccess.branch_name || '').trim().toLowerCase();
    const normalizedUserBranch = (req.user.branch_name || '').trim().toLowerCase();
    const isHomeBranch = normalizedBookBranch === normalizedUserBranch;
    let hasPerm = isHomeBranch;

    if (!isHomeBranch) {
      const perm = await dbQuery.get(
        'SELECT id FROM permissions WHERE user_id = ? AND branch_id = (SELECT branch_id FROM books WHERE id = ?) AND status = "approved"',
        [userId, book_id]
      );
      if (perm) hasPerm = true;
    }

    if (!hasPerm && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: You do not have permission for this branch' });
    }

    // Log the event in audit trail
    let details = '';
    if (action_type === 'view') {
      details = `Read page ${last_page_read || 1}`;
    } else if (action_type === 'download') {
      details = `Downloaded book files`;
    } else if (action_type === 'delete_log') {
      details = `Removed book from downloaded library`;
    }

    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, book_id, details)
      VALUES (?, ?, ?, ?)
    `, [userId, action_type, book_id, details]);

    // Atomic Upsert using SQLite ON CONFLICT clause to prevent race conditions
    let upsertSql = '';
    let params = [];

    if (action_type === 'view') {
      const page = last_page_read ? parseInt(last_page_read, 10) : 1;
      upsertSql = `
        INSERT INTO user_book_progress (user_id, book_id, accessed_count, last_page_read, is_downloaded, is_deleted)
        VALUES (?, ?, 1, ?, 0, 0)
        ON CONFLICT(user_id, book_id) DO UPDATE SET
          accessed_count = accessed_count + 1,
          last_page_read = excluded.last_page_read,
          last_accessed_at = CURRENT_TIMESTAMP
      `;
      params = [userId, book_id, page];
    } else if (action_type === 'download') {
      upsertSql = `
        INSERT INTO user_book_progress (user_id, book_id, accessed_count, downloaded_count, is_downloaded, is_deleted)
        VALUES (?, ?, 0, 1, 1, 0)
        ON CONFLICT(user_id, book_id) DO UPDATE SET
          downloaded_count = downloaded_count + 1,
          is_downloaded = 1,
          is_deleted = 0,
          last_accessed_at = CURRENT_TIMESTAMP
      `;
      params = [userId, book_id];
    } else if (action_type === 'delete_log') {
      upsertSql = `
        INSERT INTO user_book_progress (user_id, book_id, accessed_count, downloaded_count, is_downloaded, is_deleted)
        VALUES (?, ?, 0, 0, 0, 1)
        ON CONFLICT(user_id, book_id) DO UPDATE SET
          is_downloaded = 0,
          is_deleted = 1,
          last_accessed_at = CURRENT_TIMESTAMP
      `;
      params = [userId, book_id];
    }

    await dbQuery.run(upsertSql, params);

    return res.json({ message: 'Activity tracked successfully' });
  } catch (error) {
    console.error('Error tracking activity:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get logged-in student's reading & download history
router.get('/my-history', authenticateToken, async (req, res) => {
  try {
    const history = await dbQuery.all(`
      SELECT ubp.last_page_read, ubp.accessed_count, ubp.downloaded_count, ubp.is_downloaded, ubp.is_deleted, ubp.last_accessed_at,
             b.title, b.author, b.priority, c.name AS category_name, br.name AS branch_name
      FROM user_book_progress ubp
      JOIN books b ON ubp.book_id = b.id
      JOIN categories c ON b.category_id = c.id
      JOIN branches br ON b.branch_id = br.id
      WHERE ubp.user_id = ? AND ubp.is_deleted = 0
      ORDER BY ubp.last_accessed_at DESC
    `, [req.user.id]);

    return res.json(history);
  } catch (error) {
    console.error('Error fetching user history:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin Route: Get comprehensive analytics dashboard data
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 1. General counts
    const totalLogins = await dbQuery.get("SELECT COUNT(*) as count FROM activity_logs WHERE action_type = 'login'");
    const totalLogouts = await dbQuery.get("SELECT COUNT(*) as count FROM activity_logs WHERE action_type = 'logout'");
    const totalDownloads = await dbQuery.get('SELECT SUM(downloaded_count) as count FROM user_book_progress');
    const totalViews = await dbQuery.get('SELECT SUM(accessed_count) as count FROM user_book_progress');
    const totalBooks = await dbQuery.get('SELECT COUNT(*) as count FROM books');
    const totalStudents = await dbQuery.get("SELECT COUNT(*) as count FROM users WHERE role = 'student'");

    // 2. Most read book in each branch (highest total accessed_count)
    const mostReadPerBranch = await dbQuery.all(`
      WITH RankedBooks AS (
        SELECT b.id AS book_id, b.title, b.author, b.branch_id, br.name AS branch_name,
               SUM(ubp.accessed_count) AS total_accesses,
               ROW_NUMBER() OVER(PARTITION BY b.branch_id ORDER BY SUM(ubp.accessed_count) DESC, b.title ASC) as rn
        FROM books b
        JOIN branches br ON b.branch_id = br.id
        JOIN user_book_progress ubp ON b.id = ubp.book_id
        GROUP BY b.id, b.title, b.author, b.branch_id, br.name
      )
      SELECT book_id, title, author, branch_id, branch_name, total_accesses
      FROM RankedBooks
      WHERE rn = 1 AND total_accesses > 0
    `);

    // 3. Best-performing book across all branches (highest aggregate accessed_count)
    const bestBook = await dbQuery.get(`
      SELECT b.id AS book_id, b.title, b.author, br.name AS branch_name,
             COALESCE(SUM(ubp.accessed_count), 0) AS total_accesses,
             COALESCE(SUM(ubp.downloaded_count), 0) AS total_downloads
      FROM books b
      JOIN branches br ON b.branch_id = br.id
      LEFT JOIN user_book_progress ubp ON b.id = ubp.book_id
      GROUP BY b.id, b.title, b.author, br.name
      ORDER BY total_accesses DESC, total_downloads DESC
      LIMIT 1
    `);

    // 4. User who accessed the most books in their lifetime (highest total accessed_count)
    const topUser = await dbQuery.get(`
      SELECT u.id AS user_id, u.full_name, u.roll_number, u.branch_name,
             COALESCE(SUM(ubp.accessed_count), 0) AS total_accesses,
             COUNT(DISTINCT ubp.book_id) AS unique_books_accessed
      FROM users u
      JOIN user_book_progress ubp ON u.id = ubp.user_id
      WHERE u.role = 'student'
      GROUP BY u.id, u.full_name, u.roll_number, u.branch_name
      ORDER BY total_accesses DESC
      LIMIT 1
    `);

    // 5. Activity Logs List
    const activityLogs = await dbQuery.all(`
      SELECT l.id, l.action_type, l.details, l.created_at,
             u.full_name, u.role, u.roll_number,
             b.title AS book_title
      FROM activity_logs l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN books b ON l.book_id = b.id
      ORDER BY l.created_at DESC
      LIMIT 50
    `);

    // 6. Branch wise aggregated accesses and downloads for chart rendering
    const branchPerformance = await dbQuery.all(`
      SELECT br.name AS branch_name,
             COALESCE(SUM(ubp.accessed_count), 0) AS total_accesses,
             COALESCE(SUM(ubp.downloaded_count), 0) AS total_downloads
      FROM branches br
      LEFT JOIN books b ON br.id = b.branch_id
      LEFT JOIN user_book_progress ubp ON b.id = ubp.book_id
      GROUP BY br.id, br.name
      ORDER BY br.name ASC
    `);

    return res.json({
      stats: {
        logins: totalLogins.count,
        logouts: totalLogouts.count,
        downloads: totalDownloads.count || 0,
        views: totalViews.count || 0,
        books: totalBooks.count,
        students: totalStudents.count
      },
      mostReadPerBranch,
      bestBook: bestBook && bestBook.total_accesses > 0 ? bestBook : null,
      topUser: topUser && topUser.total_accesses > 0 ? topUser : null,
      activityLogs,
      branchPerformance
    });
  } catch (error) {
    console.error('Error fetching analytics dashboard:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// M-3 FIX: Paginated activity logs for admin audit trail
router.get('/logs', authenticateToken, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = (page - 1) * limit;

  try {
    const totalCount = await dbQuery.get('SELECT COUNT(*) as count FROM activity_logs');
    const logs = await dbQuery.all(`
      SELECT l.id, l.action_type, l.details, l.created_at,
             u.full_name, u.role, u.roll_number,
             b.title AS book_title
      FROM activity_logs l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN books b ON l.book_id = b.id
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    return res.json({
      logs,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
