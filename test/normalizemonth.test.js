/**
 * normalizemonth.test.js — normalizeMonth_ phải đọc được SỐ SERIAL của Sheets.
 *
 * Vì sao đáng có test: prefetchSheets_ đọc bằng Sheets API với
 * dateTimeRenderOption SERIAL_NUMBER, nên ô ngày về dưới dạng số ngày kể từ
 * 1899-12-30. Không đọc được số đó là mọi phép so tháng trượt hết — mà trượt
 * im lặng, chỉ hiện ra dưới dạng "bảng không có dữ liệu".
 *
 * Nhóm ca cuối chốt chiều ngược lại: một số THƯỜNG (4, 12, 2026) không được
 * hiểu nhầm thành ngày. Trước đây `normalizeMonth_(4)` cho '2001-04-01' vì JS
 * đọc chuỗi "4" theo luật riêng của nó.
 *
 *   node test/normalizemonth.test.js gas/Utils.gs
 */

const fs = require('fs'), vm = require('vm');
const sandbox = {
  Utilities: { formatDate: (d, tz, f) => {
    const p = x => String(x).padStart(2,'0');
    // gia lap Asia/Ho_Chi_Minh = UTC+7
    const t = new Date(d.getTime() + 7*3600*1000);
    return t.getUTCFullYear() + '-' + p(t.getUTCMonth()+1);
  }},
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  Logger: { log(){} }, console, Date, JSON, Math, String, Number, Object, Array, Error, isFinite, parseFloat, RegExp
};
sandbox.globalThis = sandbox;
const c = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), c, { filename: 'Utils.gs' });
const nm = sandbox.normalizeMonth_;

let pass=0, fail=0;
const check = (t, dk, them) => { dk ? (pass++, console.log('  OK   '+t)) : (fail++, console.log('  FAIL '+t+(them?'  -> '+them:''))); };

// So serial cua Sheets: 1899-12-30 = 0
const serial = (y,m,d) => Math.round((Date.UTC(y,m-1,d) - Date.UTC(1899,11,30)) / 86400000);

console.log('So serial cua Sheets');
check('2026-08-31 -> 2026-08-01', nm(serial(2026,8,31)) === '2026-08-01', nm(serial(2026,8,31)));
check('2026-01-01 -> 2026-01-01', nm(serial(2026,1,1))  === '2026-01-01', nm(serial(2026,1,1)));
check('2026-12-31 -> 2026-12-01', nm(serial(2026,12,31))=== '2026-12-01', nm(serial(2026,12,31)));
check('2025-09-15 -> 2025-09-01', nm(serial(2025,9,15)) === '2025-09-01', nm(serial(2025,9,15)));

console.log('Cac dang cu van phai chay nhu truoc');
check('Date that', nm(new Date(Date.UTC(2026,7,31))) === '2026-08-01', nm(new Date(Date.UTC(2026,7,31))));
check('chuoi yyyy-MM', nm('2026-08') === '2026-08-01', nm('2026-08'));
check('chuoi yyyy-MM-dd', nm('2026-08-31') === '2026-08-01', nm('2026-08-31'));
check('chuoi ISO', nm('2026-08-31T17:00:00.000Z') === '2026-08-01', nm('2026-08-31T17:00:00.000Z'));
check('rong -> rong', nm('') === '' && nm(null) === '' && nm(undefined) === '');

console.log('Khong hieu nham so thuong thanh ngay');
check('4 (horizon_months) giu nguyen', nm(4) === '4', nm(4));
check('12 giu nguyen', nm(12) === '12', nm(12));
check('2026 giu nguyen', nm(2026) === '2026', nm(2026));
check('0 -> rong', nm(0) === '', JSON.stringify(nm(0)));

console.log('\n' + pass + ' dat, ' + fail + ' loi');
process.exit(fail ? 1 : 0);
