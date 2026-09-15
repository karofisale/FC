#!/usr/bin/env node
/**
 * Doc file ZSD450 vua xuat va day len FC App — buoc cuoi cua nut "Cao tu SAP".
 *
 *   node tools/sap-push.mjs --bu 3T --month 2026-09 --file "D:/...xlsx" --config "D:/...config.json"
 *
 * KHAC voi tools/sap-actuals.mjs: ban kia HOI PIN, danh cho nguoi chay tay o
 * dong lenh. Ban nay chay tu dieu-phoi.ps1, khong co ai ngoi truoc may, nen
 * xac thuc bang SECRET trong config.json.
 *
 * DUNG CHINH parseZsd450 cua app — khong viet bo doc thu hai. App OEM co hai
 * ban doc ZSD450 (zsd450.js va push_to_sheet.py) va phai nuoi mot bai test
 * doc thang ma nguon Python de canh chung khong lech nhau. O day chi can mot
 * ban, vi buoc day cung chay bang Node.
 *
 * In ra MOT dong JSON tren stdout, cung khuon voi dt-fc/export_zsd450.py:
 *   {"ok": true, "written": 45, "quantity": 36550, ...}
 *   {"ok": false, "error": "..."}
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseZsd450 } from '../client/src/utils/zsd450.js';

const XLSX = createRequire(new URL('../client/package.json', import.meta.url))('xlsx');

const argv = process.argv.slice(2);
const lay = (ten, mac = '') => {
  const i = argv.indexOf(ten);
  return i > -1 && argv[i + 1] ? argv[i + 1] : mac;
};

function xong(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exit(obj.ok ? 0 : 1);
}

const BU = lay('--bu');
const THANG = lay('--month');
const FILE = lay('--file');
const CONFIG = lay('--config');

if (!BU || !/^\d{4}-\d{2}$/.test(THANG) || !FILE || !CONFIG) {
  xong({ ok: false, error: 'Thieu tham so: --bu --month YYYY-MM --file --config' });
}
if (!existsSync(FILE)) xong({ ok: false, error: `Khong thay file: ${FILE}` });
if (!existsSync(CONFIG)) xong({ ok: false, error: `Khong thay config: ${CONFIG}` });

let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
} catch (e) {
  xong({ ok: false, error: `config.json khong phai JSON hop le: ${e.message}` });
}
if (!cfg.webapp_url || !cfg.secret) {
  xong({ ok: false, error: 'config.json thieu webapp_url hoac secret' });
}

const THANG_DAY = `${THANG}-01`;

async function goi(action, payload) {
  const res = await fetch(cfg.webapp_url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
    redirect: 'follow'
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Backend khong tra ve JSON (HTTP ${res.status}): `
      + text.slice(0, 80).replace(/\s+/g, ' '));
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

try {
  // Bo loc cua don vi lay tu chinh danh muc tren app — khong chep bang vao day.
  const dsLoc = await goi('sapFilters', { secret: cfg.secret });
  const donVi = (dsLoc.units || []).find((u) => u.code === BU);
  if (!donVi) {
    xong({ ok: false, error: `Don vi ${BU} chua khai sap_vkorg/sap_vtweg tren sheet BusinessUnits.` });
  }

  // DOC Y HET parseExcelFile cua app: cellDates, raw, defval
  const wb = XLSX.read(readFileSync(FILE), { type: 'buffer', cellDates: true });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1, raw: true, defval: ''
  });

  const ket = parseZsd450(aoa, { soldTo: donVi.soldTo, month: THANG_DAY });
  if (ket.missingColumns.length) {
    xong({ ok: false, error: `File khong phai bao cao ZSD450 — thieu cot: ${ket.missingColumns.join(', ')}` });
  }

  // Ba cho tu choi thay vi doan. Moi cho neu de chay tiep deu cho ra mot bang
  // trong hoan toan binh thuong, va sai do chi lo ra khi doi chieu cuoi ky.
  if (!ket.monthsSeen.includes(THANG_DAY)) {
    xong({ ok: false, error: `File khong co dong nao cua thang ${THANG}. `
      + `Thang co trong file: ${ket.monthsSeen.join(', ') || '(khong doc duoc)'}.` });
  }
  if (!ket.rowsMatched) {
    const ds = ket.soldToSeen.slice(0, 6).map((s) => s.code).join(', ');
    xong({ ok: false, error: `Khong co dong nao cua ma khach ${donVi.soldTo}. `
      + (ds ? `Ma khach co trong file: ${ds}. ` : '') + 'Co the xuat nham bo loc.' });
  }

  const rows = Object.keys(ket.bySku).map((sku) => ({ skuCode: sku, quantity: ket.bySku[sku] }));
  const kq = await goi('sapImportActuals', { secret: cfg.secret, bu: BU, month: THANG_DAY, rows });

  xong({
    ok: true,
    bu: BU,
    month: THANG,
    file: FILE,
    rowsRead: ket.rowsRead,
    rowsMatched: ket.rowsMatched,
    written: kq.total,
    inserted: kq.inserted,
    updated: kq.updated,
    quantity: kq.quantity,
    regionCode: kq.regionCode,
    unknownSkus: kq.unknownSkus || []
  });
} catch (e) {
  xong({ ok: false, error: e.message });
}
