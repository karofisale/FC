const express = require('express');
const router = express.Router();
const { db } = require('../db/init');
const { randomUUID } = require('crypto');

// Get monthly lines for a version
router.get('/', (req, res) => {
  try {
    const { versionId } = req.query;
    if (!versionId) return res.status(400).json({ error: 'versionId parameter is required' });

    const lines = db.prepare(`
      SELECT mfl.*, p.name as product_name, p.short_name, p.product_group_code, p.default_channel, p.avg_price
      FROM monthly_forecast_lines mfl
      JOIN products p ON p.sku_code = mfl.sku_code
      WHERE mfl.version_id = ?
      ORDER BY p.product_group_code, p.sku_code, mfl.forecast_month
    `).all(versionId);

    res.json(lines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk update or insert monthly forecast lines
router.post('/bulk', (req, res) => {
  try {
    const { versionId, lines } = req.body; // lines: Array<{ skuCode, forecastMonth, quantity, note }>
    if (!versionId || !Array.isArray(lines)) {
      return res.status(400).json({ error: 'versionId and lines array are required' });
    }

    const version = db.prepare(`SELECT fv.*, fc.status FROM forecast_versions fv JOIN forecast_cycles fc ON fc.id = fv.cycle_id WHERE fv.id = ?`).get(versionId);
    if (!version) return res.status(404).json({ error: 'Version not found' });
    if (version.status === 'approved' || version.status === 'locked') {
      return res.status(400).json({ error: 'Forecast cycle is approved/locked and cannot be edited.' });
    }

    const stmt = db.prepare(`
      INSERT INTO monthly_forecast_lines (id, version_id, sku_code, forecast_month, quantity, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(version_id, sku_code, forecast_month) DO UPDATE SET
        quantity = excluded.quantity,
        note = excluded.note,
        updated_at = datetime('now')
    `);

    const updateMany = db.transaction((items) => {
      for (const item of items) {
        stmt.run(randomUUID(), versionId, item.skuCode, item.forecastMonth, item.quantity || 0, item.note || null);
      }
    });

    updateMany(lines);

    res.json({ message: 'Monthly forecast lines updated successfully', count: lines.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
