const express = require('express');
const router = express.Router();
const { db } = require('../db/init');

// Get actual sales results
router.get('/', (req, res) => {
  try {
    const { bu, month, sku } = req.query;
    let query = `
      SELECT a.*, bu.name as business_unit_name, p.name as product_name, p.product_group_code
      FROM actual_sales_results a
      JOIN business_units bu ON bu.code = a.business_unit_code
      JOIN products p ON p.sku_code = a.sku_code
      WHERE 1=1
    `;
    const params = [];
    if (bu) {
      query += ` AND a.business_unit_code = ?`;
      params.push(bu);
    }
    if (month) {
      query += ` AND a.actual_month = ?`;
      params.push(month);
    }
    if (sku) {
      query += ` AND a.sku_code = ?`;
      params.push(sku);
    }

    query += ` ORDER BY a.actual_month DESC, a.business_unit_code, a.sku_code`;
    const results = db.prepare(query).all(...params);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
