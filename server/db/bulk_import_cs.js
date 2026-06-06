/**
 * Bulk Import Script for CS Branch Books
 * 
 * This script:
 * 1. Reads all PDF files from the CS books source directory (including subdirectories)
 * 2. Copies them to the server's /uploads folder
 * 3. Auto-detects category from book title
 * 4. Inserts each book into the database under "Computer Science" branch
 * 
 * Usage: node server/db/bulk_import_cs.js
 */

const fs = require('fs');
const path = require('path');
const { initDatabase, dbQuery } = require('./database');

// ── Source directory containing CS books ───────────────────────────────────────
const SOURCE_DIR = path.resolve(
  __dirname,
  '../../back\'/cs book-20260602T161451Z-3-003/cs book'
);

// ── Uploads destination ────────────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

// ── Category auto-detection keywords ──────────────────────────────────────────
// Maps category name (must exist in DB) -> keywords to detect from title
const CATEGORY_KEYWORDS = {
  'Algorithms & Data Structures': [
    'algorithm', 'data structure', 'algorithmic', 'sorting', 'graph',
    'complexity', 'computation', 'theory of computation', 'competitive',
    'puzzles', 'karumanchi', 'corman', 'cormen'
  ],
  'Database Management Systems': [
    'database', 'dbms', 'sql', 'navathe', 'elmasri', 'data mining',
    'data science', 'big data', 'analytics', 'information retrieval'
  ],
  'Core Computer Science': [
    'computer', 'operating system', 'os', 'network', 'networking',
    'communication', 'wireless', 'lan', 'atm', 'internet of things', 'iot',
    'assembly', 'linux', 'python', 'java', 'c++', 'object oriented',
    'deep learning', 'machine learning', 'artificial intelligence',
    'android', 'compiler', 'digital', 'architecture', 'verilog',
    'reverse', 'probability', 'statistics', 'mathematical'
  ],
  'Web Development': [
    'web', 'html', 'css', 'javascript', 'react', 'node', 'frontend', 'backend',
    'fullstack', 'php', 'ruby'
  ]
};

// ── Known author overrides for common books ────────────────────────────────────
const KNOWN_BOOKS = {
  'an introduction to the theory of computation - eitan gurari': {
    author: 'Eitan Gurari', category: 'Algorithms & Data Structures'
  },
  'asynchronous transfer mode (atm)': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  'basic concepts of computer': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  'c++ data structures 3rd ed by  nell dale': {
    author: 'Nell Dale', category: 'Algorithms & Data Structures'
  },
  'coreman_': {
    author: 'Thomas H. Cormen', category: 'Algorithms & Data Structures'
  },
  'compilers_principles_techniques_tools': {
    author: 'Alfred V. Aho', category: 'Core Computer Science'
  },
  'computational complexity a conceptual perspective - oded goldreich': {
    author: 'Oded Goldreich', category: 'Algorithms & Data Structures'
  },
  'computer.organization.and.design.the.hardware.software.interface.3rd.ed.2004.solutions': {
    author: 'David A. Patterson', category: 'Core Computer Science'
  },
  'dbms_navathe_sandy': {
    author: 'Ramez Elmasri & Shamkant Navathe', category: 'Database Management Systems'
  },
  'data mining the textbook by charu c agarwal': {
    author: 'Charu C. Aggarwal', category: 'Database Management Systems'
  },
  'data science design manual data science design by steven s skiena ---': {
    author: 'Steven S. Skiena', category: 'Database Management Systems'
  },
  'data science with julia by paul d mcnicholas ---': {
    author: 'Paul D. McNicholas', category: 'Database Management Systems'
  },
  'data structures and algorithms made easy data structures and algorithmic puzzles 5th ed by narasimha karumanchi': {
    author: 'Narasimha Karumanchi', category: 'Algorithms & Data Structures'
  },
  'digital systems and applications 2e': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  'ellenberg, jordan - how not to be wrong. the power of mathematical thinking-penguin group us (2014)': {
    author: 'Jordan Ellenberg', category: 'Core Computer Science'
  },
  'forouzan, behrouz - data communications and network-mcgraw-hill (2013)': {
    author: 'Behrouz Forouzan', category: 'Core Computer Science'
  },
  'from big data to big profits success with data and analytics by russell walkar': {
    author: 'Russell Walker', category: 'Database Management Systems'
  },
  'fundamentals_of_database_systems, 3ed, elmasri___navathe_': {
    author: 'Ramez Elmasri & Shamkant Navathe', category: 'Database Management Systems'
  },
  'graph': {
    author: 'Unknown', category: 'Algorithms & Data Structures'
  },
  'head first android development a brain-friendly guide 2nd ed by dawn grifgiths ---': {
    author: 'Dawn Griffiths', category: 'Core Computer Science'
  },
  'head first python  a brain-friendly guide 2nd ed by paul barry ---': {
    author: 'Paul Barry', category: 'Core Computer Science'
  },
  'ian goodfellow, yoshua bengio, aaron courville - deep learning (2017, mit)': {
    author: 'Ian Goodfellow, Yoshua Bengio, Aaron Courville', category: 'Core Computer Science'
  },
  'internet of things by rajkumar buyya': {
    author: 'Rajkumar Buyya', category: 'Core Computer Science'
  },
  'internet of things by tuterials point': {
    author: 'Tutorials Point', category: 'Core Computer Science'
  },
  'introduction to computer science using python by charles dierbach ---': {
    author: 'Charles Dierbach', category: 'Core Computer Science'
  },
  'java_tm_': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  'learning to rank for information retrieval by tie-yan liu ---': {
    author: 'Tie-Yan Liu', category: 'Database Management Systems'
  },
  'linux assembly language programming 2000': {
    author: 'Bob Neveln', category: 'Core Computer Science'
  },
  'machine learning a probabilistic perspective by kevin p murphy ---': {
    author: 'Kevin P. Murphy', category: 'Core Computer Science'
  },
  'machine learning algorithms by giuseppe bonaccorsd ---': {
    author: 'Giuseppe Bonaccorso', category: 'Core Computer Science'
  },
  'machine learning by peter flach ---': {
    author: 'Peter Flach', category: 'Core Computer Science'
  },
  'mining the social web data mining facebook twitter linkedin instagram by mathew a russell': {
    author: 'Matthew A. Russell', category: 'Database Management Systems'
  },
  'objectorientedprogramminginc4thedition': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  'probability & statistics for engineers and scientist -ronald e. walpore': {
    author: 'Ronald E. Walpole', category: 'Core Computer Science'
  },
  'python data science handbook  jake vander plas ---': {
    author: 'Jake VanderPlas', category: 'Database Management Systems'
  },
  'python real world data science a course in four modules by corated course': {
    author: 'Various Authors', category: 'Database Management Systems'
  },
  'quantitative data analysis by dondd j triman': {
    author: 'Donald J. Triman', category: 'Database Management Systems'
  },
  'r for data science by hadley wickhan ---': {
    author: 'Hadley Wickham', category: 'Database Management Systems'
  },
  'theoryofcomputation': {
    author: 'Unknown', category: 'Algorithms & Data Structures'
  },
  'wireless lan communications': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  'wrox.professional.c.plus.plus.jan.2005.ebook-ddu': {
    author: 'Various Authors', category: 'Core Computer Science'
  },
  'ebook data mining - concepts and techniques': {
    author: 'Jiawei Han & Micheline Kamber', category: 'Database Management Systems'
  },
  'python': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  // ACA subdirectory
  'digital design and fabrication': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  'engineering digital design 2e - tinder': {
    author: 'Richard F. Tinder', category: 'Core Computer Science'
  },
  'morgan kaufmann computer architecture, a quantitative approach 3rd edition 2002': {
    author: 'John L. Hennessy & David A. Patterson', category: 'Core Computer Science'
  },
  'professional assembly language': {
    author: 'Richard Blum', category: 'Core Computer Science'
  },
  'reversing - secrets of reverse engineering': {
    author: 'Eldad Eilam', category: 'Core Computer Science'
  },
  'verilog - a guide to digital design and synthesis': {
    author: 'Samir Palnitkar', category: 'Core Computer Science'
  },
  // books(BG) subdirectory
  'iot-book2016-c1': {
    author: 'Unknown', category: 'Core Computer Science'
  },
  'datascience book': {
    author: 'Unknown', category: 'Database Management Systems'
  }
};

/**
 * Convert a raw filename (without extension) to a clean title
 */
function fileNameToTitle(name) {
  // Remove dots used as spaces
  let title = name
    .replace(/\.pdf$/i, '')
    .replace(/---\s*$/, '')
    .trim();
  return title;
}

/**
 * Auto-detect category from title using keywords
 */
function detectCategory(title) {
  const lower = title.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return category;
      }
    }
  }
  return 'Core Computer Science'; // Fallback
}

/**
 * Recursively collect all PDF files from a directory
 */
function collectPDFs(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPDFs(fullPath, results);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Sanitize a filename for upload storage
 */
function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

/**
 * Main import function
 */
async function bulkImport() {
  console.log('='.repeat(60));
  console.log('  CS Books Bulk Importer');
  console.log('='.repeat(60));
  console.log('Source:', SOURCE_DIR);
  console.log('Uploads:', UPLOADS_DIR);
  console.log('');

  // Ensure uploads dir exists
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // Init DB
  await initDatabase();

  // Ensure CS branch exists
  await dbQuery.run('INSERT OR IGNORE INTO branches (name) VALUES (?)', ['Computer Science']);
  const csBranch = await dbQuery.get('SELECT id FROM branches WHERE name = ?', ['Computer Science']);
  if (!csBranch) {
    console.error('ERROR: Could not find or create Computer Science branch!');
    process.exit(1);
  }
  const branchId = csBranch.id;
  console.log(`✔ Computer Science branch ID: ${branchId}`);

  // Ensure required categories exist
  const requiredCategories = [
    'Core Computer Science',
    'Algorithms & Data Structures',
    'Database Management Systems',
    'Web Development'
  ];

  for (const catName of requiredCategories) {
    await dbQuery.run('INSERT OR IGNORE INTO categories (name, parent_category_id) VALUES (?, NULL)', [catName]);
  }

  const dbCats = await dbQuery.all('SELECT * FROM categories');
  const catMap = {};
  dbCats.forEach(c => { catMap[c.name] = c.id; });
  console.log(`✔ Categories ready: ${Object.keys(catMap).join(', ')}\n`);

  // Collect all PDFs
  const pdfFiles = collectPDFs(SOURCE_DIR);
  console.log(`📚 Found ${pdfFiles.length} PDF files to import.\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const srcPath of pdfFiles) {
    const rawName = path.basename(srcPath, '.pdf');
    const titleRaw = fileNameToTitle(rawName);
    const lowerKey = rawName.toLowerCase().trim();

    // Check for known book entry
    const known = KNOWN_BOOKS[lowerKey];

    const title = titleRaw;
    const author = known ? known.author : 'Unknown';
    let categoryName = known ? known.category : detectCategory(titleRaw);

    // Fallback if category not in map
    if (!catMap[categoryName]) {
      categoryName = 'Core Computer Science';
    }
    const categoryId = catMap[categoryName];

    // Check if book already exists (by title and branch)
    const existing = await dbQuery.get(
      'SELECT id FROM books WHERE title = ? AND branch_id = ?',
      [title, branchId]
    );

    if (existing) {
      console.log(`  ⏭  SKIP (already exists): ${title}`);
      skipped++;
      continue;
    }

    try {
      // Copy PDF to uploads
      const safeName = `cs-bulk-${Date.now()}-${sanitizeFileName(path.basename(srcPath))}`;
      const destPath = path.join(UPLOADS_DIR, safeName);
      fs.copyFileSync(srcPath, destPath);

      const pdfUrl = `/uploads/${safeName}`;

      // Insert book record
      await dbQuery.run(
        `INSERT INTO books (title, author, category_id, branch_id, priority, pdf_url)
         VALUES (?, ?, ?, ?, 'main', ?)`,
        [title, author, categoryId, branchId, pdfUrl]
      );

      console.log(`  ✅ Imported: ${title}`);
      console.log(`       Author   : ${author}`);
      console.log(`       Category : ${categoryName}`);
      console.log(`       File     : ${safeName}`);
      imported++;

      // Small delay to avoid same timestamp filenames
      await new Promise(r => setTimeout(r, 5));
    } catch (err) {
      console.error(`  ❌ ERROR importing "${title}":`, err.message);
      errors++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`  Import Complete!`);
  console.log(`  ✅ Imported : ${imported}`);
  console.log(`  ⏭  Skipped  : ${skipped} (already existed)`);
  console.log(`  ❌ Errors   : ${errors}`);
  console.log('='.repeat(60));

  process.exit(0);
}

bulkImport().catch(err => {
  console.error('Fatal error during bulk import:', err);
  process.exit(1);
});
