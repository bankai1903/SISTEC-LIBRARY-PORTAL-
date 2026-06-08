/**
 * Live Deployment Book Synchronizer
 * 
 * This script:
 * 1. Logins to your live server using the admin account to obtain a JWT token.
 * 2. Fetches remote branches, categories, and existing books.
 * 3. Compares them with your local database books.
 * 4. Programmatically uploads the missing PDFs and registers the book metadata.
 * 
 * Usage: node server/scripts/sync_to_live.js <live_server_url> [admin_username] [admin_password]
 * Example: node server/scripts/sync_to_live.js https://my-library-sistec.onrender.com
 */

const fs = require('fs');
const path = require('path');
const { dbQuery } = require('../db/database');

const LIVE_URL = process.argv[2];
const ADMIN_USER = process.argv[3] || 'admin';
const ADMIN_PASS = process.argv[4] || 'admin123';

if (!LIVE_URL) {
  console.error('\x1b[31mError: Please provide the live server URL as an argument.\x1b[0m');
  console.log('Usage: node server/scripts/sync_to_live.js <live_server_url> [admin_username] [admin_password]');
  console.log('Example: node server/scripts/sync_to_live.js https://sistec-library-portal.onrender.com');
  process.exit(1);
}

// Normalize URL (strip trailing slash)
const baseUrl = LIVE_URL.replace(/\/$/, '');

async function runSync() {
  console.log('='.repeat(60));
  console.log(' 🚀 SISTEC Library Sync to Live Deployment');
  console.log('='.repeat(60));
  console.log(`Live Server Url : ${baseUrl}`);
  console.log(`Admin Username  : ${ADMIN_USER}`);
  console.log('');

  try {
    // 1. Authenticate with the live server
    console.log(`🔑 Logging into live server...`);
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`Login failed (${loginRes.status}): ${errText}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✔ Logged in successfully. Token obtained.');

    const headers = {
      'Authorization': `Bearer ${token}`
    };

    // 2. Fetch live branches
    console.log('⚡ Fetching branches from live server...');
    const branchesRes = await fetch(`${baseUrl}/api/books/branches`, { headers });
    if (!branchesRes.ok) throw new Error('Failed to fetch remote branches');
    const remoteBranches = await branchesRes.json();
    const branchMap = {};
    remoteBranches.forEach(b => {
      branchMap[b.name.toLowerCase().trim()] = b.id;
    });
    console.log(`✔ Found ${remoteBranches.length} remote branches.`);

    // 3. Fetch live categories
    console.log('⚡ Fetching categories from live server...');
    const categoriesRes = await fetch(`${baseUrl}/api/books/categories`, { headers });
    if (!categoriesRes.ok) throw new Error('Failed to fetch remote categories');
    const remoteCategories = await categoriesRes.json();
    const categoryMap = {};
    remoteCategories.forEach(c => {
      categoryMap[c.name.toLowerCase().trim()] = c.id;
    });
    console.log(`✔ Found ${remoteCategories.length} remote categories.`);

    // 4. Fetch live books to check duplicates
    console.log('⚡ Fetching existing books from live server...');
    const booksRes = await fetch(`${baseUrl}/api/books`, { headers });
    if (!booksRes.ok) throw new Error('Failed to fetch remote books list');
    const remoteBooksList = await booksRes.json();
    const remoteBooksSet = new Set(
      remoteBooksList.map(b => b.title.toLowerCase().trim())
    );
    console.log(`✔ Found ${remoteBooksList.length} books already on the live server.`);

    // 5. Query local database for books with category/branch names
    console.log('⚡ Querying local database books...');
    const localBooks = await dbQuery.all(`
      SELECT b.title, b.author, b.priority, b.pdf_url, br.name AS branch_name, c.name AS category_name
      FROM books b
      JOIN branches br ON b.branch_id = br.id
      JOIN categories c ON b.category_id = c.id
    `);
    console.log(`📚 Found ${localBooks.length} books in local database.`);

    // Filter books that need to be uploaded
    const booksToUpload = localBooks.filter(b => {
      const titleLower = b.title.toLowerCase().trim();
      return !remoteBooksSet.has(titleLower) && b.pdf_url && b.pdf_url.startsWith('/uploads/');
    });

    console.log(`📢 ${booksToUpload.length} books need to be synced to the live server.\n`);

    if (booksToUpload.length === 0) {
      console.log('🎉 Live server is already fully in sync with local books!');
      process.exit(0);
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < booksToUpload.length; i++) {
      const book = booksToUpload[i];
      console.log(`[${i + 1}/${booksToUpload.length}] Syncing: "${book.title}"...`);

      // Resolve branch
      const branchKey = book.branch_name.toLowerCase().trim();
      const remoteBranchId = branchMap[branchKey];
      if (!remoteBranchId) {
        console.error(`  ❌ Error: Branch "${book.branch_name}" not found on live server. Skipping.`);
        failCount++;
        continue;
      }

      // Resolve category
      const catKey = book.category_name.toLowerCase().trim();
      const remoteCategoryId = categoryMap[catKey];
      if (!remoteCategoryId) {
        console.error(`  ❌ Error: Category "${book.category_name}" not found on live server. Skipping.`);
        failCount++;
        continue;
      }

      // Check file path
      const localPdfPath = path.join(__dirname, '..', book.pdf_url);
      if (!fs.existsSync(localPdfPath)) {
        console.error(`  ❌ Error: Local file not found at: ${localPdfPath}. Skipping.`);
        failCount++;
        continue;
      }

      // Read PDF file as blob
      const fileBuffer = fs.readFileSync(localPdfPath);
      const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });

      // Construct multipart FormData
      const formData = new FormData();
      formData.append('title', book.title);
      formData.append('author', book.author);
      formData.append('category_id', remoteCategoryId);
      formData.append('branch_id', remoteBranchId);
      formData.append('priority', book.priority);
      formData.append('pdf', fileBlob, path.basename(localPdfPath));

      // POST to /api/books
      try {
        const uploadRes = await fetch(`${baseUrl}/api/books`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (uploadRes.ok) {
          console.log(`  ✅ Successfully uploaded: "${book.title}"`);
          successCount++;
        } else {
          const errResText = await uploadRes.text();
          console.error(`  ❌ Upload failed (${uploadRes.status}): ${errResText}`);
          failCount++;
        }
      } catch (err) {
        console.error(`  ❌ Network error during upload: ${err.message}`);
        failCount++;
      }

      // Brief delay to prevent overloading the live server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(60));
    console.log('  Synchronization Sync Summary');
    console.log('='.repeat(60));
    console.log(`  ✅ Successfully Synced : ${successCount}`);
    console.log(`  ❌ Failed/Skipped     : ${failCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error(`\n\x1b[31mFatal Error during synchronization: ${error.message}\x1b[0m`);
    process.exit(1);
  }
}

runSync();
