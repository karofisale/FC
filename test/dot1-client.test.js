/**
 * dot1-client.test.js — chốt các sửa đợt 1 (09/10/2026) phía client.
 *
 * VÌ SAO ĐÁNG CÓ:
 *  1. NON_IDEMPOTENT_ACTIONS (gasClient.js) thiếu cả nhóm Kế hoạch năm -> mạng chậm là client tự gửi lại
 *     saveAnnualPlanFinal và tạo hai bản Final. Bài này đọc api.js, lấy MỌI action client gọi, và bắt mỗi
 *     action GHI phải nằm trong danh sách không-thử-lại HOẶC trong danh sách "đã xét là gửi lại vô hại"
 *     dưới đây. Thêm action ghi mới mà quên xét là bài này đỏ.
 *  2. confirmNavigateAway(hanhDong) — đổi chu kỳ / tháng / năm hỏi lại khi có ô chưa lưu; không dirty
 *     thì không hỏi; bấm Huỷ thì trả false.
 *  3. ImportForecastModal: nút đầu là "Xem trước" (không ghi), ghi chỉ ở nút xác nhận "Ghi đè N dòng".
 *
 *   node test/dot1-client.test.js
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SRC = path.join(__dirname, '../client/src');
let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them !== undefined ? '  → ' + JSON.stringify(them) : '')); }
}

// ---- 1. danh sách không tự thử lại ----
const gas = fs.readFileSync(path.join(SRC, 'services/gasClient.js'), 'utf8');
const khoi = gas.match(/NON_IDEMPOTENT_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
const khongThuLai = new Set(khoi ? (khoi[1].replace(/\/\/.*$/gm, '').match(/'([A-Za-z]+)'/g) || []).map((s) => s.slice(1, -1)) : []);
check('đọc được NON_IDEMPOTENT_ACTIONS', khongThuLai.size > 5, [...khongThuLai]);

['saveAnnualPlanFinal', 'submitAnnualPlan', 'decideAnnualPlan', 'applyAnnualPlanToKpi', 'discardAnnualPlan', 'saveAnnualPlan']
  .forEach((a) => check(`${a} không được tự thử lại`, khongThuLai.has(a)));

const apiSrc = fs.readFileSync(path.join(SRC, 'services/api.js'), 'utf8') + fs.readFileSync(path.join(SRC, 'services/auth.js'), 'utf8');
const actions = new Set((apiSrc.match(/callGAS\('([A-Za-z]+)'/g) || []).map((s) => s.slice(9, -1)));
// Action ĐỌC: bắt đầu bằng get/list/search/read/validate (và ping/logout không đổi dữ liệu nghiệp vụ).
const laDoc = (a) => /^(get|list|search|read|validate)/.test(a) || a === 'logout';
// Action ghi ĐÃ XÉT là gửi lại cho ra đúng cùng kết quả (upsert theo khoá / trả lại bản đang có):
const GUI_LAI_VO_HAI = new Set(['saveMonthlyLines', 'saveWeeklySplits', 'saveActuals', 'updateProduct', 'upsertProducts', 'createAnnualPlan', 'login']);
const chuaXet = [...actions].filter((a) => !laDoc(a) && !khongThuLai.has(a) && !GUI_LAI_VO_HAI.has(a));
check('mọi action GHI client gọi đều đã được xét (không-thử-lại hoặc gửi-lại-vô-hại)', chuaXet.length === 0, chuaXet);
// importProducts: action server có nhưng màn hình hiện không gọi — để sẵn trong danh sách là cố ý.
const thua = [...khongThuLai].filter((a) => !actions.has(a) && a !== 'importProducts');
check('NON_IDEMPOTENT_ACTIONS không chứa tên action client không hề gọi (gõ sai tên)', thua.length === 0, thua);

// ---- 2. confirmNavigateAway ----
// ĐỢT 2 (10/10/2026): confirmNavigateAway hỏi bằng hộp thoại chung của app (services/dialogService.js) thay cho window.confirm,
// nên trả Promise<boolean> — các ca dưới đây `await` và đọc yêu cầu hộp thoại qua host giả. Cùng chữ ký, cùng câu chữ.
async function ca2() {
  const url = (f) => pathToFileURL(path.join(SRC, f)).href;
  const ds = await import(url('services/dirtyState.js'));
  const dlg = await import(url('services/dialogService.js'));
  const hoi = [];
  let traLoi = true;
  dlg.registerDialogHost((req) => { hoi.push(req); req.resolve(traLoi); });
  check('không có ô chưa lưu -> không hỏi, cho đi tiếp', (await ds.confirmNavigateAway('Đổi chu kỳ')) === true && hoi.length === 0);
  ds.setDirty(true, 'Bảng Forecast tháng còn 3 ô chưa lưu.');
  traLoi = false;
  check('có ô chưa lưu + bấm Huỷ -> false', (await ds.confirmNavigateAway('Đổi chu kỳ')) === false && hoi.length === 1);
  check('câu hỏi nêu đúng việc vừa bấm và lý do', /Đổi chu kỳ/.test(hoi[0].message) && /3 ô chưa lưu/.test(hoi[0].message), hoi[0].message);
  traLoi = true;
  check('bấm đồng ý -> true; gọi không tham số vẫn là câu "rời khỏi trang" cũ', (await ds.confirmNavigateAway()) === true && /rời khỏi trang/.test(hoi[1].message), hoi[1].message);
}

// ---- 3. các chỗ đổi chu kỳ / tháng / năm đều đi qua confirmNavigateAway ----
const doc = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const cb = doc('components/CycleBar.jsx');
check('CycleBar: đổi chu kỳ + đổi bản cập nhật hỏi trước', /await confirmNavigateAway\('Đổi chu kỳ'\)\) onSelectCycle/.test(cb) && /await confirmNavigateAway\('Đổi bản cập nhật'\)\) onSelectVersion/.test(cb));
check('Actuals: đổi tháng hỏi trước', /await confirmNavigateAway\('Đổi tháng'\)\) setMonth/.test(doc('pages/Actuals.jsx')));
const ap = doc('pages/AnnualPlan.jsx');
check('AnnualPlan: đổi năm + đổi phiên bản hỏi trước; Duyệt và Hủy điều chỉnh có xác nhận',
  /await confirmNavigateAway\('Đổi năm kế hoạch'\)\) setYear/.test(ap) && /await confirmNavigateAway\('Đổi phiên bản kế hoạch'\)\) nap/.test(ap)
  && /onClick=\{duyet\}/.test(ap) && /onClick=\{huyDieuChinh\}/.test(ap) && /KPI năm/.test(ap.slice(ap.indexOf('const duyet'), ap.indexOf('const huyDieuChinh'))));
check('AnnualPlan: lưu gửi kèm expectedUpdatedAt (cả Lưu nháp lẫn Gửi duyệt)', (ap.match(/expectedUpdatedAt: mocDaTai\(id\)/g) || []).length === 2);

// ---- 4. nhập từ file: xem trước rồi mới ghi ----
const im = doc('components/ImportForecastModal.jsx');
check('nút đầu là "Xem trước", không còn "Đọc dữ liệu"', /Xem trước\s*<\/button>/.test(im) && !/>\s*Đọc dữ liệu\s*</.test(im));
check('finishParse KHÔNG ghi (không gọi applyImport), chỉ sang bước preview', (() => {
  const f = im.slice(im.indexOf('async function finishParse'), im.indexOf('async function demDongDangCo'));
  return f.length > 0 && !/applyImport\(/.test(f) && /setStep\('preview'\)/.test(f);
})());
check('nút xác nhận ghi "Ghi đè N dòng" gọi handleConfirmWrite; cảnh báo ô chưa lưu + bản chờ duyệt',
  /onClick=\{handleConfirmWrite\}/.test(im) && /Ghi đè \{xemTruoc\.soDong/.test(im) && /ô chưa lưu/.test(im) && /rút yêu cầu duyệt/.test(im));

ca2().then(() => {
  console.log(`\n${pass} đạt, ${fail} lỗi`);
  if (fail) process.exit(1);
}).catch((e) => { console.error(e); process.exit(1); });
