/**
 * UserIdReport.gs — mã người dùng nào đã thật sự để lại dấu vết trong dữ liệu FC.
 *
 * Vì sao cần: FC ghi người thao tác vào các cột created_by / submitted_by /
 * updated_by / approver_id / requested_by / imported_by. Mã ghi vào đó lấy
 * thẳng từ phiên đăng nhập — mà một người có thể vào FC bằng HAI mã khác nhau:
 *
 *   qua cổng VHKD  -> mã trong khối quyền của token (cột fc_name bên Karofi ID)
 *   qua form riêng -> cột id trong tab Users của chính file này
 *
 * Hai mã lệch nhau là lịch sử của cùng một người bị tách làm đôi, và mọi bộ
 * lọc theo người ("bản nháp của tôi", phạm vi người duyệt) sẽ trượt một nửa.
 * Báo cáo này chỉ ra chỗ lệch trước khi nó kịp tích thành dữ liệu hỏng.
 *
 * CHỈ ĐỌC — không sửa ô nào, chạy bao nhiêu lần cũng được.
 * Chạy adminReportUserIds() trong Apps Script editor rồi đọc Execution log.
 */

/** Những cột đang lưu mã người dùng, theo SCHEMA trong Config.gs. */
var UID_COLUMNS_ = [
  [SHEETS.CYCLES, 'created_by'],
  [SHEETS.VERSIONS, 'submitted_by'],
  [SHEETS.MONTHLY_LINES, 'updated_by'],
  [SHEETS.WEEKLY_SPLITS, 'updated_by'],
  [SHEETS.APPROVALS, 'approver_id'],
  [SHEETS.APPROVALS, 'requested_by'],
  [SHEETS.ACTUALS, 'imported_by'],
  [SHEETS.AUDIT, 'user_id']
];

function adminReportUserIds() {
  var users = readTable_(SHEETS.USERS);
  var coId = users.idx['id'];
  var biet = {};
  users.rows.forEach(function (r) {
    var v = String(r[coId] == null ? '' : r[coId]).trim();
    if (v) biet[v.toLowerCase()] = v;
  });

  // dem[mã][nhãn cột] = số dòng
  var dem = {};
  var loi = [];

  UID_COLUMNS_.forEach(function (pair) {
    var ten = pair[0], cot = pair[1];
    var nhan = ten + '.' + cot;
    var t;
    try {
      t = readTable_(ten);
    } catch (e) {
      loi.push(nhan + ': ' + e.message);
      return;
    }
    var ci = t.idx[cot];
    if (ci == null) { loi.push(nhan + ': không có cột này'); return; }

    t.rows.forEach(function (r) {
      var v = String(r[ci] == null ? '' : r[ci]).trim();
      if (!v) return;
      if (!dem[v]) dem[v] = {};
      dem[v][nhan] = (dem[v][nhan] || 0) + 1;
    });
  });

  var ma = Object.keys(dem).sort(function (a, b) {
    return tongDem_(dem[b]) - tongDem_(dem[a]);
  });

  var out = [];
  out.push('=== MÃ NGƯỜI DÙNG ĐANG CÓ TRONG DỮ LIỆU FC ===');
  out.push('Tab Users: ' + users.rows.length + ' mã.');
  out.push('');

  // Tách hai loại rất khác nhau. AuthLog ghi CẢ những lượt đăng nhập hỏng,
  // nên mã chỉ xuất hiện ở đó phần lớn là tên gõ sai hoặc tên thử nghiệm —
  // không phải danh tính đang giữ dữ liệu. Gộp chung hai loại là đẩy người
  // đọc đi sửa nhầm chỗ.
  var lacCoDuLieu = [];
  var chiTrongNhatKy = [];

  ma.forEach(function (m) {
    var co = !!biet[m.toLowerCase()];
    var tong = tongDem_(dem[m]);
    var cot = Object.keys(dem[m]);
    var chiTiet = cot.map(function (k) { return k + '=' + dem[m][k]; }).join(', ');
    var chiNhatKy = cot.length === 1 && cot[0] === SHEETS.AUDIT + '.user_id';

    out.push((co ? '  ' : (chiNhatKy ? '~ ' : '! ')) + m +
             '  (' + tong + ' dòng)  ' + chiTiet);
    if (!co) (chiNhatKy ? chiTrongNhatKy : lacCoDuLieu).push(m);
  });

  if (!ma.length) out.push('  (chưa có dòng nào ghi mã người dùng)');

  out.push('');
  if (lacCoDuLieu.length) {
    out.push('DẤU ! — ' + lacCoDuLieu.length + ' mã ĐANG GIỮ DỮ LIỆU nhưng không có trong tab Users:');
    out.push('  ' + lacCoDuLieu.join(', '));
    out.push('Thường là mã do cổng VHKD cấp (cột fc_name bên Karofi ID) lệch với tab Users.');
    out.push('Sửa cho hai bên trùng nhau, và giữ ĐÚNG mã đã có lịch sử ở trên —');
    out.push('đổi mã đã có lịch sử là bỏ rơi số dòng ghi cạnh nó.');
  } else {
    out.push('Không mã lạ nào đang giữ dữ liệu nghiệp vụ.');
  }

  if (chiTrongNhatKy.length) {
    out.push('');
    out.push('DẤU ~ — ' + chiTrongNhatKy.length + ' mã CHỈ có trong AuthLog, không giữ dòng dữ liệu nào:');
    out.push('  ' + chiTrongNhatKy.join(', '));
    out.push('AuthLog ghi cả lượt đăng nhập hỏng, nên đây thường là tên gõ sai hoặc');
    out.push('tên thử nghiệm. Không phải danh tính cần sửa.');
  }

  if (loi.length) {
    out.push('');
    out.push('Không đọc được:');
    loi.forEach(function (x) { out.push('  ' + x); });
  }

  Logger.log(out.join('\n'));
  return out.join('\n');
}

function tongDem_(o) {
  var s = 0;
  Object.keys(o).forEach(function (k) { s += o[k]; });
  return s;
}
