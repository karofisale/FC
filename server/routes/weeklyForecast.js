const express = require('express');
const router = express.Router();
const { db } = require('../db/init');
const { randomUUID } = require('crypto');

// Get weekly region splits for a version
router.get('/', (req, res) => {
  try {
    const { versionId } = req.query;
    if (!versionId) return res.status(400).json({ error: 'versionId parameter is required' });

    const splits = db.prepare(`
      SELECT wrs.*, p.name as product_name, p.short_name, p.product_group_code
      FROM weekly_region_splits wrs
      JOIN products p ON p.sku_code = wrs.sku_code
      WHERE wrs.version_id = ?
      ORDER BY p.product_group_code, wrs.sku_code, wrs.week_number, wrs.region_code
    `).all(versionId);

    res.json(splits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk update weekly region splits
router.post('/bulk', (req, res) => {
  try {
    const { versionId, splits } = req.body; // splits: Array<{ skuCode, weekNumber, regionCode, quantity }>
    if (!versionId || !Array.isArray(splits)) {
      return res.status(400).json({ error: 'versionId and splits array are required' });
    }

    const stmt = db.prepare(`
      INSERT INTO weekly_region_splits (id, version_id, sku_code, week_number, region_code, quantity, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(version_id, sku_code, week_number, region_code) DO UPDATE SET
        quantity = excluded.quantity,
        updated_at = datetime('now')
    `);

    const updateMany = db.transaction((items) => {
      for (const item of items) {
        stmt.run(randomUUID(), versionId, item.skuCode, item.weekNumber, item.regionCode, item.quantity || 0);
      }
    });

    updateMany(splits);

    res.json({ message: 'Weekly region splits updated successfully', count: splits.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate weekly splits vs month 1 forecast totals
router.get('/validate', (req, res) => {
  try {
    const { versionId } = req.query;
    if (!versionId) return res.status(400).json({ error: 'versionId parameter is required' });

    const version = db.prepare(`
      SELECT fv.*, fc.base_month
      FROM forecast_versions fv
      JOIN forecast_cycles fc ON fc.id = fv.cycle_id
      WHERE fv.id = ?
    `).get(versionId);

    if (!version) return res.status(404).json({ error: 'Version not found' });

    // Compare monthly forecast quantity for base_month vs SUM(weekly_region_splits) for that version
    const mismatches = db.prepare(`
      SELECT 
        mfl.sku_code,
        p.name as product_name,
        mfl.quantity as month_qty,
        COALESCE(SUM(wrs.quantity), 0) as week_sum,
        (COALESCE(SUM(wrs.quantity), 0) - mfl.quantity) as variance
      FROM monthly_forecast_lines mfl
      JOIN products p ON p.sku_code = mfl.sku_code
      LEFT JOIN weekly_region_splits wrs ON wrs.version_id = mfl.version_id AND wrs.sku_code = mfl.sku_code
      WHERE mfl.version_id = ? AND mfl.forecast_month = ?
      GROUP BY mfl.sku_code, p.name, mfl.quantity
      HAVING mfl.quantity != COALESCE(SUM(wrs.quantity), 0)
    `).all(versionId, version.base_month);

    res.json({
      isValid: mismatches.length === 0,
      mismatchesCount: mismatches.length,
      mismatches
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
