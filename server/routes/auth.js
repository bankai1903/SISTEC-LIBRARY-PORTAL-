const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../db/database');
const { authenticateToken, requireAdmin, JWT_SECRET } = require('../middleware/auth');

// Get all branches publicly (for registration dropdown)
router.get('/branches', async (req, res) => {
  try {
    const branches = await dbQuery.all('SELECT * FROM branches ORDER BY name ASC');
    return res.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Register standard student
router.post('/register', async (req, res) => {
  const {
    username,
    password,
    fullName,
    rollNumber,
    branchName,
    year,
    semester,
    btNumber
  } = req.body;

  if (!username || !password || !fullName || !rollNumber || !branchName || !year || !semester || !btNumber) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // M-1 FIX: Validate password length on backend
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    // Check if user already exists
    const existingUser = await dbQuery.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user as pending
    await dbQuery.run(`
      INSERT INTO users (username, password_hash, full_name, roll_number, branch_name, year, semester, bt_number, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'student', 'pending')
    `, [username, passwordHash, fullName, rollNumber, branchName, year, semester, btNumber]);

    return res.status(201).json({ message: 'Registration successful! Awaiting admin approval.' });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login (Admins and Students)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await dbQuery.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Check status if student
    if (user.role === 'student' && user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is pending admin approval' });
    }
    if (user.role === 'student' && user.status === 'rejected') {
      return res.status(403).json({ error: 'Your registration request was rejected by the admin' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
      expiresIn: '24h'
    });

    // Track login event
    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, details)
      VALUES (?, 'login', ?)
    `, [user.id, `User logged in from IP/browser`]);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        branchName: user.branch_name,
        rollNumber: user.roll_number,
        year: user.year,
        semester: user.semester,
        btNumber: user.bt_number
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login' });
  }
});

// Logout (logs event)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, details)
      VALUES (?, 'logout', ?)
    `, [req.user.id, `User logged out`]);

    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Server error during logout' });
  }
});

// Get current user details
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbQuery.get('SELECT id, username, full_name, roll_number, branch_name, year, semester, bt_number, role, status FROM users WHERE id = ?', [req.user.id]);
    return res.json({ user });
  } catch (error) {
    console.error('Get user details error:', error);
    return res.status(500).json({ error: 'Server error fetching user details' });
  }
});

// Get pending user registrations (Admin only)
router.get('/pending-users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await dbQuery.all(`
      SELECT id, username, full_name, roll_number, branch_name, year, semester, bt_number, status, created_at
      FROM users
      WHERE role = 'student' AND status = 'pending'
      ORDER BY created_at DESC
    `);
    return res.json(pendingUsers);
  } catch (error) {
    console.error('Error fetching pending users:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Approve/Reject user registration (Admin only)
router.post('/approve-user/:id', authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { status } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status choice' });
  }

  try {
    const user = await dbQuery.get('SELECT id, full_name FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await dbQuery.run('UPDATE users SET status = ? WHERE id = ?', [status, userId]);

    // Log admin action
    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, details)
      VALUES (?, 'admin_action', ?)
    `, [req.user.id, `${status === 'approved' ? 'Approved' : 'Rejected'} registration for ${user.full_name} (ID: ${userId})`]);

    return res.json({ message: `User registration status updated to ${status}` });
  } catch (error) {
    console.error('Error approving user:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all users (Admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await dbQuery.all(`
      SELECT id, username, full_name, roll_number, branch_name, year, semester, bt_number, role, status, created_at
      FROM users
      ORDER BY role ASC, status DESC, created_at DESC
    `);
    return res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete a student account (Admin only)
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;

  try {
    // Prevent admin from deleting their own account
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account' });
    }

    const user = await dbQuery.get('SELECT id, full_name, role FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only allow deletion of student accounts
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be deleted via this endpoint' });
    }

    // Delete the user (cascades to permissions, progress, and logs via FK ON DELETE CASCADE)
    await dbQuery.run('DELETE FROM users WHERE id = ?', [userId]);

    // Log the admin action
    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, details)
      VALUES (?, 'admin_action', ?)
    `, [req.user.id, `Deleted student account: ${user.full_name} (ID: ${userId})`]);

    return res.json({ message: `Student account for "${user.full_name}" has been permanently deleted.` });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Server error while deleting user' });
  }
});

module.exports = router;

