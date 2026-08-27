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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gasDir = join(root, 'gas');
const pushOnly = process.argv.includes('--push');

function fail(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`  ${hint}\n`);
  process.exit(1);
}

function run(args) {
  const res = spawnSync('npx', ['clasp', ...args], {
    cwd: gasDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (res.status !== 0) fail(`Lệnh "clasp ${args.join(' ')}" thất bại.`);
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
run(['deploy', '-i', deploymentId, '-d', `${description || 'FC App'} — ${stamp}`]);

console.log('\n✔ Xong. URL /exec giữ nguyên, người dùng chỉ cần tải lại trang.\n');
