/**
 * productpaste.test.js — kiểm bộ đọc dữ liệu dán từ Excel.
 *
 * VÌ SAO ĐÁNG CÓ: đây là cửa duy nhất người dùng ghi thẳng vào avg_price, mà
 * avg_price nuôi total_revenue. Đường ống này đã hỏng một lần theo đúng kiểu
 * im lặng — "3.156.787" -> Number() -> NaN -> `|| 0` -> doanh thu tụt 30 lần
 * mà không có gì báo. Các ca dưới đây chốt hai điều:
 *   1. Đọc đúng cả hai kiểu dấu phân cách (Excel VN và Excel Anh).
 *   2. Đọc KHÔNG ra thì trả lỗi, KHÔNG trả 0.
 *
 *   node test/productpaste.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Nạp module ES bằng cách cắt bỏ từ khoá export — đủ cho phần thuần tính toán,
// và tránh kéo cả Vite/babel vào chỉ để chạy hai hàm.
const src = fs.readFileSync(path.join(__dirname, '../client/src/utils/productPaste.js'), 'utf8')
  .replace(/^export /gm, '');
const sandbox = { console, Number, String, Object, JSON, RegExp, Math, Array };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src + '\n;this.parseGiaNhap = parseGiaNhap; this.parseDanBang = parseDanBang;', sandbox);
const { parseGiaNhap, parseDanBang } = sandbox;

let pass = 0, fail = 0;
function la(ten, thucTe, mongDoi) {
  const a = JSON.stringify(thucTe), b = JSON.stringify(mongDoi);
  if (a === b) { pass++; return; }
  fail++;
  console.log('  THAT BAI: ' + ten + '\n    mong doi: ' + b + '\n    thuc te : ' + a);
}
function gia(ten, vao, mongDoi) { la(ten, parseGiaNhap(vao).so, mongDoi); }
function loi(ten, vao) {
  const r = parseGiaNhap(vao);
  if (r.loi && r.so === null) { pass++; return; }
  fail++;
  console.log('  THAT BAI: ' + ten + ' — dang le phai bao loi, nhung tra ve ' + JSON.stringify(r.so));
}

console.log('1. Doc gia — kieu Excel tieng Viet');
gia('nghin bang dau cham', '1.234.567', 1234567);
gia('mot dau cham, 3 chu so sau -> nghin', '1.234', 1234);
gia('cham nghin + phay thap phan', '1.234.567,5', 1234567.5);
gia('phay thap phan mot minh', '1234,5', 1234.5);

console.log('2. Doc gia — kieu Excel tieng Anh');
gia('nghin bang dau phay', '1,234,567', 1234567);
gia('mot dau phay, 3 chu so sau -> nghin', '1,234', 1234);
gia('phay nghin + cham thap phan', '1,234,567.5', 1234567.5);
gia('cham thap phan mot minh', '1234.5', 1234.5);

console.log('3. Doc gia — cac dang khac');
gia('so nguyen tran', '3156787', 3156787);
gia('so that su la number', 3156787, 3156787);
gia('co khoang trang', '  1.234.567  ', 1234567);
gia('co ky hieu tien te', '1.234.567 d', 1234567);
gia('khoang trang lam dau nghin', '1 234 567', 1234567);
gia('rong -> 0 (o trong la hop le)', '', 0);
gia('null -> 0', null, 0);
gia('so 0', '0', 0);

console.log('4. Doc khong ra thi BAO LOI, khong tra 0');
loi('chu', 'chua co gia');
loi('lan chu vao so', '1.234abc');
loi('gia am', '-5000');
loi('nhieu dau thap phan', '1.2.3,4,5');

console.log('5. Doc khoi dan — thu tu cot mac dinh');
{
  const t = 'SP001\tMay loc nuoc A\tA1\tNHOM1\tRO\tOEM\t1.234.567';
  const { rows, coTieuDe } = parseDanBang(t);
  la('mot dong, khong tieu de', rows.length, 1);
  la('khong nhan nham tieu de', coTieuDe, false);
  la('ma', rows[0].skuCode, 'SP001');
  la('ten', rows[0].name, 'May loc nuoc A');
  la('kenh', rows[0].defaultChannel, 'OEM');
  la('gia da thanh so', rows[0].avgPrice, 1234567);
  la('khong loi', rows[0].loi, []);
}

console.log('6. Doc khoi dan — co dong tieu de, cot dao thu tu');
{
  const t = [
    'Ten san pham\tMa SKU\tGia ban',
    'May loc nuoc B\tSP002\t2.000.000'
  ].join('\n');
  const { rows, coTieuDe } = parseDanBang(t);
  la('nhan ra tieu de', coTieuDe, true);
  la('bo dong tieu de', rows.length, 1);
  la('map dung cot ma', rows[0].skuCode, 'SP002');
  la('map dung cot ten', rows[0].name, 'May loc nuoc B');
  la('map dung cot gia', rows[0].avgPrice, 2000000);
}

console.log('7. Tieu de viet co dau van nhan ra');
{
  const t = 'Mã SKU\tTên sản phẩm\tGiá bán\nSP003\tMáy C\t500.000';
  const { rows, coTieuDe } = parseDanBang(t);
  la('nhan ra tieu de co dau', coTieuDe, true);
  la('doc dung ma', rows[0].skuCode, 'SP003');
  la('doc dung gia', rows[0].avgPrice, 500000);
}

console.log('8. Dong hong bi danh dau, khong bi nuot');
{
  const t = [
    'SP004\tMay D\t\t\t\tOEM\tchua co gia',
    'SP005\t\t\t\t\tOEM\t100000'
  ].join('\n');
  const { rows } = parseDanBang(t);
  la('van giu ca hai dong', rows.length, 2);
  la('dong gia hong co loi', rows[0].loi.length > 0, true);
  la('gia hong KHONG thanh 0', rows[0].avgPrice, null);
  la('dong thieu ten co loi', rows[1].loi.indexOf('Thiếu tên sản phẩm') >= 0, true);
}

console.log('9. Dong trang va dong khong co ma thi bo qua lang le');
{
  const t = 'SP006\tMay E\t\t\t\tOEM\t1000\n\n\t\t\t\t\t\t\n   \n';
  const { rows } = parseDanBang(t);
  la('chi con dong that', rows.length, 1);
  la('dung ma', rows[0].skuCode, 'SP006');
}

console.log('10. KHONG tach o theo dau phay — neu khong gia se vo lam ba');
{
  const { rows } = parseDanBang('SP007\tMay F\t\t\t\tOEM\t1,234,567');
  la('gia con nguyen', rows[0].avgPrice, 1234567);
  la('mot dong duy nhat', rows.length, 1);
}

console.log('11. Cot thieu o cuoi -> khong loi, gia de trong');
{
  const { rows } = parseDanBang('SP008\tMay G');
  la('doc duoc', rows.length, 1);
  la('gia null khi khong co cot', rows[0].avgPrice, null);
  la('khong bao loi gia', rows[0].loi, []);
}

console.log('12. O gia TRONG (cot co mat) -> null, khong phai 0');
{
  const { rows } = parseDanBang('SP009	May H				OEM	');
  la('gia null', rows[0].avgPrice, null);
  la('khong bao loi', rows[0].loi, []);
}

console.log('13. Excel chen non-breaking space thi van doc duoc');
{
  const nbsp = String.fromCharCode(160);
  la('nbsp lam dau nghin', parseGiaNhap('1' + nbsp + '234' + nbsp + '567').so, 1234567);
  la('nbsp truoc ky hieu tien', parseGiaNhap('1.234.567' + nbsp + 'd').so, 1234567);
}

console.log('');
console.log('Ket qua: ' + pass + ' dat, ' + fail + ' hong');
process.exit(fail ? 1 : 0);
