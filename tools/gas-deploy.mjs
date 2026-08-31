#!/usr/bin/env node
/**
 * Push code lên Apps Script rồi cập nhật ĐÚNG bản triển khai đang chạy.
 *
 * Điểm quan trọng: dùng `clasp deploy -i <deploymentId>` thay vì tạo bản
 * triển khai mới, nhờ vậy URL /exec không đổi và không phải sửa lại
 * client/src/services/gasClient.js sau mỗi lần deploy.
 *
 *   node tools/gas-deploy.mjs            # push + deploy
 *   node tools/gas-deploy.mjs --push     # chỉ push, không deploy
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gasDir = join(root, 'gas');
const pushOnly = process.argv.includes('--push');

function fail(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`  ${hint}\n`);
  process.exit(1);
}

/**
 * Bẫy đã làm mất thời gian ba lần: `npx clasp` ưu tiên clasp cài CỤC BỘ
 * trong node_modules (v2), còn khi gõ `clasp login` thẳng ở terminal thì lại
 * trúng bản cài TOÀN CỤC (v3). Hai bản đọc HAI KHOÁ KHÁC NHAU trong cùng
 * file ~/.clasprc.json: v2 dùng "token", v3 dùng "tokens".
 *
 * Hệ quả: đăng nhập lại bằng bản này không làm mới cho bản kia, nên deploy
 * vẫn báo invalid_grant ngay sau khi vừa đăng nhập thành công — và thông báo
 * của clasp không hề nói ra điều đó. Chỉ ra tận nơi thay vì để tự đoán.
 */
function explainInvalidGrant() {
  const version = spawnSync('npx', ['clasp', '--version'], {
    cwd: gasDir, encoding: 'utf8', shell: process.platform === 'win32'
  }).stdout?.trim() || '?';
  const major = Number(String(version).split('.')[0]) || 0;
  const keyUsed = major >= 3 ? 'tokens' : 'token';

  let other = '';
  try {
    const rc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
    const otherKey = keyUsed === 'token' ? 'tokens' : 'token';
    if (!rc[keyUsed] && rc[otherKey]) {
      other = `\n  Trong ~/.clasprc.json hiện CHỈ có khoá "${otherKey}" — tức lần đăng nhập` +
              `\n  gần nhất là của bản clasp KHÁC, không phải bản đang chạy ở đây.`;
    }
  } catch { /* không đọc được thì bỏ qua, phần gợi ý bên dưới vẫn đúng */ }

  console.error(
    `\n  Phiên đăng nhập clasp đã hết hạn hoặc bị thu hồi (invalid_grant).` +
    `\n  Lệnh này dùng clasp v${version}, đọc khoá "${keyUsed}" trong ~/.clasprc.json.` +
    other +
    `\n\n  Đăng nhập lại ĐÚNG bản đó bằng:  npx clasp login` +
    `\n  (gõ \`clasp login\` trống sẽ trúng bản toàn cục và KHÔNG sửa được lỗi này.)\n`
  );
}

/**
 * Trên Windows phải chạy qua shell mới gọi được npx, mà shell thì NỐI thẳng
 * các tham số thành một chuỗi. Phần mô tả bản triển khai có dấu cách (ví dụ
 * "FC App - 2026-08-31 20:55") vì thế bị tách thành nhiều tham số rời, và
 * clasp báo "too many arguments". Bọc dấu nháy để shell trả lại đúng một
 * tham số.
 */
function quoteForShell(arg) {
  return /[\s"]/.test(arg) ? '"' + String(arg).replace(/"/g, '\\"') + '"' : arg;
}

function run(args) {
  const useShell = process.platform === 'win32';
  const res = spawnSync(
    'npx',
    useShell ? ['clasp', ...args].map(quoteForShell) : ['clasp', ...args],
    { cwd: gasDir, stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8', shell: useShell }
  );

  const out = (res.stdout || '') + (res.stderr || '');
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  if (res.status !== 0) {
    if (out.includes('invalid_grant')) explainInvalidGrant();
    fail(`Lệnh "clasp ${args.join(' ')}" thất bại.`);
  }

  // clasp v3 THOÁT VỚI MÃ 0 kể cả khi từ chối tham số ("error: too many
  // arguments"). Đã có một lần script báo "✔ Xong" trong khi bản triển khai
  // không hề được cập nhật — tức người dùng vẫn chạy mã cũ mà tưởng đã lên
  // bản mới. Vì vậy không tin mã thoát, phải đọc chính đầu ra của clasp.
  if (/^error:/m.test(out)) {
    fail(`Lệnh "clasp ${args.join(' ')}" báo lỗi (dù mã thoát là 0).`);
  }
  return out;
}

if (!existsSync(join(gasDir, '.clasp.json'))) {
  fail(
    'Thiếu gas/.clasp.json.',
    'Chép gas/.clasp.json.example thành gas/.clasp.json rồi điền scriptId ' +
    '(lấy ở Apps Script > Cài đặt dự án > ID tập lệnh).'
  );
}

console.log('→ Đẩy mã nguồn lên Apps Script...');
run(['push', '-f']);

if (pushOnly) {
  console.log('\n✔ Đã push. Bản triển khai cũ vẫn chạy mã cũ cho tới khi deploy.\n');
  process.exit(0);
}

const deployFile = join(root, 'gas', 'deployment.json');
if (!existsSync(deployFile)) {
  fail(
    'Thiếu gas/deployment.json.',
    'Chép gas/deployment.json.example thành gas/deployment.json rồi điền deploymentId\n' +
    '  (chạy `npx clasp deployments` trong thư mục gas để xem danh sách).\n' +
    '  Dùng đúng deploymentId của bản đang chạy để giữ nguyên URL /exec.'
  );
}

const { deploymentId, description } = JSON.parse(readFileSync(deployFile, 'utf8'));
if (!deploymentId || deploymentId.startsWith('DÁN_')) {
  fail('deploymentId trong gas/deployment.json chưa được điền.');
}

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
console.log(`→ Cập nhật bản triển khai ${deploymentId}...`);
const deployOut = run(['deploy', '-i', deploymentId, '-d', `${description || 'FC App'} - ${stamp}`]);

// Xác nhận bằng chính dòng clasp in ra: "Deployed <id> @<version>". Không
// thấy dòng này nghĩa là bản đang chạy vẫn là mã cũ, dù không báo lỗi.
const deployed = deployOut.match(/Deployed\s+(\S+)\s+@(\d+)/);
if (!deployed || deployed[1] !== deploymentId) {
  fail(
    'Không xác nhận được bản triển khai đã cập nhật.',
    'Mã nguồn đã push lên Apps Script nhưng URL /exec VẪN CHẠY MÃ CŨ.\n' +
    '  Kiểm tra bằng: npx clasp deployments'
  );
}

console.log(`\n✔ Xong — bản triển khai @${deployed[2]}. URL /exec giữ nguyên, người dùng chỉ cần tải lại trang.\n`);
