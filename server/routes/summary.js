const express = require('express');
const router = express.Router();
const { db } = require('../db/init');

// B0.SUM Report: Aggregated monthly forecast by BU & Product Group
router.get('/b0', (req, res) => {
  try {
    const { baseMonth = '2026-07-01' } = req.query;

    const summary = db.prepare(`
      SELECT 
        fc.business_unit_code,
        bu.name as business_unit_name,
        p.product_group_code,
        pg.name as product_group_name,
        mfl.forecast_month,
        SUM(mfl.quantity) as total_quantity,
        SUM(mfl.quantity * COALESCE(p.avg_price, 0)) as total_revenue
      FROM monthly_forecast_lines mfl
      JOIN forecast_versions fv ON fv.id = mfl.version_id
      JOIN forecast_cycles fc ON fc.id = fv.cycle_id
      JOIN business_units bu ON bu.code = fc.business_unit_code
      JOIN products p ON p.sku_code = mfl.sku_code
      JOIN product_groups pg ON pg.code = p.product_group_code
      WHERE fv.is_final = 1 AND fc.base_month = ?
      GROUP BY fc.business_unit_code, p.product_group_code, mfl.forecast_month
      ORDER BY fc.business_unit_code, p.product_group_code, mfl.forecast_month
    `).all(baseMonth);

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// B1.SUM Report: Aggregated weekly forecast for Month 1
router.get('/b1', (req, res) => {
  try {
    const { baseMonth = '2026-07-01' } = req.query;

    const summary = db.prepare(`
      SELECT 
        fc.business_unit_code,
        bu.name as business_unit_name,
        p.product_group_code,
        pg.name as product_group_name,
        wrs.week_number,
        wrs.region_code,
        SUM(wrs.quantity) as total_quantity
      FROM weekly_region_splits wrs
      JOIN forecast_versions fv ON fv.id = wrs.version_id
      JOIN forecast_cycles fc ON fc.id = fv.cycle_id
      JOIN business_units bu ON bu.code = fc.business_unit_code
      JOIN products p ON p.sku_code = wrs.sku_code
      JOIN product_groups pg ON pg.code = p.product_group_code
      WHERE fv.is_final = 1 AND fc.base_month = ?
      GROUP BY fc.business_unit_code, p.product_group_code, wrs.week_number, wrs.region_code
      ORDER BY fc.business_unit_code, p.product_group_code, wrs.week_number, wrs.region_code
    `).all(baseMonth);

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Weekly Variance Report (compare current final version vs previous update_week)
router.get('/variance', (req, res) => {
  try {
    const { cycleId } = req.query;
    if (!cycleId) return res.status(400).json({ error: 'cycleId is required' });

    const versions = db.prepare(`
      SELECT id, update_week FROM forecast_versions WHERE cycle_id = ? ORDER BY update_week ASC
    `).all(cycleId);

    if (versions.length < 2) {
      return res.json({ message: 'Need at least 2 versions to calculate variance', variance: [] });
    }

    const currVersion = versions[versions.length - 1];
    const prevVersion = versions[versions.length - 2];

    const variance = db.prepare(`
      SELECT 
        curr.sku_code,
        p.name as product_name,
        p.product_group_code,
        curr.forecast_month,
        curr.quantity as current_qty,
        COALESCE(prev.quantity, 0) as previous_qty,
        (curr.quantity - COALESCE(prev.quantity, 0)) as variance_qty
      FROM (
        SELECT sku_code, forecast_month, quantity 
        FROM monthly_forecast_lines 
        WHERE version_id = ?
      ) curr
      JOIN products p ON p.sku_code = curr.sku_code
      LEFT JOIN (
        SELECT sku_code, forecast_month, quantity 
        FROM monthly_forecast_lines 
        WHERE version_id = ?
      ) prev ON prev.sku_code = curr.sku_code AND prev.forecast_month = curr.forecast_month
      ORDER BY p.product_group_code, curr.sku_code, curr.forecast_month
    `).all(currVersion.id, prevVersion.id);

    res.json({
      currentVersion: currVersion,
      previousVersion: prevVersion,
      variance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
