/**
 * SapBridge.gs — cửa cho bộ script cào SAP trên máy người dùng.
 *
 * Nút "Cào từ SAP" trong app không thể tự chạy gì: trang web không khởi được
 * tiến trình trên máy, và backend Apps Script nằm ngoài mạng công ty nên không
 * chạm tới SAP on-premise. Đường đi thật:
 *
 *   nút → karofi-fc://thuc-hien?bu=3T&month=2026-09
 *       → chay.vbs (lọc bằng danh sách cho phép)
 *       → dieu-phoi.ps1 → dt-fc/export_zsd450.py → tools/sap-push.mjs
 *       → CHÍNH FILE NÀY
 *
 * XÁC THỰC BẰNG SECRET, KHÔNG PHẢI PIN. Bộ điều phối chạy không người ngồi
 * trước máy nên không gõ PIN được. Secret nằm ở Script Property
 * `SAP_BRIDGE_SECRET` — KHÔNG BAO GIỜ xuống client: kho FC là kho CÔNG KHAI,
 * mọi chuỗi trong bundle đều đọc được trên GitHub.
 *
 * VÌ SAO CHẤP NHẬN ĐƯỢC MỘT CỬA KHÔNG-PIN: việc duy nhất qua được đây là ghi
 * đè sản lượng thực hiện của ĐÚNG MỘT (đơn vị, tháng) bằng số vừa đọc từ SAP —
 * upsert theo khoá, chạy mười lần ra một kết quả, và luôn cào lại được. Không
 * có việc XOÁ nào. Ngày nào thêm một việc phá được dữ liệu thì phép tính đổi
 * hẳn và phải chuyển sang xác thực thật.
 */

/** Tên Script Property chứa secret. Đặt bằng setup_datSapBridgeSecret(). */
var SAP_BRIDGE_SECRET_KEY_ = 'SAP_BRIDGE_SECRET';

/** Dòng nhịp của NÚT (app hỏi vòng dòng này), tách khỏi dòng dữ liệu. */
function sapNhipNut_(bu) {
  return 'fc.thuc-hien.nut.' + String(bu || '').toLowerCase();
}

/** Dòng nhịp DỮ LIỆU — chỉ ghi khi số thật sự vào Sheet. */
function sapNhipData_(bu) {
  return 'fc.thuc-hien.' + String(bu || '').toLowerCase();
}

/**
 * So secret theo kiểu không lộ độ dài khớp tới đâu.
 *
 * So bằng `===` thoát ngay ở ký tự đầu khác nhau, nên thời gian trả lời rò rỉ
 * tiền tố đúng. Ở đây rủi ro thấp (secret dài, gọi qua mạng), nhưng viết đúng
 * thì không tốn gì.
 */
function sapSecretKhop_(gui) {
  var that = PropertiesService.getScriptProperties().getProperty(SAP_BRIDGE_SECRET_KEY_);
  if (!that) throw new Error('Chưa đặt Script Property ' + SAP_BRIDGE_SECRET_KEY_
    + '. Chạy setup_datSapBridgeSecret() trong editor.');
  var a = String(gui || '');
  var b = String(that);
  if (a.length !== b.length) return false;
  var lech = 0;
  for (var i = 0; i < a.length; i++) lech |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return lech === 0;
}

/**
 * Ghi nhịp cho nút. Bộ điều phối gọi ở đầu và cuối mỗi lượt.
 *
 * Ba trạng thái là HỢP ĐỒNG với dieu-phoi.ps1 và với panel trong app — đừng
 * đổi một bên: 'dang-chay' → còn chạy · 'ok' → xong · 'loi' → hỏng.
 */
function sapBridgeHeartbeat_(p) {
  if (!sapSecretKhop_(p.secret)) throw new Error('Sai secret.');
  var bu = String(p.bu || '').trim();
  if (!bu) throw new Error('Thiếu đơn vị.');
  ghiNhipTim_(getSpreadsheet_(), sapNhipNut_(bu), {
    moTa: 'Nút cào SAP — sản lượng thực hiện ' + bu,
    trangThai: String(p.trangThai || ''),
    ghiChu: String(p.ghiChu || ''),
    soDong: (p.soDong === null || p.soDong === undefined) ? null : Number(p.soDong)
  });
  return { ok: true };
}

/**
 * Nhận sản lượng thực hiện đã gom sẵn theo mã và ghi vào bảng Actuals.
 *
 * KHÔNG tự đọc file, không tự gom: `tools/sap-push.mjs` đọc bằng CHÍNH
 * parseZsd450 mà màn hình dùng, nên chỉ có MỘT bộ đọc ZSD450 trong cả hệ.
 * Viết bản thứ hai ở đây là tạo ra hai sự thật, và ngày SAP đổi tên một cột
 * thì chỉ một bên biết.
 *
 * @param {Object} p { secret, bu, month, rows: [{ skuCode, quantity }] }
 */
function sapBridgeImportActuals_(p) {
  if (!sapSecretKhop_(p.secret)) throw new Error('Sai secret.');

  var bu = String(p.bu || '').trim();
  var month = normalizeMonth_(p.month);
  if (!bu) throw new Error('Thiếu đơn vị kinh doanh.');
  if (!month) throw new Error('Thiếu tháng.');
  if (!Array.isArray(p.rows) || !p.rows.length) throw new Error('Danh sách sản lượng rỗng.');

  var donVi = readObjects_(SHEETS.BUSINESS_UNITS).filter(function (b) {
    return String(b.code || '').trim() === bu;
  })[0];
  if (!donVi) throw new Error('Không có đơn vị "' + bu + '" trong danh mục.');

  // Miền dành cho sản lượng thực hiện. Không chọn bừa miền đầu tiên: ghi nhầm
  // vào MB thì toàn bộ số dồn lệch hẳn một bên mà bảng nhìn vẫn bình thường.
  var mien = regionsFor_('actual')[0];
  if (!mien) throw new Error('Chưa có miền dành cho sản lượng thực hiện (scope = actual). '
    + 'Chạy setupDatabase() để thêm miền TQ.');

  var coTrongFC = {};
  readObjects_(SHEETS.PRODUCTS).forEach(function (pr) {
    var ma = normalizeSku_(pr.sku_code);
    if (ma) coTrongFC[ma] = true;
  });

  var now = new Date().toISOString();
  var maLa = [];
  var records = [];
  p.rows.forEach(function (r) {
    var sku = normalizeSku_(r.skuCode);
    var qty = Number(r.quantity);
    if (!sku || !isFinite(qty)) return;
    // Mã lạ KHÔNG bị bỏ qua im lặng — số của chúng rơi mất mà không dấu hiệu
    // gì là kiểu hỏng chỉ lộ ra khi đối chiếu cuối kỳ.
    if (!coTrongFC[sku]) { maLa.push(sku); return; }
    records.push({
      id: Utilities.getUuid(),
      business_unit_code: bu,
      sku_code: sku,
      actual_month: month,
      region_code: mien.code,
      quantity: qty,
      source_system: 'ZSD450',
      imported_by: 'sap-bridge',
      imported_at: now
    });
  });

  if (!records.length) {
    throw new Error('Không mã nào ghi được — cả ' + maLa.length + ' mã đều không có trong danh mục.');
  }

  var written = upsertRows_(SHEETS.ACTUALS,
    ['business_unit_code', 'sku_code', 'actual_month', 'region_code'], records);

  var tong = records.reduce(function (s, r) { return s + r.quantity; }, 0);
  ghiNhipTim_(getSpreadsheet_(), sapNhipData_(bu), {
    moTa: 'Sản lượng thực hiện ' + bu + ' (ZSD450)',
    trangThai: 'ok',
    soDong: records.length,
    ghiChu: 'tháng ' + month.slice(0, 7) + ' · ' + tong + ' cái'
      + (maLa.length ? ' · ' + maLa.length + ' mã lạ bị bỏ' : '')
  });

  return {
    ok: true,
    month: month,
    regionCode: mien.code,
    total: written.total,
    inserted: written.inserted,
    updated: written.updated,
    quantity: tong,
    unknownSkus: maLa
  };
}

/**
 * Bộ lọc ZSD450 của mọi đơn vị đang bật — bộ điều phối đọc để biết chạy
 * VKORG/VTWEG/KUNNR nào cho đơn vị nào.
 *
 * Trả bằng cửa secret chứ không bắt đăng nhập PIN, vì bộ điều phối chạy không
 * người ngồi trước máy. Dữ liệu ở đây là mã tổ chức bán hàng, không phải số
 * liệu kinh doanh.
 */
function sapBridgeFilters_(p) {
  if (!sapSecretKhop_(p.secret)) throw new Error('Sai secret.');
  return {
    ok: true,
    units: activeOnly_(readObjects_(SHEETS.BUSINESS_UNITS)).map(function (b) {
      return {
        code: String(b.code || '').trim(),
        name: String(b.name || ''),
        vkorg: String(b.sap_vkorg || '').trim(),
        vtweg: String(b.sap_vtweg || '').trim(),
        soldTo: String(b.sap_sold_to || '').trim()
      };
    }).filter(function (b) { return b.vkorg && b.vtweg; })
  };
}

/** Đọc nhịp tim cho app. KHÔNG cache — xem chú thích trong Router.gs. */
function getNhipTim_() {
  return { nhipTim: docNhipTim_(getSpreadsheet_()) };
}
