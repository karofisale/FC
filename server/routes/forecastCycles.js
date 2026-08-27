const express = require('express');
const router = express.Router();
const { db } = require('../db/init');
const { randomUUID } = require('crypto');

// Get cycles with filtering
router.get('/', (req, res) => {
  try {
    const { bu, status, baseMonth } = req.query;
    let query = `
      SELECT fc.*, bu.name as business_unit_name, u.full_name as creator_name
      FROM forecast_cycles fc
      JOIN business_units bu ON bu.code = fc.business_unit_code
      LEFT JOIN users u ON u.id = fc.created_by
      WHERE 1=1
    `;
    const params = [];

    if (bu) {
      query += ` AND fc.business_unit_code = ?`;
      params.push(bu);
    }
    if (status) {
      query += ` AND fc.status = ?`;
      params.push(status);
    }
    if (baseMonth) {
      query += ` AND fc.base_month = ?`;
      params.push(baseMonth);
    }

    query += ` ORDER BY fc.base_month DESC, fc.business_unit_code`;
    const cycles = db.prepare(query).all(...params);
    res.json(cycles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new cycle
router.post('/', (req, res) => {
  try {
    const { businessUnitCode, baseMonth, horizonMonths = 4, userId } = req.body;
    if (!businessUnitCode || !baseMonth) {
      return res.status(400).json({ error: 'businessUnitCode and baseMonth are required.' });
    }

    const id = `c-${businessUnitCode.toLowerCase()}-${baseMonth.replace(/-/g, '').slice(0, 6)}`;
    
    // Check if already exists
    const existing = db.prepare(`SELECT * FROM forecast_cycles WHERE business_unit_code = ? AND base_month = ?`).get(businessUnitCode, baseMonth);
    if (existing) {
      return res.json(existing);
    }

    db.prepare(`
      INSERT INTO forecast_cycles (id, business_unit_code, base_month, horizon_months, status, created_by)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `).run(id, businessUnitCode, baseMonth, horizonMonths, userId || 'u-admin-1');

    // Create initial Version 0 (W0)
    const versionId = `v-${businessUnitCode.toLowerCase()}-w0-${Date.now()}`;
    db.prepare(`
      INSERT INTO forecast_versions (id, cycle_id, update_week, update_date, iso_week_label, submitted_by, is_final)
      VALUES (?, ?, 0, ?, 'W0', ?, 1)
    `).run(versionId, id, baseMonth, userId || 'u-admin-1');

    const createdCycle = db.prepare(`SELECT * FROM forecast_cycles WHERE id = ?`).get(id);
    res.status(201).json({ cycle: createdCycle, initialVersionId: versionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get versions of a cycle
router.get('/:id/versions', (req, res) => {
  try {
    const versions = db.prepare(`
      SELECT fv.*, u.full_name as submitter_name
      FROM forecast_versions fv
      LEFT JOIN users u ON u.id = fv.submitted_by
      WHERE fv.cycle_id = ?
      ORDER BY fv.update_week ASC
    `).all(req.params.id);
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new version for a cycle (e.g. Week 1, Week 2 update)
router.post('/:id/versions', (req, res) => {
  try {
    const cycleId = req.params.id;
    const { updateWeek, updateDate, isoWeekLabel, userId } = req.body;

    const cycle = db.prepare(`SELECT * FROM forecast_cycles WHERE id = ?`).get(cycleId);
    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });

    if (cycle.status === 'approved' || cycle.status === 'locked') {
      return res.status(400).json({ error: 'Cycle is locked/approved and cannot be modified.' });
    }

    const versionId = `v-${cycle.business_unit_code.toLowerCase()}-w${updateWeek}-${Date.now()}`;

    // Mark previous versions as is_final = 0 if this becomes final
    db.transaction(() => {
      db.prepare(`UPDATE forecast_versions SET is_final = 0 WHERE cycle_id = ?`).run(cycleId);
      db.prepare(`
        INSERT INTO forecast_versions (id, cycle_id, update_week, update_date, iso_week_label, submitted_by, is_final)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(versionId, cycleId, updateWeek, updateDate || new Date().toISOString().split('T')[0], isoWeekLabel || `W${updateWeek}`, userId);
    })();

    const newVersion = db.prepare(`SELECT * FROM forecast_versions WHERE id = ?`).get(versionId);
    res.status(201).json(newVersion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
