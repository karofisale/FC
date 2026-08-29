/**
 * Xác thực bằng PIN, quản lý phiên và phân quyền
 * Một phần của backend FC App — clasp push gộp mọi file .gs vào cùng
 * một phạm vi toàn cục, nên các file gọi chéo hàm của nhau bình thường.
 */

// ---------------------------------------------------------------------
// XÁC THỰC BẰNG PIN
// ---------------------------------------------------------------------

function login_(userId, pin) {
  var key = String(userId || '').trim().toLowerCase();
  if (!key || !pin) throw new Error('Cần nhập mã người dùng và mã PIN.');

  return runExclusive_(function () {
    var table = readTable_(SHEETS.USERS);
    var rowIndex = -1;

    for (var i = 0; i < table.rows.length; i++) {
      var id = String(table.rows[i][table.idx.id] || '').trim().toLowerCase();
      var email = String(table.rows[i][table.idx.email] || '').trim().toLowerCase();
      if (id === key || email === key) { rowIndex = i; break; }
    }

    // Thông báo cố tình chung chung để không lộ mã người dùng nào có thật
    if (rowIndex < 0) {
      logAuth_(key, 'login_failed', 'không tìm thấy người dùng');
      throw new Error('Mã người dùng hoặc PIN không đúng.');
    }

    var row = table.rows[rowIndex];
    var user = rowToObject_(table.headers, row);

    if (String(user.is_active) === '0' || String(user.is_active).toLowerCase() === 'false') {
      throw new Error('Tài khoản đã bị vô hiệu hoá. Liên hệ quản trị hệ thống.');
    }

    var lockedUntil = user.locked_until ? new Date(user.locked_until).getTime() : 0;
    if (lockedUntil && lockedUntil > Date.now()) {
      var mins = Math.ceil((lockedUntil - Date.now()) / 60000);
      throw new Error('Tài khoản đang tạm khoá do nhập sai PIN nhiều lần. Thử lại sau ' + mins + ' phút.');
    }

    if (!user.pin_hash) {
      throw new Error('Tài khoản chưa được cấp PIN. Liên hệ quản trị hệ thống.');
    }

    if (!verifyPin_(pin, user.pin_hash)) {
      var failed = (Number(user.failed_attempts) || 0) + 1;
      var patch = { failed_attempts: failed };
      if (failed >= MAX_FAILED_ATTEMPTS) {
        patch.locked_until = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
        patch.failed_attempts = 0;
      }
      writeRowPatch_(SHEETS.USERS, table, rowIndex, patch);
      logAuth_(user.id, 'login_failed', 'lần sai thứ ' + failed);

      if (failed >= MAX_FAILED_ATTEMPTS) {
        throw new Error('Sai PIN ' + MAX_FAILED_ATTEMPTS + ' lần. Tài khoản tạm khoá '
          + (LOCK_DURATION_MS / 60000) + ' phút.');
      }
      throw new Error('Mã người dùng hoặc PIN không đúng. Còn '
        + (MAX_FAILED_ATTEMPTS - failed) + ' lần thử.');
    }

    // Đăng nhập thành công
    writeRowPatch_(SHEETS.USERS, table, rowIndex, {
      failed_attempts: 0,
      locked_until: '',
      last_login: new Date().toISOString()
    });

    var token = createSession_(user);
    logAuth_(user.id, 'login_ok', '');

    return {
      token: token,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      user: publicUser_(user)
    };
  });
}

function logout_(token) {
  if (token) {
    PropertiesService.getScriptProperties().deleteProperty('s_' + token);
    CacheService.getScriptCache().remove('s_' + token);
  }
  return { ok: true };
}

function createSession_(user) {
  var token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  var data = JSON.stringify({
    u: user.id,
    n: user.full_name,
    r: user.role,
    b: user.business_unit_code || '',
    exp: Date.now() + SESSION_TTL_MS
  });

  var props = PropertiesService.getScriptProperties();
  purgeExpiredSessions_(props);
  props.setProperty('s_' + token, data);
  CacheService.getScriptCache().put('s_' + token, data, 21600); // 6h cache đọc nhanh
  return token;
}

function requireSession_(token) {
  if (!token) throw new Error('UNAUTHORIZED: Chưa đăng nhập.');

  var key = 's_' + token;
  var raw = CacheService.getScriptCache().get(key);
  if (!raw) raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) throw new Error('UNAUTHORIZED: Phiên đăng nhập không hợp lệ.');

  var s;
  try { s = JSON.parse(raw); } catch (e) { throw new Error('UNAUTHORIZED: Phiên hỏng.'); }

  if (!s.exp || s.exp < Date.now()) {
    logout_(token);
    throw new Error('UNAUTHORIZED: Phiên đã hết hạn, vui lòng đăng nhập lại.');
  }

  return { userId: s.u, fullName: s.n, role: s.r, bu: s.b };
}

function purgeExpiredSessions_(props) {
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('s_') !== 0) return;
    try {
      if ((JSON.parse(all[k]).exp || 0) < now) props.deleteProperty(k);
    } catch (e) {
      props.deleteProperty(k);
    }
  });
}

/**
 * PIN được băm SHA-256 kèm pepper lưu trong Script Properties (không nằm
 * trong Sheet), nên người xem được Sheet vẫn không dựng lại được PIN.
 *
 * Salt sinh ngẫu nhiên MỖI LẦN đặt PIN và lưu ngay trong ô pin_hash theo
 * dạng "salt:hash" — cố tình KHÔNG dùng userId làm một phần đầu vào của
 * hash, vì userId là cột có thể sửa tay trong Sheet (đổi tên cho dễ nhớ);
 * nếu hash phụ thuộc vào userId, đổi tên xong PIN cũ sẽ không xác thực
 * lại được nữa dù người dùng gõ đúng PIN.
 */
function hashWithSalt_(pin, salt) {
  var pepper = getOrCreatePepper_();
  var raw = pepper + '|' + salt + '|' + String(pin);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1);
  }).join('');
}

/** Tạo bản ghi pin_hash mới ("salt:hash") để lưu vào cột pin_hash. */
function makePinRecord_(pin) {
  var salt = Utilities.getUuid();
  return salt + ':' + hashWithSalt_(pin, salt);
}

/** So PIN người dùng nhập với bản ghi "salt:hash" đang lưu trong Sheet. */
function verifyPin_(pin, storedRecord) {
  var stored = String(storedRecord || '');
  var sep = stored.indexOf(':');
  if (sep < 0) return false; // định dạng cũ (không có salt) -> luôn coi là không khớp, bắt đặt lại PIN
  var salt = stored.slice(0, sep);
  var hash = stored.slice(sep + 1);
  return hashWithSalt_(pin, salt) === hash;
}

function getOrCreatePepper_() {
  var props = PropertiesService.getScriptProperties();
  var pepper = props.getProperty('AUTH_PEPPER');
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_PEPPER', pepper);
  }
  return pepper;
}

function validatePinFormat_(pin) {
  var p = String(pin || '');
  if (p.length < MIN_PIN_LENGTH) throw new Error('PIN phải có ít nhất ' + MIN_PIN_LENGTH + ' ký tự.');
  if (!/^\d+$/.test(p)) throw new Error('PIN chỉ gồm chữ số.');
  if (/^(\d)\1+$/.test(p)) throw new Error('PIN không được là dãy số giống nhau.');
  if ('0123456789012345678901234567890'.indexOf(p) >= 0) throw new Error('PIN không được là dãy số liên tiếp.');
  return p;
}

function changeMyPin_(session, currentPin, newPin) {
  validatePinFormat_(newPin);
  var table = readTable_(SHEETS.USERS);
  var rowIndex = findRowIndex_(table, 'id', session.userId);
  if (rowIndex < 0) throw new Error('Không tìm thấy tài khoản.');

  var user = rowToObject_(table.headers, table.rows[rowIndex]);
  if (!verifyPin_(currentPin, user.pin_hash)) {
    throw new Error('PIN hiện tại không đúng.');
  }

  writeRowPatch_(SHEETS.USERS, table, rowIndex, { pin_hash: makePinRecord_(newPin) });
  logAuth_(session.userId, 'pin_changed', 'tự đổi');
  return { message: 'Đã đổi PIN thành công.' };
}

function setUserPin_(session, userId, newPin) {
  assertRole_(session, ['central_admin']);
  validatePinFormat_(newPin);

  var table = readTable_(SHEETS.USERS);
  var rowIndex = findRowIndex_(table, 'id', userId);
  if (rowIndex < 0) throw new Error('Không tìm thấy người dùng: ' + userId);

  writeRowPatch_(SHEETS.USERS, table, rowIndex, {
    pin_hash: makePinRecord_(newPin),
    failed_attempts: 0,
    locked_until: ''
  });
  logAuth_(session.userId, 'pin_reset', 'đặt lại PIN cho ' + userId);
  return { message: 'Đã đặt PIN mới cho ' + userId };
}

// ---------------------------------------------------------------------
// PHÂN QUYỀN
// ---------------------------------------------------------------------

function assertRole_(session, roles) {
  if (roles.indexOf(session.role) < 0) {
    throw new Error('FORBIDDEN: Vai trò "' + session.role + '" không được phép thực hiện thao tác này.');
  }
}

/** Chỉ được đụng vào đơn vị của mình, trừ central_admin. */
function assertBU_(session, buCode) {
  if (session.role === 'central_admin') return;
  if (!buCode) return;
  if (String(session.bu) !== String(buCode)) {
    throw new Error('FORBIDDEN: Bạn chỉ được thao tác trên đơn vị ' + (session.bu || '(chưa gán)') + '.');
  }
}

/**
 * Phạm vi ĐỌC theo đơn vị kinh doanh.
 *
 * Tách riêng khỏi assertBU_ (dùng cho đường ghi) vì hai vai trò khác nhau:
 * viewer được xem mọi đơn vị nhưng không được ghi gì, nên không thể dùng
 * chung một hàm. Khác biệt thứ hai: assertBU_ cho qua khi đối tượng không
 * có mã đơn vị (`if (!buCode) return`), còn ở đây thiếu mã đơn vị là TỪ
 * CHỐI — dữ liệu không xác định được chủ thì không ai ngoài admin được xem.
 */
function assertCanReadBU_(session, buCode) {
  if (session.role === 'central_admin' || session.role === 'viewer') return;
  if (!session.bu) {
    throw new Error('FORBIDDEN: Tài khoản chưa được gán đơn vị kinh doanh.');
  }
  if (!buCode || String(session.bu) !== String(buCode)) {
    throw new Error('FORBIDDEN: Bạn chỉ được xem dữ liệu của đơn vị ' + session.bu + '.');
  }
}

/** Chặn đọc version của đơn vị khác (versionId do client gửi lên, đoán được). */
function assertCanReadVersion_(session, versionId) {
  if (session.role === 'central_admin' || session.role === 'viewer') return;
  if (!versionId) throw new Error('Thiếu versionId.');
  assertCanReadBU_(session, versionContext_(versionId).cycle.business_unit_code);
}

/** Chặn đọc chu kỳ của đơn vị khác. */
function assertCanReadCycle_(session, cycleId) {
  if (session.role === 'central_admin' || session.role === 'viewer') return;
  if (!cycleId) throw new Error('Thiếu cycleId.');
  var cycle = findOne_(SHEETS.CYCLES, 'id', cycleId);
  if (!cycle) throw new Error('Không tìm thấy chu kỳ: ' + cycleId);
  assertCanReadBU_(session, cycle.business_unit_code);
}

/**
 * Mã đơn vị hiệu lực cho các action nhận thẳng tham số `bu` từ client.
 * Người dùng thường luôn bị ép về đúng đơn vị của mình, kể cả khi không gửi
 * tham số — trước đây bỏ trống nghĩa là "lấy tất cả đơn vị".
 */
function scopedBU_(session, requestedBU) {
  if (session.role === 'central_admin' || session.role === 'viewer') {
    return requestedBU || null;
  }
  if (!session.bu) {
    throw new Error('FORBIDDEN: Tài khoản chưa được gán đơn vị kinh doanh.');
  }
  if (requestedBU && String(requestedBU) !== String(session.bu)) {
    throw new Error('FORBIDDEN: Bạn chỉ được xem dữ liệu của đơn vị ' + session.bu + '.');
  }
  return session.bu;
}

function assertCanEdit_(session, cycle) {
  assertRole_(session, ['bu_editor', 'central_admin']);
  assertBU_(session, cycle.business_unit_code);
  if (cycle.status === 'approved' || cycle.status === 'locked') {
    throw new Error('Chu kỳ đã được duyệt/khoá, không thể chỉnh sửa.');
  }
}

