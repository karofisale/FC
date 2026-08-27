import seedProducts from './seedProducts.json';

export const initialBUs = [
  { code: 'GT2', name: 'Kênh GT2 (General Trade 2)', is_active: 1 },
  { code: 'XK', name: 'Kênh Xuất khẩu (Export)', is_active: 1 },
  { code: 'OEM', name: 'Kênh OEM', is_active: 1 },
  { code: 'Online', name: 'Kênh Online (3T + NSKX)', is_active: 1 },
  { code: 'MT', name: 'Kênh Modern Trade', is_active: 1 },
  { code: 'MLT', name: 'Kênh MLT', is_active: 1 },
  { code: 'Retail', name: 'Kênh Bán lẻ', is_active: 1 },
  { code: 'GT1', name: 'Kênh GT1', is_active: 1 }
];

export const initialRegions = [
  { code: 'MB', name: 'Miền Bắc', is_active: 1 },
  { code: 'MN', name: 'Miền Nam', is_active: 1 }
];

export const initialGroups = [
  { code: 'NHOM_1', name: 'Máy TCM sx' },
  { code: 'NHOM_2', name: 'Máy nhập khẩu' },
  { code: 'NHOM_3', name: 'Mockup' },
  { code: 'NHOM_4', name: 'Lõi' },
  { code: 'NHOM_5', name: 'Màng' }
];

export const initialUsers = [
  { id: 'u-admin-1', full_name: 'Admin Hệ Thống (Central Admin)', email: 'admin@karofi.com', role: 'central_admin', business_unit_code: null },
  { id: 'u-gt2-ed', full_name: 'Nguyễn Văn Editor (GT2)', email: 'editor.gt2@karofi.com', role: 'bu_editor', business_unit_code: 'GT2' },
  { id: 'u-gt2-ap', full_name: 'Trần Thị Approver (GT2)', email: 'approver.gt2@karofi.com', role: 'bu_approver', business_unit_code: 'GT2' },
  { id: 'u-xk-ed', full_name: 'Lê Văn Export (XK)', email: 'editor.xk@karofi.com', role: 'bu_editor', business_unit_code: 'XK' },
  { id: 'u-oem-ed', full_name: 'Phạm OEM Editor', email: 'editor.oem@karofi.com', role: 'bu_editor', business_unit_code: 'OEM' },
  { id: 'u-online-ed', full_name: 'Hoàng Online Editor', email: 'editor.online@karofi.com', role: 'bu_editor', business_unit_code: 'Online' },
  { id: 'u-viewer-1', full_name: 'Người xem Báo cáo', email: 'viewer@karofi.com', role: 'viewer', business_unit_code: null }
];

export const initialProducts = seedProducts;

// Generate initial mock forecast data for demo fallback
export function generateInitialMockForecast() {
  const months = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
  const bus = ['GT2', 'Online', 'XK', 'OEM'];
  
  const cycles = [];
  const versions = [];
  const monthlyLines = [];
  const weeklySplits = [];
  const approvals = [];

  bus.forEach((bu, buIdx) => {
    const cycleId = `c-${bu.toLowerCase()}-202607`;
    const v0Id = `v-${bu.toLowerCase()}-w0`;
    const v1Id = `v-${bu.toLowerCase()}-w1`;

    cycles.push({
      id: cycleId,
      business_unit_code: bu,
      business_unit_name: bu,
      base_month: '2026-07-01',
      horizon_months: 4,
      status: 'submitted',
      created_by: `u-${bu.toLowerCase()}-ed`
    });

    versions.push(
      { id: v0Id, cycle_id: cycleId, update_week: 0, update_date: '2026-07-01', iso_week_label: 'Tuần 0 (W27)', submitted_by: `u-${bu.toLowerCase()}-ed`, is_final: 0 },
      { id: v1Id, cycle_id: cycleId, update_week: 1, update_date: '2026-07-08', iso_week_label: 'Tuần 1 (W28)', submitted_by: `u-${bu.toLowerCase()}-ed`, is_final: 1 }
    );

    approvals.push({
      id: `app-${bu.toLowerCase()}-1`,
      cycle_id: cycleId,
      version_id: v1Id,
      business_unit_code: bu,
      business_unit_name: bu,
      base_month: '2026-07-01',
      update_week: 1,
      status: 'pending',
      requested_at: new Date().toISOString()
    });

    // Pick top 25 SKUs per BU
    const buProds = seedProducts.filter(p => p.default_channel === bu || !p.default_channel).slice(0, 25);
    buProds.forEach((p, pIdx) => {
      const baseQty = (pIdx + 1) * 100;
      months.forEach((m, mIdx) => {
        const qty = baseQty + mIdx * 50;
        monthlyLines.push({
          version_id: v1Id,
          sku_code: p.sku_code,
          forecast_month: m,
          quantity: qty + 20,
          product_name: p.name,
          product_group_code: p.product_group_code,
          product_group_name: p.product_group_name,
          default_channel: bu,
          avg_price: p.avg_price || 0
        });
      });

      // Weekly splits for Month 1 (qty + 20 split to 8 parts for W1..W4, MB/MN)
      const month1Qty = baseQty + 20;
      const perWeekRegion = Math.round(month1Qty / 8);
      for (let w = 1; w <= 4; w++) {
        weeklySplits.push(
          { version_id: v1Id, sku_code: p.sku_code, week_number: w, region_code: 'MB', quantity: perWeekRegion, product_name: p.name, product_group_code: p.product_group_code },
          { version_id: v1Id, sku_code: p.sku_code, week_number: w, region_code: 'MN', quantity: perWeekRegion, product_name: p.name, product_group_code: p.product_group_code }
        );
      }
    });
  });

  return { cycles, versions, monthlyLines, weeklySplits, approvals };
}
