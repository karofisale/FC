/**
 * check-contrast.mjs — đo TƯƠNG PHẢN WCAG THẬT của giao diện sáng FC (Rà soát 4 app, Đợt 2 mục 8).
 *
 *   node tools/check-contrast.mjs          # in các cặp chữ/nền < 4,5:1 (chữ thường) hoặc < 3:1 (chữ to)
 *
 * Không đoán: màu lấy từ CHÍNH theme của Tailwind (node_modules/tailwindcss/theme.css, dạng oklch) cộng
 * thang `--color-blue-*` của Karofi ở client/src/index.css (hex), đổi sang sRGB rồi tính độ sáng tương đối
 * theo WCAG 2.x. Quét mã nguồn client/src tìm các cụm lớp Tailwind có `text-<màu>-<bậc>` và ghép với `bg-…`
 * cùng cụm (không có thì nền mặc định của khu vực đó: trắng; Header / Sidebar / Login nền tối được khai ở
 * NEN_THEO_FILE).
 *
 * Phạm vi và giới hạn (nói rõ để không tin quá mức):
 *  - Chỉ chấm cặp chữ THƯỜNG và chữ TO có nền xác định được từ chính cụm lớp, hoặc nền trắng mặc định.
 *    Cụm lớp có nền trong suốt (bg-xxx/60), biến thể (hover:, focus:, disabled:…) và icon (có cả w-N lẫn h-N) bị bỏ qua.
 *  - Chữ rất sáng không có nền (độ sáng > 0,55) coi như nằm trên nền tối của phần tử cha và bỏ qua.
 *  - Chỉ có giao diện SÁNG: FC chưa có giao diện tối (làm sau).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(AQUI, '..', 'client');

// ---------- màu ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** oklch(L% C H) -> sRGB tuyến tính {r,g,b} (cắt gam đơn giản). */
function oklchToLinear(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return {
    r: clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  };
}

function hexToLinear(hex) {
  const n = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return { r: lin(v[0]), g: lin(v[1]), b: lin(v[2]) };
}

export function luminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(c1, c2) {
  const a = luminance(c1), b = luminance(c2);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

let PALETTE = null;
export function palette() {
  if (PALETTE) return PALETTE;
  const p = { white: { r: 1, g: 1, b: 1 }, black: { r: 0, g: 0, b: 0 } };
  const theme = fs.readFileSync(path.join(CLIENT, 'node_modules/tailwindcss/theme.css'), 'utf8');
  for (const m of theme.matchAll(/--color-([a-z]+-\d{2,3}):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)) {
    p[m[1]] = oklchToLinear(Number(m[2]) / 100, Number(m[3]), Number(m[4]));
  }
  // Thang blue của Karofi ghi đè (hex) trong index.css
  const css = fs.readFileSync(path.join(CLIENT, 'src/index.css'), 'utf8');
  for (const m of css.matchAll(/--color-(blue-\d{2,3}):\s*(#[0-9a-fA-F]{6})/g)) p[m[1]] = hexToLinear(m[2]);
  PALETTE = p;
  return p;
}

export const colorOf = (name) => palette()[name];
export const ratio = (fgName, bgName) => contrast(colorOf(fgName), colorOf(bgName));

// ---------- quét mã nguồn ----------
// Nền mặc định theo file khi cụm lớp không tự nêu nền. Mảng = các nền có thể có của phần tử cha: đạt trên MỘT trong số đó là
// chấp nhận (Header có cả thanh xanh đậm lẫn menu thả trắng; Login có nền tối quanh thẻ trắng).
const NEN_THEO_FILE = {
  'components/Sidebar.jsx': ['slate-900'],
  'components/Header.jsx': ['blue-900', 'white'],
  'pages/Login.jsx': ['slate-900', 'white'],
  'components/KarofiMark.jsx': ['blue-900']
};
const BO_QUA_FILE = [/\/dev\//];

const TOKEN = /^[A-Za-z0-9:\-/[\].%#!]+$/;
const TEXT_RE = /^text-(white|black|[a-z]+-\d{2,3})$/;
const BG_RE = /^bg-(white|black|[a-z]+-\d{2,3})(?:\/(\d+))?$/;
const SIZE_LON = /^text-(xl|2xl|3xl|4xl|5xl)$/;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(jsx|js)$/.test(e.name)) yield p;
  }
}

/** Tách văn bản thành các cụm token cách nhau bằng khoảng trắng đơn; mỗi cụm là một "danh sách lớp" ứng viên. */
function* cacCum(text) {
  const re = /[A-Za-z0-9:\-/[\].%#!]+(?: [A-Za-z0-9:\-/[\].%#!]+)*/g;
  let m;
  while ((m = re.exec(text))) {
    const toks = m[0].split(' ').filter((t) => TOKEN.test(t));
    if (toks.some((t) => TEXT_RE.test(t))) yield { toks, index: m.index };
  }
}

export function scan(opts = {}) {
  const root = opts.root || path.join(CLIENT, 'src');
  const out = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (BO_QUA_FILE.some((r) => r.test('/' + rel))) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const { toks, index } of cacCum(text)) {
      if (toks.some((t) => t.includes(':'))) {
        // Biến thể hover:/focus:/disabled: — chỉ chấm phần không biến thể, nhưng bỏ cả cụm nếu CHỈ có biến thể.
      }
      const goc = toks.filter((t) => !t.includes(':'));
      const texts = goc.map((t) => t.match(TEXT_RE)).filter(Boolean).map((m) => m[1]);
      if (texts.length !== 1) continue;                       // nhiều màu chữ trong một cụm = điều kiện lẫn nhau, không chấm
      if (goc.some((t) => /^w-\d/.test(t)) && goc.some((t) => /^h-\d/.test(t))) continue;   // icon
      const bgs = goc.map((t) => t.match(BG_RE)).filter(Boolean);
      if (bgs.length > 1) continue;
      if (bgs.length === 1 && bgs[0][2] && Number(bgs[0][2]) < 100) continue;                // nền trong suốt: không xác định được
      const fg = texts[0];
      const lon = goc.some((t) => SIZE_LON.test(t)) && goc.includes('font-bold');
      const nguong = lon || goc.some((t) => /^text-(2xl|3xl|4xl|5xl)$/.test(t)) ? 3 : 4.5;
      const nenUngVien = bgs.length ? [bgs[0][1]] : (NEN_THEO_FILE[rel] || ['white']);
      if (!bgs.length && luminance(colorOf(fg)) > 0.55) continue;   // chữ rất sáng không nền: nằm trên nền tối của phần tử cha
      const kq = nenUngVien.map((bg) => ({ bg, r: ratio(fg, bg) }));
      const tot = kq.reduce((a, b) => (b.r > a.r ? b : a));
      if (tot.r + 1e-9 >= nguong) continue;
      const dong = text.slice(0, index).split('\n').length;
      out.push({ file: rel, line: dong, fg, bg: tot.bg, ratio: Math.round(tot.r * 100) / 100, nguong, cum: goc.join(' ') });
    }
  }
  return out;
}

// ---------- chạy tay ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = scan();
  const theoCap = new Map();
  for (const b of bad) {
    const k = `text-${b.fg} / bg-${b.bg}`;
    theoCap.set(k, (theoCap.get(k) || 0) + 1);
  }
  console.log(`Tương phản giao diện SÁNG — ${bad.length} cụm dưới ngưỡng\n`);
  [...theoCap.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    const [fg, bg] = k.split(' / ').map((s) => s.replace(/^(text|bg)-/, ''));
    console.log(String(n).padStart(4), k.padEnd(34), ratio(fg, bg).toFixed(2) + ':1');
  });
  if (process.argv.includes('--chi-tiet')) bad.forEach((b) => console.log(`${b.file}:${b.line}  ${b.ratio}:1 (cần ${b.nguong})  ${b.cum}`));
  process.exitCode = bad.length ? 1 : 0;
}
