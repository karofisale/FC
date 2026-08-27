const express = require('express');
const router = express.Router();
const { db } = require('../db/init');
const { randomUUID } = require('crypto');

// Get approval workflow status for cycles
router.get('/', (req, res) => {
  try {
    const { bu, status } = req.query;
    let query = `
      SELECT app.*, fc.business_unit_code, fc.base_month, bu.name as business_unit_name, fv.update_week, u.full_name as approver_name
      FROM approvals app
      JOIN forecast_cycles fc ON fc.id = app.cycle_id
      JOIN forecast_versions fv ON fv.id = app.version_id
      JOIN business_units bu ON bu.code = fc.business_unit_code
      LEFT JOIN users u ON u.id = app.approver_id
      WHERE 1=1
    `;
    const params = [];
    if (bu) {
      query += ` AND fc.business_unit_code = ?`;
      params.push(bu);
    }
    if (status) {
      query += ` AND app.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY app.requested_at DESC`;
    const list = db.prepare(query).all(...params);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit cycle version for approval
router.post('/submit', (req, res) => {
  try {
    const { cycleId, versionId, userId } = req.body;
    if (!cycleId || !versionId) return res.status(400).json({ error: 'cycleId and versionId are required' });

    db.transaction(() => {
      // Update cycle status to submitted
      db.prepare(`UPDATE forecast_cycles SET status = 'submitted' WHERE id = ?`).run(cycleId);
      // Set submitted_at timestamp on version
      db.prepare(`UPDATE forecast_versions SET submitted_at = datetime('now'), submitted_by = ? WHERE id = ?`).run(userId || 'u-admin-1', versionId);
      // Create approval record
      db.prepare(`
        INSERT INTO approvals (id, cycle_id, version_id, status, requested_at)
        VALUES (?, ?, ?, 'pending', datetime('now'))
      `).run(randomUUID(), cycleId, versionId);
    })();

    res.json({ message: 'Cycle submitted for approval successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or Reject cycle version
router.post('/decide', (req, res) => {
  try {
    const { approvalId, decision, comment, userId } = req.body; // decision: 'approved' | 'rejected' | 'revision_requested'
    if (!approvalId || !decision) return res.status(400).json({ error: 'approvalId and decision are required' });

    const approval = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(approvalId);
    if (!approval) return res.status(404).json({ error: 'Approval request not found' });

    db.transaction(() => {
      db.prepare(`
        UPDATE approvals
        SET status = ?, comment = ?, approver_id = ?, decided_at = datetime('now')
        WHERE id = ?
      `).run(decision, comment || null, userId || 'u-gt2-ap', approvalId);

      const cycleStatus = decision === 'approved' ? 'approved' : 'rejected';
      db.prepare(`UPDATE forecast_cycles SET status = ? WHERE id = ?`).run(cycleStatus, approval.cycle_id);
    })();

    res.json({ message: `Forecast decision recorded: ${decision}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
