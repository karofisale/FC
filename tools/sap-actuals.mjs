#!/usr/bin/env node
/**
 * Dua san luong thuc hien tu SAP len FC App — nguoi dung khong cham vao file.
 *
 *   node tools/sap-actuals.mjs --bu 3T --month 2026-09 --sap
 *   node tools/sap-actuals.mjs --bu 3T --month 2026-09 --sap --dry
 *   node tools/sap-actuals.mjs --bu XK --month 2026-09 --file "D:/.../ZSD450.xlsx"
 *
 * VI SAO PHAI CHAY TREN MAY NAY, khong phai trong app:
 * backend la Apps Script va client la trang tinh tren GitHub Pages — ca hai
 * deu nam ngoai mang cong ty, khong co duong nao cham toi SAP on-premise.
 * SAP GUI Scripting lai la COM cua Windows, chi goi duoc tu chinh may dang
 * mo SAP. Nen "lay thang tu SAP" = mot cong cu chay o day: lai SAP GUI xuat
 * ra file tam, doc, roi day so len app. File van sinh ra, nhung nguoi dung
 * khong phai mo, khong phai chon, khong phai nho no nam o dau.
 *
 * BA BUOC:
 *   1. Chay SAP GUI script (neu co) de xuat ZSD450 dung bo loc cua don vi.
 *   2. Doc file bang CHINH parseZsd450 ma app dung — khong viet bo doc thu hai.
 *   3. Dang nhap bang ma nguoi dung + PIN roi goi saveActuals.
 *
 * PIN khong bao gio duoc luu o dau: hoi moi lan chay, go khong hien tren man
 * hinh, va khong ghi vao bat ky file nao. Kho FC la kho CONG KHAI.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseZsd450, MOI_KHACH } from '../client/src/utils/zsd450.js';

const XLSX = createRequire(new URL('../client/package.json', import.meta.url))('xlsx');

const GAS_URL = process.env.FC_GAS_URL
  || 'https://script.google.com/macros/s/AKfycbyyzw_uTdteqLobl6TB1DvcBxqE4BiorHFksXLx4Zc5jItQJD943vjXSynAecurccmS/exec';

/** Noi SAP GUI ghi file xuat ra. Doi bang --thu-muc hoac FC_SAP_DIR. */
const EXPORT_DIR = process.env.FC_SAP_DIR
  || 'D:/Operation/Claude/CLAUDE-OUTPUTS/DT-FC';

/**
 * Script lai SAP GUI. Dung chung khuon voi dt-oem va dt-xk da chay that
 * nhieu thang; ban cua FC nhan them --kunnr vi 7/9 don vi chi tach duoc
 * bang Sold-to party.
 */
const SAP_SCRIPT = process.env.FC_SAP_SCRIPT
  || 'D:/Operation/Claude/Scripts/dt-fc/export_zsd450.py';

// ---------------------------------------------------------------------
// Tham so dong lenh
// ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const co = (ten) => argv.includes(ten);
const lay = (ten, mac) => {
  const i = argv.indexOf(ten);
  return i > -1 && argv[i + 1] ? argv[i + 1] : mac;
};

const BU = lay('--bu', '');
const THANG = lay('--month', '');          // YYYY-MM
const FILE = lay('--file', '');
const THU_MUC = lay('--thu-muc', EXPORT_DIR);
const VBS = lay('--vbs', '');
const SAP = co('--sap');
const DRY = co('--dry');

function thoat(msg) {
  console.error('\n' + msg + '\n');
  process.exit(1);
}

if (!BU || !/^\d{4}-\d{2}$/.test(THANG)) {
  thoat([
    'Cach dung:',
    '  node tools/sap-actuals.mjs --bu <ma don vi> --month YYYY-MM [tuy chon]',
    '',
    'Tuy chon:',
    '  --sap                lai SAP GUI xuat file truoc (can SAP da dang nhap)',
    '  --file <duong dan>   dung san file nay, khong tim trong thu muc',
    '  --thu-muc <duong dan> noi tim file ZSD450 moi nhat (mac dinh: ' + EXPORT_DIR + ')',
    '  --vbs <duong dan>    chay mot script .vbs tu soan thay cho --sap',
    '  --dry                doc va in ra, KHONG ghi len app'
  ].join('\n'));
}

const THANG_DAY = `${THANG}-01`;

// ---------------------------------------------------------------------
// Goi backend
// ---------------------------------------------------------------------
async function goi(action, payload) {
  const res = await fetch(GAS_URL, {
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
    // GAS tra trang HTML khi container dang khoi dong nguoi hoac URL sai —
    // in ra dau van ban that de biet minh dang goi nham cai gi.
    thoat(`Backend khong tra ve JSON (HTTP ${res.status}). 60 ky tu dau:\n  `
      + text.slice(0, 60).replace(/\s+/g, ' '));
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

/** Doc mot dong khong hien ky tu (cho PIN). */
function hoiKin(cauHoi) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (ch) => {
      const s = String(ch);
      if (s === '\n' || s === '\r' || s === '\u0004') process.stdin.removeListener('data', onData);
      else process.stdout.write('*');
    };
    process.stdout.write(cauHoi);
    process.stdin.on('data', onData);
    rl.question('', (v) => {
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      rl.close();
      resolve(v.trim());
    });
  });
}

function hoi(cauHoi) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(cauHoi, (v) => { rl.close(); resolve(v.trim()); });
  });
}

// ---------------------------------------------------------------------
// Tim file xuat ra
// ---------------------------------------------------------------------
function fileMoiNhat(thuMuc) {
  if (!existsSync(thuMuc)) thoat(`Khong thay thu muc: ${thuMuc}`);
  const ds = readdirSync(thuMuc)
    .filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    .map((f) => ({ f, p: path.join(thuMuc, f), t: statSync(path.join(thuMuc, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!ds.length) thoat(`Thu muc khong co file Excel nao: ${thuMuc}`);
  return ds[0];
}

// ---------------------------------------------------------------------
// Chay
// ---------------------------------------------------------------------
console.log(`\nSan luong thuc hien tu SAP  ·  don vi ${BU}  ·  thang ${THANG}\n`);

// --- 1. Dang nhap (truoc tien: bo loc SAP nam tren chinh danh muc cua app) ---
const userId = process.env.FC_USER || await hoi('1. Ma nguoi dung: ');
const pin = await hoiKin('   PIN (khong hien): ');
if (!userId || !pin) thoat('Thieu ma nguoi dung hoac PIN.');

const phien = await goi('login', { userId, pin });
const token = phien.token;
console.log(`   ${phien.user.full_name} (${phien.user.role})`);

// --- 2. Lay bo loc cua don vi ---
const ws = await goi('getActualsWorkspace', { token, bu: BU, month: THANG_DAY });
const soldTo = String(ws.sapSoldTo || '').trim();
if (!soldTo) {
  thoat(`Don vi ${BU} chua khai cot sap_sold_to trong sheet BusinessUnits.\n`
    + 'Dien ma khach (hoac dau * neu don vi nay khong loc theo khach) roi chay lai.');
}
const vkorg = String(ws.sapVkorg || '').trim();
const vtweg = String(ws.sapVtweg || '').trim();
const boLoc = [vkorg && `VKORG ${vkorg}`, vtweg && `VTWEG ${vtweg}`,
  soldTo === MOI_KHACH ? 'moi khach' : `khach ${soldTo}`].filter(Boolean).join(' · ');
console.log(`\n2. Bo loc cua ${BU}: ${boLoc}`);

const mien = (ws.regions || []).find((r) => String(r.scope || '').toLowerCase() === 'actual');
if (!mien) thoat('Chua co mien danh cho san luong thuc hien. Chay setupDatabase() de them mien TQ.');

// --- 3. Lai SAP GUI ---
let fileSap = '';
if (SAP) {
  if (!vkorg || !vtweg) {
    thoat(`Don vi ${BU} chua khai sap_vkorg / sap_vtweg nen khong dung duoc bo loc ZSD450.\n`
      + 'Chay setupDatabase() hoac dien tay tren sheet BusinessUnits.');
  }
  console.log(`\n3. Chay SAP GUI: ${path.basename(SAP_SCRIPT)}`);
  if (!existsSync(SAP_SCRIPT)) thoat(`Khong thay script: ${SAP_SCRIPT}`);
  const args = [SAP_SCRIPT, '--month', THANG, '--vkorg', vkorg, '--vtweg', vtweg,
    '--ten', BU, '--outdir', THU_MUC];
  // '*' la quy uoc CUA APP ("khong loc khach"), khong phai gia tri SAP hieu.
  // Gui thang xuong se thanh mot ma khach ten '*' va SAP tra ve rong.
  if (soldTo && soldTo !== MOI_KHACH) args.push('--kunnr', soldTo);

  // PYTHONIOENCODING: stdout cua Python tren Windows mac dinh la cp1252 nen
  // moi thong bao tieng Viet — ke ca JSON bao loi — deu nem UnicodeEncodeError.
  const r = spawnSync('python', args, {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });
  const raw = (r.stdout || '').trim();
  let kq;
  try { kq = JSON.parse(raw.split('\n').pop()); } catch { kq = null; }
  if (!kq || kq.ok !== true) {
    thoat('Xuat SAP that bai.\n' + ((kq && kq.error) || raw || (r.stderr || '').trim()
      || 'python khong in ra gi — da cai pywin32 chua? (pip install pywin32)'));
  }
  if (kq.no_data) {
    thoat(`SAP khong tra ve dong nao cho ${BU} thang ${THANG}.\nSAP noi: ${kq.message}`);
  }
  fileSap = kq.file;
  console.log(`   xong: ${path.basename(fileSap)}`);
} else if (VBS) {
  if (!existsSync(VBS)) thoat(`Khong thay script SAP GUI: ${VBS}`);
  console.log(`\n3. Chay script tu soan: ${path.basename(VBS)}`);
  const r = spawnSync('cscript', ['//nologo', VBS], { encoding: 'utf8' });
  if (r.status !== 0) {
    thoat(`Script that bai (ma ${r.status}).\n${(r.stderr || r.stdout || '').trim()}`);
  }
} else {
  console.log('\n3. Khong lai SAP (thieu --sap) — doc file co san');
}

// --- 4. Doc file ---
let nguon;
if (fileSap) {
  nguon = { f: path.basename(fileSap), p: fileSap, t: statSync(fileSap).mtimeMs };
} else if (FILE) {
  if (!existsSync(FILE)) thoat(`Khong thay file: ${FILE}`);
  nguon = { f: path.basename(FILE), p: FILE, t: statSync(FILE).mtimeMs };
} else {
  nguon = fileMoiNhat(THU_MUC);
}
const tuoiPhut = Math.round((Date.now() - nguon.t) / 60000);
console.log(`\n4. Doc file: ${nguon.f}`);
console.log(`   sua lan cuoi: ${new Date(nguon.t).toLocaleString('vi-VN')} (${tuoiPhut} phut truoc)`);
if (!fileSap && !FILE && tuoiPhut > 60) {
  console.log('   !! File nay cu hon 1 tieng — coi chung dang doc lai file cua ky truoc.');
}

// DOC Y HET parseExcelFile cua app: cellDates, raw, defval
const wb = XLSX.read(readFileSync(nguon.p), { type: 'buffer', cellDates: true });
const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1, raw: true, defval: ''
});

// --- 5. Gom so ---
const ket = parseZsd450(aoa, { soldTo, month: THANG_DAY });
if (ket.missingColumns.length) {
  thoat(`File khong phai bao cao ZSD450 — thieu cot: ${ket.missingColumns.join(', ')}`);
}

const biet = new Set((ws.products || []).map((p) => String(p.sku_code).trim()));
const maLa = Object.keys(ket.bySku).filter((s) => !biet.has(String(s).trim()));
const rows = Object.keys(ket.bySku)
  .filter((s) => biet.has(String(s).trim()))
  .map((sku) => ({
    businessUnitCode: BU,
    skuCode: sku,
    regionCode: mien.code,
    actualMonth: THANG_DAY,
    quantity: ket.bySku[sku],
    sourceSystem: 'ZSD450'
  }));
const tong = rows.reduce((s, r) => s + r.quantity, 0);

console.log(`\n5. Ket qua doc`);
console.log(`   ${ket.rowsMatched} / ${ket.rowsRead} dong cua file khop bo loc`);
console.log(`   ${Object.keys(ket.bySku).length} ma hang · ghi duoc ${rows.length} ma · tong ${tong.toLocaleString('vi-VN')}`);
console.log(`   thang co trong file: ${ket.monthsSeen.join(', ') || '(khong doc duoc)'}`);
if (ket.channelsSeen.length) console.log(`   kenh ban hang trong file: ${ket.channelsSeen.join(', ')}`);

// Ba cho tu choi thay vi doan — moi cho neu de chay tiep deu cho ra mot
// bang trong hoan toan binh thuong.
if (!ket.monthsSeen.includes(THANG_DAY)) {
  thoat(`File khong co dong nao cua thang ${THANG}.\n`
    + `Thang co trong file: ${ket.monthsSeen.join(', ') || '(khong doc duoc)'}.\n`
    + 'Xuat lai dung ky, hoac chay lai voi --month dung.');
}
if (!ket.rowsMatched) {
  const ds = ket.soldToSeen.slice(0, 8).map((s) => `${s.code}${s.name ? ` (${s.name})` : ''}`).join(', ');
  thoat(`Khong co dong nao cua ${soldTo === MOI_KHACH ? 'file nay' : `ma khach ${soldTo}`}.\n`
    + (ds ? `Ma khach co trong file: ${ds}\n` : '')
    + 'Nhieu kha nang file xuat nham bo loc.');
}
if (maLa.length) {
  console.log(`\n   !! ${maLa.length} ma KHONG co trong danh muc FC — se khong duoc ghi:`);
  console.log('      ' + maLa.slice(0, 20).join(', ') + (maLa.length > 20 ? ` … va ${maLa.length - 20} ma nua` : ''));
}
if (!rows.length) thoat('Khong co ma nao ghi duoc (moi ma deu khong co trong danh muc).');

// --- 6. Ghi ---
if (DRY) {
  console.log('\n6. --dry: KHONG ghi gi len app. Nam dong dau cua payload:');
  rows.slice(0, 5).forEach((r) => console.log(`   ${r.skuCode}  ${r.quantity}`));
  process.exit(0);
}

const traLoi = await hoi(`\n6. Ghi ${rows.length} ma vao ${BU} thang ${THANG}, mien ${mien.code}? [y/N] `);
if (traLoi.toLowerCase() !== 'y') {
  console.log('   Da huy, khong ghi gi.');
  process.exit(0);
}

const kq = await goi('saveActuals', { token, rows });
console.log(`   ${kq.message}`);
await goi('logout', { token }).catch(() => {});
console.log('\nXong.\n');
