const { db, initDb } = require('./init');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

function seedDatabase() {
  initDb();

  console.log('Seeding Master Data...');

  // 1. Business Units
  const insertBU = db.prepare(`INSERT OR IGNORE INTO business_units (code, name) VALUES (?, ?)`);
  const bus = [
    ['GT2', 'Kênh GT2 (General Trade 2)'],
    ['XK', 'Kênh Xuất khẩu (Export)'],
    ['OEM', 'Kênh OEM'],
    ['Online', 'Kênh Online (3T + NSKX)'],
    ['MT', 'Kênh Modern Trade'],
    ['MLT', 'Kênh MLT'],
    ['Retail', 'Kênh Bán lẻ'],
    ['GT1', 'Kênh GT1']
  ];
  bus.forEach(([code, name]) => insertBU.run(code, name));

  // 2. Regions
  const insertRegion = db.prepare(`INSERT OR IGNORE INTO regions (code, name) VALUES (?, ?)`);
  const regions = [
    ['MB', 'Miền Bắc'],
    ['MN', 'Miền Nam']
  ];
  regions.forEach(([code, name]) => insertRegion.run(code, name));

  // 3. Product Groups
  const insertPG = db.prepare(`INSERT OR IGNORE INTO product_groups (code, name) VALUES (?, ?)`);
  const groups = [
    ['NHOM_1', 'Máy TCM sx'],
    ['NHOM_2', 'Máy nhập khẩu'],
    ['NHOM_3', 'Mockup'],
    ['NHOM_4', 'Lõi'],
    ['NHOM_5', 'Màng'],
    ['NHOM_KHAC', 'Linh kiện / Khác']
  ];
  groups.forEach(([code, name]) => insertPG.run(code, name));

  // 4. Default Users
  const insertUser = db.prepare(`INSERT OR IGNORE INTO users (id, full_name, email, role, business_unit_code) VALUES (?, ?, ?, ?, ?)`);
  const users = [
    ['u-admin-1', 'Admin Hệ Thống (Central Admin)', 'admin@karofi.com', 'central_admin', null],
    ['u-gt2-ed', 'Nguyễn Văn Editor (GT2)', 'editor.gt2@karofi.com', 'bu_editor', 'GT2'],
    ['u-gt2-ap', 'Trần Thị Approver (GT2)', 'approver.gt2@karofi.com', 'bu_approver', 'GT2'],
    ['u-xk-ed', 'Lê Văn Export (XK)', 'editor.xk@karofi.com', 'bu_editor', 'XK'],
    ['u-oem-ed', 'Pham OEM Editor', 'editor.oem@karofi.com', 'bu_editor', 'OEM'],
    ['u-online-ed', 'Hoàng Online Editor', 'editor.online@karofi.com', 'bu_editor', 'Online'],
    ['u-viewer-1', 'Người xem Báo cáo', 'viewer@karofi.com', 'viewer', null]
  ];
  users.forEach(u => insertUser.run(...u));

  // 5. Parse Excel file for SKUs and sample forecast data
  const excelPath = path.join(__dirname, '../../XK_OEM_GT2_Online_Sales FC_2026_BACKUP_20260727.xlsx');
  if (fs.existsSync(excelPath)) {
    console.log('Reading sample Excel file:', excelPath);
    const workbook = xlsx.readFile(excelPath);

    const insertPartner = db.prepare(`INSERT OR IGNORE INTO partners (name) VALUES (?)`);
    const getPartner = db.prepare(`SELECT id FROM partners WHERE name = ?`);
    const insertProduct = db.prepare(`
      INSERT OR REPLACE INTO products (sku_code, name, short_name, product_group_code, technology, default_channel, partner_id, avg_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Parse B0 sheets to extract SKUs
    const b0Sheets = [
      { name: 'B0.5.GT2', bu: 'GT2' },
      { name: 'B0.3.XK', bu: 'XK' },
      { name: 'B0.4.OEM', bu: 'OEM' },
      { name: 'B0.8.Online', bu: 'Online' }
    ];

    const importProductsFromExcel = db.transaction(() => {
      b0Sheets.forEach(({ name: sheetName, bu }) => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return;
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        // Find header row (starts with 'Mã sản phẩm')
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(25, data.length); i++) {
          if (data[i] && String(data[i][0]).trim().startsWith('Mã sản phẩm')) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex !== -1) {
          for (let r = headerRowIndex + 1; r < data.length; r++) {
            const row = data[r];
            if (!row || !row[0]) continue;

            const skuCode = String(row[0]).trim();
            if (skuCode.length < 5 || skuCode.includes('Mã')) continue;

            const name = row[1] ? String(row[1]).trim() : skuCode;
            const shortName = row[2] ? String(row[2]).trim() : null;
            const groupStr = row[3] ? String(row[3]).trim() : '';
            const tech = row[4] ? String(row[4]).trim() : null;
            const channel = row[5] ? String(row[5]).trim() : bu;
            const partnerStr = row[6] ? String(row[6]).trim() : null;
            const price = typeof row[7] === 'number' ? row[7] : null;

            let groupCode = 'NHOM_1';
            if (groupStr.includes('nhập khẩu')) groupCode = 'NHOM_2';
            else if (groupStr.includes('Mockup')) groupCode = 'NHOM_3';
            else if (groupStr.includes('Lõi')) groupCode = 'NHOM_4';
            else if (groupStr.includes('Màng')) groupCode = 'NHOM_5';

            let partnerId = null;
            if (partnerStr && partnerStr !== '0' && partnerStr !== 'None') {
              insertPartner.run(partnerStr);
              const p = getPartner.get(partnerStr);
              if (p) partnerId = p.id;
            }

            insertProduct.run(skuCode, name, shortName, groupCode, tech, channel, partnerId, price);
          }
        }
      });
    });
    importProductsFromExcel();

    console.log('Products imported from Excel.');

    // 6. Seed Sample Cycle & Forecast Versions for GT2 & Online (Jul 2026)
    const baseMonth = '2026-07-01';

    ['GT2', 'Online', 'XK', 'OEM'].forEach(buCode => {
      const cycleId = `c-${buCode.toLowerCase()}-202607`;
      db.prepare(`
        INSERT OR IGNORE INTO forecast_cycles (id, business_unit_code, base_month, horizon_months, status, created_by)
        VALUES (?, ?, ?, 4, 'submitted', 'u-${buCode.toLowerCase()}-ed')
      `).run(cycleId, buCode, baseMonth);

      // Create Version 0 (W0) & Version 1 (W1)
      const v0Id = `v-${buCode.toLowerCase()}-w0`;
      const v1Id = `v-${buCode.toLowerCase()}-w1`;

      db.prepare(`
        INSERT OR IGNORE INTO forecast_versions (id, cycle_id, update_week, update_date, iso_week_label, submitted_by, submitted_at, is_final)
        VALUES (?, ?, 0, '2026-07-01', 'W27', 'u-${buCode.toLowerCase()}-ed', datetime('now'), 0)
      `).run(v0Id, cycleId);

      db.prepare(`
        INSERT OR IGNORE INTO forecast_versions (id, cycle_id, update_week, update_date, iso_week_label, submitted_by, submitted_at, is_final)
        VALUES (?, ?, 1, '2026-07-08', 'W28', 'u-${buCode.toLowerCase()}-ed', datetime('now'), 1)
      `).run(v1Id, cycleId);

      // Populate Monthly Lines & Weekly Splits from Excel for products of this BU
      const products = db.prepare(`SELECT sku_code FROM products WHERE default_channel = ? OR default_channel IS NULL`).all(buCode);
      
      const insertMonthly = db.prepare(`
        INSERT OR IGNORE INTO monthly_forecast_lines (id, version_id, sku_code, forecast_month, quantity)
        VALUES (?, ?, ?, ?, ?)
      `);
      const insertWeekly = db.prepare(`
        INSERT OR IGNORE INTO weekly_region_splits (id, version_id, sku_code, week_number, region_code, quantity)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const months = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
      const seedLines = db.transaction(() => {
        products.forEach((p, idx) => {
          // Mock quantities for initial demo
          const baseQty = (idx + 1) * 100;
          months.forEach((m, mIdx) => {
            const qty = baseQty + mIdx * 50;
            insertMonthly.run(randomUUID(), v0Id, p.sku_code, m, qty);
            insertMonthly.run(randomUUID(), v1Id, p.sku_code, m, qty + 20);
          });

          // Weekly splits for Month 1 (baseQty + 20) split into W1..W4, MB/MN
          const month1Qty = baseQty + 20;
          const perWeekRegion = Math.round(month1Qty / 8); // 4 weeks x 2 regions = 8
          for (let w = 1; w <= 4; w++) {
            insertWeekly.run(randomUUID(), v1Id, p.sku_code, w, 'MB', perWeekRegion);
            insertWeekly.run(randomUUID(), v1Id, p.sku_code, w, 'MN', perWeekRegion);
          }
        });
      });
      seedLines();
    });

    console.log('Seed forecast cycles and lines created.');
  }

  console.log('Seeding completed successfully!');
}

seedDatabase();
