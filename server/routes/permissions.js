const express = require('express');
const router = express.Router();
const { dbQuery } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Get current student's branch access requests
router.get('/my-requests', authenticateToken, async (req, res) => {
  try {
    const requests = await dbQuery.all(`
      SELECT p.id, p.branch_id, p.status, p.created_at, b.name AS branch_name
      FROM permissions p
      JOIN branches b ON p.branch_id = b.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    
    return res.json(requests);
  } catch (error) {
    console.error('Error fetching student requests:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Student requests access to a branch
router.post('/request', authenticateToken, async (req, res) => {
  const { branch_id } = req.body;

  if (!branch_id) {
    return res.status(400).json({ error: 'Branch ID is required' });
  }

  try {
    // Verify branch exists
    const branch = await dbQuery.get('SELECT name FROM branches WHERE id = ?', [branch_id]);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if user is requesting their own branch
    if (branch.name === req.user.branch_name) {
      return res.status(400).json({ error: 'You already have default access to your own branch' });
    }

    // Check if permission already exists
    const existing = await dbQuery.get(
      'SELECT id, status FROM permissions WHERE user_id = ? AND branch_id = ?',
      [req.user.id, branch_id]
    );

    if (existing) {
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'Access request for this branch is already pending admin review' });
      }
      if (existing.status === 'approved') {
        return res.status(400).json({ error: 'You already have access to this branch' });
      }
      // If rejected, let them request again by resetting to pending
      await dbQuery.run(
        'UPDATE permissions SET status = "pending", created_at = CURRENT_TIMESTAMP WHERE id = ?',
        [existing.id]
      );
      return res.json({ message: 'Re-submitted branch access request successfully' });
    }

    // Insert new request
    await dbQuery.run(
      'INSERT INTO permissions (user_id, branch_id, status) VALUES (?, ?, "pending")',
      [req.user.id, branch_id]
    );

    // H-2 FIX: Do NOT log this as 'admin_action' — student branch requests are
    // already recorded in the permissions table. Logging them as admin_action
    // was polluting the admin audit trail with student-initiated events.

    return res.status(201).json({ message: 'Branch access request submitted successfully' });
  } catch (error) {
    console.error('Error submitting branch access request:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin Route: Get all pending branch access requests
router.get('/pending-requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pending = await dbQuery.all(`
      SELECT p.id, p.status, p.created_at, 
             u.id AS user_id, u.full_name, u.roll_number, u.branch_name AS student_branch, u.bt_number,
             b.id AS requested_branch_id, b.name AS requested_branch_name
      FROM permissions p
      JOIN users u ON p.user_id = u.id
      JOIN branches b ON p.branch_id = b.id
      WHERE p.status = 'pending'
      ORDER BY p.created_at DESC
    `);
    
    return res.json(pending);
  } catch (error) {
    console.error('Error fetching pending branch requests:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin Route: Approve/Reject branch access request
router.post('/approve/:id', authenticateToken, requireAdmin, async (req, res) => {
  const requestId = req.params.id;
  const { status } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be "approved" or "rejected"' });
  }

  try {
    // Get request details for logging
    const requestDetails = await dbQuery.get(`
      SELECT p.user_id, p.branch_id, u.full_name, b.name AS branch_name
      FROM permissions p
      JOIN users u ON p.user_id = u.id
      JOIN branches b ON p.branch_id = b.id
      WHERE p.id = ?
    `, [requestId]);

    if (!requestDetails) {
      return res.status(404).json({ error: 'Access request not found' });
    }

    await dbQuery.run('UPDATE permissions SET status = ? WHERE id = ?', [status, requestId]);

    // Log the approval action
    await dbQuery.run(`
      INSERT INTO activity_logs (user_id, action_type, details)
      VALUES (?, 'admin_action', ?)
    `, [
      req.user.id,
      `${status === 'approved' ? 'Approved' : 'Rejected'} ${requestDetails.full_name}'s request for branch "${requestDetails.branch_name}"`
    ]);

    return res.json({ message: `Branch access request was ${status}` });
  } catch (error) {
    console.error('Error approving branch request:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin Route: Get all permissions (history)
router.get('/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const list = await dbQuery.all(`
      SELECT p.id, p.status, p.created_at, 
             u.full_name, u.roll_number, u.branch_name AS student_branch,
             b.name AS requested_branch_name
      FROM permissions p
      JOIN users u ON p.user_id = u.id
      JOIN branches b ON p.branch_id = b.id
      ORDER BY p.created_at DESC
    `);
    
    return res.json(list);
  } catch (error) {
    console.error('Error fetching all permissions:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
