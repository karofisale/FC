/**
 * annualPlanSolver.js — GIẢI RÀNG BUỘC CHO KẾ HOẠCH NĂM (08/10/2026). Thuần, không phụ thuộc React / API.
 *
 * Bài toán (một tháng): có n ô số lượng x_i (khách × SKU). Các RÀNG BUỘC TUYẾN TÍNH Σ a_ij · x_i = b_j
 *  (doanh thu từng khách: a = đơn giá; tổng SL của một SKU / một Category: a = 1). Tìm x gần x0 nhất (tỷ lệ — khoảng cách bình phương có trọng số w_i = x0_i, tức mỗi ô co giãn
 *  theo tỷ lệ) mà thỏa mọi ràng buộc, x >= 0. Nghiệm đóng: x = x0 + W·Aᵀ·λ với (A·W·Aᵀ)·λ = b − A·x0; ô ra âm thì ghim về 0 rồi giải lại (tập hoạt động).
 * Ô trọng số 0 không được phép đổi (giữ x0). Ràng buộc mâu thuẫn / không đạt được -> trả về trong `loi` (không ném lỗi) để nơi gọi báo đúng ràng buộc nào bị vi phạm.
 */

const EPS_AM = 1e-9;

/**
 * @param {number[]} x0   giá trị khởi đầu của từng ô
 * @param {number[]} w    trọng số (0 = ô cố định, không đổi)
 * @param {{ cells: number[], coef: number[], b: number, nhan: any }[]} rows  ràng buộc: Σ coef[k]·x[cells[k]] = b (cả ô cố định tính vào Σ)
 * @returns {{ x: number[], loi: { nhan: any, du: number }[] }}  du = b − Σ (còn lệch sau khi giải)
 */
export function giaiRangBuoc(x0, w, rows) {
  const n = x0.length, m = rows.length;
  let tuDo = w.map((v) => v > 0);
  let x = x0.slice();
  // danh sách ràng buộc của từng ô
  const ct = Array.from({ length: n }, () => []);
  rows.forEach((r, j) => r.cells.forEach((i, k) => { if (r.coef[k] !== 0) ct[i].push([j, r.coef[k]]); }));

  for (let vong = 0; vong < 60; vong++) {
    x = x0.map((v, i) => (tuDo[i] ? v : (w[i] > 0 ? 0 : v)));       // ô bị ghim về 0 (do âm) = 0; ô trọng số 0 giữ x0
    if (m) {
      const N = Array.from({ length: m }, () => new Float64Array(m));
      const r = new Float64Array(m);
      rows.forEach((row, j) => { r[j] = row.b; row.cells.forEach((i, k) => { r[j] -= row.coef[k] * x[i]; }); });
      for (let i = 0; i < n; i++) {
        if (!tuDo[i]) continue;
        const c = ct[i], wi = w[i];
        for (let p = 0; p < c.length; p++) for (let q = 0; q < c.length; q++) N[c[p][0]][c[q][0]] += c[p][1] * c[q][1] * wi;
      }
      // chuẩn hóa dòng / cột về đường chéo 1 để các ràng buộc khác đơn vị (VNĐ vs cái) không lệch cỡ
      const s = new Float64Array(m);
      for (let j = 0; j < m; j++) s[j] = N[j][j] > 1e-18 ? 1 / Math.sqrt(N[j][j]) : 0;
      const A = Array.from({ length: m }, (_, j) => { const row = new Float64Array(m + 1); for (let k = 0; k < m; k++) row[k] = N[j][k] * s[j] * s[k]; row[j] += 1e-9; row[m] = r[j] * s[j]; return row; });
      const lam = giaiHeTuyenTinh(A, m);
      for (let i = 0; i < n; i++) {
        if (!tuDo[i]) continue;
        let d = 0;
        const c = ct[i];
        for (let p = 0; p < c.length; p++) d += c[p][1] * lam[c[p][0]] * s[c[p][0]];
        x[i] = x0[i] + w[i] * d;
      }
    }
    let am = false;
    for (let i = 0; i < n; i++) if (tuDo[i] && x[i] < -EPS_AM) { tuDo[i] = false; am = true; }
    if (!am) break;
  }
  for (let i = 0; i < n; i++) if (x[i] < 0) x[i] = 0;
  const loi = [];
  rows.forEach((row) => {
    let tong = 0, mo = Math.abs(row.b);
    row.cells.forEach((i, k) => { tong += row.coef[k] * x[i]; mo += Math.abs(row.coef[k] * x[i]); });
    const du = row.b - tong;
    if (Math.abs(du) > 1e-6 * Math.max(1, mo)) loi.push({ nhan: row.nhan, du });
  });
  return { x, loi };
}

/** Khử Gauss có chọn trụ cho hệ [A | b] cỡ m (A đã cộng ridge nhỏ); trả nghiệm. Trụ gần 0 (ràng buộc phụ thuộc) -> ẩn đó = 0. */
function giaiHeTuyenTinh(M, m) {
  for (let c = 0; c < m; c++) {
    let t = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[t][c])) t = r;
    if (Math.abs(M[t][c]) < 1e-12) continue;
    if (t !== c) { const tmp = M[t]; M[t] = M[c]; M[c] = tmp; }
    for (let r = c + 1; r < m; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Float64Array(m);
  for (let c = m - 1; c >= 0; c--) {
    if (Math.abs(M[c][c]) < 1e-12) { x[c] = 0; continue; }
    let v = M[c][m];
    for (let k = c + 1; k < m; k++) v -= M[c][k] * x[k];
    x[c] = v / M[c][c];
  }
  return x;
}
