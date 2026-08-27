const express = require('express');
const router = express.Router();
const { db } = require('../db/init');

router.get('/bus', (req, res) => {
  try {
    const bus = db.prepare(`SELECT * FROM business_units WHERE is_active = 1`).all();
    res.json(bus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/regions', (req, res) => {
  try {
    const regions = db.prepare(`SELECT * FROM regions WHERE is_active = 1`).all();
    res.json(regions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/groups', (req, res) => {
  try {
    const groups = db.prepare(`SELECT * FROM product_groups`).all();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products', (req, res) => {
  try {
    const { bu, group, search } = req.query;
    let query = `
      SELECT p.*, pg.name as product_group_name, bu.name as channel_name, pt.name as partner_name
      FROM products p
      LEFT JOIN product_groups pg ON pg.code = p.product_group_code
      LEFT JOIN business_units bu ON bu.code = p.default_channel
      LEFT JOIN partners pt ON pt.id = p.partner_id
      WHERE p.is_active = 1
    `;
    const params = [];

    if (bu) {
      query += ` AND (p.default_channel = ? OR p.default_channel IS NULL)`;
      params.push(bu);
    }
    if (group) {
      query += ` AND p.product_group_code = ?`;
      params.push(group);
    }
    if (search) {
      query += ` AND (p.sku_code LIKE ? OR p.name LIKE ? OR p.short_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY p.product_group_code, p.sku_code`;
    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`SELECT * FROM users WHERE is_active = 1`).all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
