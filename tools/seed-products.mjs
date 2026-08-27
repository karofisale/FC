#!/usr/bin/env node
/**
 * Nạp danh mục SKU lên Google Sheet CSDL qua API (cần tài khoản central_admin).
 *
 * Chạy một lần sau setupDatabase() để Sheet có dữ liệu thật, thay cho việc
 * app đọc mock trong localStorage như bản cũ.
 *
 * Dùng cờ dòng lệnh (chạy giống nhau trên PowerShell, cmd.exe, bash):
 *   node tools/seed-products.mjs --user admin --pin 123456
 *   node tools/seed-products.mjs --user admin --pin 123456 --file ./danh-muc.json
 *
 * Bỏ qua --pin để được hỏi nhập ẩn (khuyên dùng — PIN không lưu vào lịch
 * sử lệnh của shell):
 *   node tools/seed-products.mjs --user admin
 *
 * Cũng nhận qua biến môi trường GAS_USER / GAS_PIN nếu không truyền cờ
 * (cú pháp `VAR=value lệnh` chỉ chạy trên bash — trên PowerShell dùng:
 *   $env:GAS_USER='admin'; $env:GAS_PIN='123456'; npm run seed:products).
 *
 * GAS_URL (tuỳ chọn): URL Web App, mặc định lấy từ client/src/services/gasClient.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHUNK_SIZE = 200;

function resolveUrl() {
  if (process.env.GAS_URL) return process.env.GAS_URL;
  const src = readFileSync(join(root, 'client/src/services/gasClient.js'), 'utf8');
  const match = src.match(/'(https:\/\/script\.google\.com\/macros\/s\/[^']+)'/);
  if (!match) throw new Error('Không tìm thấy URL trong gasClient.js — truyền GAS_URL.');
  return match[1];
}

async function call(url, action, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Máy chủ trả về dữ liệu không phải JSON:\n${text.slice(0, 300)}`);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function flagValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/**
 * Hỏi PIN mà không hiện ký tự lên màn hình. Đọc theo byte thay vì so
 * khớp chuỗi ký tự điều khiển, để tránh vướng lỗi mã hoá do các terminal
 * gửi phím Enter/Backspace/Ctrl+C khác nhau.
 */
const KEY_ENTER = [10, 13];      // LF, CR
const KEY_CTRL_C = 3;
const KEY_BACKSPACE = [8, 127];  // BS, DEL

function promptHiddenPin(question) {
  return new Promise((resolvePrompt, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('Không có PIN. Truyền --pin hoặc chạy trong terminal có thể nhập tương tác.'));
      return;
    }

    process.stdout.write(question);
    let value = '';

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    const onData = (buf) => {
      for (const code of buf) {
        if (KEY_ENTER.includes(code)) {
          cleanup();
          process.stdout.write('\n');
          resolvePrompt(value);
          return;
        }
        if (code === KEY_CTRL_C) {
          cleanup();
          process.stdout.write('\n');
          process.exit(130);
        }
        if (KEY_BACKSPACE.includes(code)) {
          value = value.slice(0, -1);
          continue;
        }
        value += String.fromCharCode(code);
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

const fileArg = process.argv.indexOf('--file');
const productsPath = fileArg > -1
  ? resolve(process.argv[fileArg + 1])
  : join(root, 'client/src/data/seedProducts.json');

const url = resolveUrl();
const user = flagValue('--user') || process.env.GAS_USER;

if (!user) {
  console.error(
    '✖ Thiếu mã người dùng.\n' +
    '  Ví dụ: node tools/seed-products.mjs --user admin\n' +
    "  (PowerShell: $env:GAS_USER='admin'; $env:GAS_PIN='123456'; npm run seed:products)"
  );
  process.exit(1);
}

const pin = flagValue('--pin') || process.env.GAS_PIN || await promptHiddenPin(`Mã PIN cho ${user}: `);
if (!pin) {
  console.error('✖ Thiếu mã PIN.');
  process.exit(1);
}

const products = JSON.parse(readFileSync(productsPath, 'utf8'));
if (!Array.isArray(products) || !products.length) {
  console.error(`✖ File ${productsPath} không chứa mảng sản phẩm.`);
  process.exit(1);
}

console.log(`→ Đăng nhập ${user}...`);
const session = await call(url, 'login', { userId: user, pin });
if (session.user?.role !== 'central_admin') {
  console.error(`✖ Tài khoản ${user} có vai trò "${session.user?.role}", cần central_admin để nạp danh mục.`);
  process.exit(1);
}

console.log(`→ Nạp ${products.length} SKU theo lô ${CHUNK_SIZE} dòng...`);
let inserted = 0;
let updated = 0;

for (let i = 0; i < products.length; i += CHUNK_SIZE) {
  const chunk = products.slice(i, i + CHUNK_SIZE);
  const res = await call(url, 'importProducts', {
    token: session.token,
    products: chunk,
    replace: i === 0   // lô đầu xoá sạch dữ liệu cũ, các lô sau nối tiếp
  });
  inserted += res.inserted || 0;
  updated += res.updated || 0;
  console.log(`   ${Math.min(i + CHUNK_SIZE, products.length)}/${products.length}`);
}

await call(url, 'logout', { token: session.token });

console.log(`\n✔ Xong: thêm mới ${inserted}, cập nhật ${updated}.\n`);
