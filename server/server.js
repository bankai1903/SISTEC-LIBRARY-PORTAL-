const express = require('express');

const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost',
  'capacitor://localhost'
];
app.use(cors({
  origin: (origin, callback) => {
    const envOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
      : [];
    const allAllowed = [...allowedOrigins, ...envOrigins];

    const isDeployDomain = origin && (
      origin.endsWith('.vercel.app') || 
      origin.endsWith('.netlify.app') || 
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.gitpod.io')
    );

    if (!origin || allAllowed.includes(origin) || isDeployDomain) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Ensure uploads folder exists
const fs = require('fs');
const uploadDir = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// Serve static uploads
app.use('/uploads', express.static(uploadDir));

// Routes
const authRouter = require('./routes/auth');
const booksRouter = require('./routes/books');
const permissionsRouter = require('./routes/permissions');
const analyticsRouter = require('./routes/analytics');

app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/analytics', analyticsRouter);

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Serve frontend in production (optional, if client is built inside server directory)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
  });
}

// L-7 FIX: Multer error handler middleware (must have 4 arguments: err, req, res, next)
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File is too large! Maximum limit is 200MB.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files! Maximum limit is 50 files.' });
  }
  return res.status(400).json({ error: err.message || 'An upload error occurred.' });
});

const seed = require('./db/seed');

// Initialize database, auto-seed default data, then start server
initDatabase().then(async () => {
  try {
    await seed();
  } catch (seedErr) {
    console.warn('Database seeding note:', seedErr.message);
  }
}).catch(err => {
  console.warn('Database initialization note:', err.message);
}).finally(() => {
  app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(` Library Management Server is active!`);
    console.log(` Running on: http://localhost:${PORT}`);
    console.log(`=============================================`);
  });
});
