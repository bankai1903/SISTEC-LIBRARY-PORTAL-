const bcrypt = require('bcryptjs');
const { initDatabase, dbQuery } = require('./database');

async function seed() {
  console.log('Starting database seeding...');
  await initDatabase();

  try {
    // 1. Seed Branches
    const branches = [
      'Computer Science',
      'Information Technology',
      'Electrical Engineering',
      'Mechanical Engineering',
      'Civil Engineering'
    ];
    
    for (const b of branches) {
      await dbQuery.run('INSERT OR IGNORE INTO branches (name) VALUES (?)', [b]);
    }
    console.log('Branches seeded.');

    // Fetch branches for referencing IDs
    const dbBranches = await dbQuery.all('SELECT * FROM branches');
    const branchMap = {};
    dbBranches.forEach(b => {
      branchMap[b.name] = b.id;
    });

    // 2. Seed Categories
    // Main Subjects
    const mainCategories = [
      { name: 'Core Computer Science', parent: null },
      { name: 'Web Development', parent: null },
      { name: 'Electrical Systems', parent: null },
      { name: 'Thermal Engineering', parent: null },
      { name: 'Structural Design', parent: null }
    ];

    for (const cat of mainCategories) {
      await dbQuery.run('INSERT OR IGNORE INTO categories (name, parent_category_id) VALUES (?, NULL)', [cat.name]);
    }

    const dbMainCats = await dbQuery.all('SELECT * FROM categories WHERE parent_category_id IS NULL');
    const catMap = {};
    dbMainCats.forEach(c => {
      catMap[c.name] = c.id;
    });

    // Sub-Subjects
    const subCategories = [
      { name: 'Algorithms & Data Structures', parentId: catMap['Core Computer Science'] },
      { name: 'Database Management Systems', parentId: catMap['Core Computer Science'] },
      { name: 'React & Frontend Frameworks', parentId: catMap['Web Development'] },
      { name: 'NodeJS Backend Development', parentId: catMap['Web Development'] },
      { name: 'Power Grid Systems', parentId: catMap['Electrical Systems'] },
      { name: 'Internal Combustion Engines', parentId: catMap['Thermal Engineering'] },
      { name: 'Concrete Technology', parentId: catMap['Structural Design'] }
    ];

    for (const sub of subCategories) {
      await dbQuery.run('INSERT OR IGNORE INTO categories (name, parent_category_id) VALUES (?, ?)', [sub.name, sub.parentId]);
    }
    console.log('Categories & Sub-categories seeded.');

    // Fetch all categories for books reference
    const dbAllCats = await dbQuery.all('SELECT * FROM categories');
    const allCatMap = {};
    dbAllCats.forEach(c => {
      allCatMap[c.name] = c.id;
    });

    // 3. Seed Books
    const books = [
      // Computer Science Main
      {
        title: 'Introduction to Algorithms',
        author: 'Thomas H. Cormen',
        category: 'Algorithms & Data Structures',
        branch: 'Computer Science',
        priority: 'main',
        pdf_url: '/pdfs/intro-to-algorithms.pdf'
      },
      {
        title: 'Operating System Concepts',
        author: 'Abraham Silberschatz',
        category: 'Core Computer Science',
        branch: 'Computer Science',
        priority: 'main',
        pdf_url: '/pdfs/os-concepts.pdf'
      },
      // Computer Science Sub
      {
        title: 'Eloquent JavaScript',
        author: 'Marijn Haverbeke',
        category: 'React & Frontend Frameworks',
        branch: 'Computer Science',
        priority: 'sub',
        pdf_url: '/pdfs/eloquent-js.pdf'
      },
      {
        title: 'SQL Practice Guide',
        author: 'Alice Johnson',
        category: 'Database Management Systems',
        branch: 'Computer Science',
        priority: 'sub',
        pdf_url: '/pdfs/sql-practice.pdf'
      },

      // Information Technology Main
      {
        title: 'Full Stack React Developer',
        author: 'Robin Wieruch',
        category: 'React & Frontend Frameworks',
        branch: 'Information Technology',
        priority: 'main',
        pdf_url: '/pdfs/fullstack-react.pdf'
      },
      // Information Technology Sub
      {
        title: 'Design Patterns Elements of Reusable Object-Oriented Software',
        author: 'Erich Gamma',
        category: 'Algorithms & Data Structures',
        branch: 'Information Technology',
        priority: 'sub',
        pdf_url: '/pdfs/design-patterns.pdf'
      },

      // Electrical Engineering Main
      {
        title: 'Electric Machinery Fundamentals',
        author: 'Stephen J. Chapman',
        category: 'Electrical Systems',
        branch: 'Electrical Engineering',
        priority: 'main',
        pdf_url: '/pdfs/electric-machinery.pdf'
      },
      // Electrical Engineering Sub
      {
        title: 'Power Systems Analysis',
        author: 'John Grainger',
        category: 'Power Grid Systems',
        branch: 'Electrical Engineering',
        priority: 'sub',
        pdf_url: '/pdfs/power-systems.pdf'
      },

      // Mechanical Engineering Main
      {
        title: 'Thermodynamics: An Engineering Approach',
        author: 'Yunus A. Cengel',
        category: 'Thermal Engineering',
        branch: 'Mechanical Engineering',
        priority: 'main',
        pdf_url: '/pdfs/thermodynamics.pdf'
      },
      // Mechanical Engineering Sub
      {
        title: 'IC Engines and Dynamics',
        author: 'Richard Stone',
        category: 'Internal Combustion Engines',
        branch: 'Mechanical Engineering',
        priority: 'sub',
        pdf_url: '/pdfs/ic-engines.pdf'
      },

      // Civil Engineering Main
      {
        title: 'Design of Concrete Structures',
        author: 'Arthur H. Nilson',
        category: 'Structural Design',
        branch: 'Civil Engineering',
        priority: 'main',
        pdf_url: '/pdfs/concrete-structures.pdf'
      },
      // Civil Engineering Sub
      {
        title: 'Properties of Concrete',
        author: 'A. M. Neville',
        category: 'Concrete Technology',
        branch: 'Civil Engineering',
        priority: 'sub',
        pdf_url: '/pdfs/concrete-properties.pdf'
      }
    ];

    for (const b of books) {
      const categoryId = allCatMap[b.category] || allCatMap['Core Computer Science'];
      const branchId = branchMap[b.branch];
      
      await dbQuery.run(`
        INSERT INTO books (title, author, category_id, branch_id, priority, pdf_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [b.title, b.author, categoryId, branchId, b.priority, b.pdf_url]);
    }
    console.log('Books seeded.');

    // 4. Seed Users
    const salt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash('admin123', salt);
    const studentPasswordHash = await bcrypt.hash('student123', salt);

    // Default Admin User
    await dbQuery.run(`
      INSERT OR IGNORE INTO users (username, password_hash, full_name, role, status)
      VALUES (?, ?, ?, ?, ?)
    `, ['admin', adminPasswordHash, 'System Administrator', 'admin', 'approved']);

    // Default Approved Student (Computer Science)
    await dbQuery.run(`
      INSERT OR IGNORE INTO users (username, password_hash, full_name, roll_number, branch_name, year, semester, bt_number, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'student_cs', 
      studentPasswordHash, 
      'Rohan Sharma', 
      '0101CS221045', 
      'Computer Science', 
      '3rd Year', 
      '6th Semester', 
      'BT-CS-221045', 
      'student', 
      'approved'
    ]);

    // Default Pending Student (IT)
    await dbQuery.run(`
      INSERT OR IGNORE INTO users (username, password_hash, full_name, roll_number, branch_name, year, semester, bt_number, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'student_pending', 
      studentPasswordHash, 
      'Aditi Patel', 
      '0101IT221002', 
      'Information Technology', 
      '3rd Year', 
      '6th Semester', 
      'BT-IT-221002', 
      'student', 
      'pending'
    ]);

    console.log('Users seeded (admin: admin/admin123, approved student: student_cs/student123).');
    console.log('Database seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

// If run directly
if (require.main === module) {
  seed();
}

module.exports = seed;
