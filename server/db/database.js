const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'library.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    // NOTE: PRAGMA foreign_keys is now set inside initDatabase() with proper await
    // to guarantee it runs before any queries (see C-5 fix)
  }
});

// Helper functions to use promises with sqlite3
const dbQuery = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  exec(sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// Initialize database schema
async function initDatabase() {
  try {
    // C-5 FIX: Enable foreign keys FIRST, awaited, before any table creation or queries.
    // Previously this was a fire-and-forget db.run() in the connection callback which
    // had no guarantee of completing before subsequent queries ran.
    await dbQuery.run('PRAGMA foreign_keys = ON');

    // 1. Branches table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )
    `);

    // 2. Categories table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
      )
    `);

    // 3. Books table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
        priority TEXT NOT NULL CHECK(priority IN ('main', 'sub')),
        pdf_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Users table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        roll_number TEXT,
        branch_name TEXT,
        year TEXT,
        semester TEXT,
        bt_number TEXT,
        role TEXT NOT NULL CHECK(role IN ('admin', 'student')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Branch access permissions
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, branch_id)
      )
    `);

    // 6. User book progress (accumulated tracking of views, downloads, deletion, and last page read)
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS user_book_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
        last_page_read INTEGER DEFAULT 1,
        accessed_count INTEGER DEFAULT 0,
        downloaded_count INTEGER DEFAULT 0,
        is_downloaded INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, book_id)
      )
    `);

    // 7. Activity logs (individual events)
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL CHECK(action_type IN ('login', 'logout', 'view', 'download', 'delete_log', 'admin_action')),
        book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. Database Indexes for JOIN and query filtering optimization
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_books_branch ON books(branch_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_permissions_branch ON permissions(branch_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_progress_user ON user_book_progress(user_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_progress_book ON user_book_progress(book_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_logs_book ON activity_logs(book_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC)');

    console.log('Database tables and performance indexes initialized successfully.');
  } catch (error) {
    console.error('Error initializing database tables:', error);
  }
}

module.exports = {
  db,
  dbQuery,
  initDatabase
};
