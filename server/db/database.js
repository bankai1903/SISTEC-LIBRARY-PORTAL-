const { Pool } = require('pg');
const path = require('path');

// Load environment variables from .env in the server directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
const isPlaceholder = !connectionString || connectionString.includes('[YOUR-PASSWORD]') || connectionString.includes('[YOUR-PROJECT-REF]');

if (isPlaceholder) {
  console.error('\n======================================================================');
  console.error('⚠️  DATABASE_URL is missing or contains placeholders in server/.env!');
  console.error('Please configure your real Supabase connection string to start the app.');
  console.error('======================================================================\n');
}

const pool = new Pool({
  connectionString: isPlaceholder ? undefined : connectionString,
  ssl: connectionString && (connectionString.includes('supabase') || connectionString.includes('neon') || connectionString.includes('render'))
    ? { rejectUnauthorized: false }
    : false
});

// Helper function to translate SQLite "?" placeholders to PostgreSQL "$1, $2, ..."
function convertSql(sql) {
  if (!sql) return sql;

  // Skip SQLite-specific PRAGMA commands
  if (sql.trim().toUpperCase().startsWith('PRAGMA')) {
    return '';
  }

  let paramIndex = 1;
  let translatedSql = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'" && (i === 0 || sql[i - 1] !== '\\')) {
      inSingleQuote = !inSingleQuote;
      translatedSql += char;
    } else if (char === '"' && (i === 0 || sql[i - 1] !== '\\')) {
      inDoubleQuote = !inDoubleQuote;
      translatedSql += char;
    } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      translatedSql += '$' + paramIndex;
      paramIndex++;
    } else {
      translatedSql += char;
    }
  }

  // Convert SQLite AUTOINCREMENT to Postgres SERIAL
  let formattedSql = translatedSql
    .replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bDATETIME DEFAULT CURRENT_TIMESTAMP\b/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

  return formattedSql;
}

// Helper functions to mimic SQLite promise-based interface with pg Pool
const dbQuery = {
  async run(sql, params = []) {
    if (isPlaceholder) return { id: null, changes: 0 };
    const querySql = convertSql(sql);
    if (!querySql) return { id: null, changes: 0 };

    const client = await pool.connect();
    try {
      let finalSql = querySql;
      const isInsert = querySql.trim().toUpperCase().startsWith('INSERT');
      if (isInsert && !querySql.toUpperCase().includes('RETURNING')) {
        finalSql += ' RETURNING id';
      }
      const res = await client.query(finalSql, params);
      const lastID = (isInsert && res.rows[0]) ? res.rows[0].id : null;
      return { id: lastID, changes: res.rowCount };
    } finally {
      client.release();
    }
  },

  async get(sql, params = []) {
    if (isPlaceholder) return null;
    const querySql = convertSql(sql);
    if (!querySql) return null;

    const client = await pool.connect();
    try {
      const res = await client.query(querySql, params);
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  },

  async all(sql, params = []) {
    if (isPlaceholder) return [];
    const querySql = convertSql(sql);
    if (!querySql) return [];

    const client = await pool.connect();
    try {
      const res = await client.query(querySql, params);
      return res.rows;
    } finally {
      client.release();
    }
  },

  async exec(sql) {
    if (isPlaceholder) return;
    const querySql = convertSql(sql);
    if (!querySql) return;

    const client = await pool.connect();
    try {
      await client.query(querySql);
    } finally {
      client.release();
    }
  }
};

// Initialize database schema
async function initDatabase() {
  try {
    // 1. Branches table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      )
    `);

    // 2. Categories table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
      )
    `);

    // 3. Books table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS books (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
        priority TEXT NOT NULL CHECK(priority IN ('main', 'sub')),
        pdf_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Users table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
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
        is_blocked INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Dynamically upgrade existing users table if column doesn't exist
    try {
      await dbQuery.run('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked INTEGER DEFAULT 0');
    } catch (err) {
      console.error('Error altering users table:', err);
    }

    // 5. Branch access permissions
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, branch_id)
      )
    `);

    // 6. User book progress
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS user_book_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
        last_page_read INTEGER DEFAULT 1,
        accessed_count INTEGER DEFAULT 0,
        downloaded_count INTEGER DEFAULT 0,
        is_downloaded INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, book_id)
      )
    `);

    // 7. Activity logs
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL CHECK(action_type IN ('login', 'logout', 'view', 'download', 'delete_log', 'admin_action')),
        book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. Database Indexes
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_books_branch ON books(branch_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_permissions_branch ON permissions(branch_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_progress_user ON user_book_progress(user_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_progress_book ON user_book_progress(book_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_logs_book ON activity_logs(book_id)');
    await dbQuery.run('CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC)');

    console.log('PostgreSQL database tables and performance indexes initialized successfully.');
  } catch (error) {
    console.error('Error initializing database tables:', error);
  }
}

module.exports = {
  pool,
  dbQuery,
  initDatabase
};
