# FC App — Sale Forecast

Kho `karofisale/FC`. Chạy tại `https://karofisale.github.io/FC/`.

Hai nửa trong một kho: `client/` (React 19 + Vite + Tailwind v4) và `gas/`
(backend Apps Script). **Hai nửa deploy bằng hai đường hoàn toàn khác nhau** —
đây là chỗ dễ nhầm nhất.

## Deploy

**Client** — push lên `main`, GitHub Actions tự `npm ci` → `npm run lint` →
`npm run build` → đẩy `client/dist`. Không phải build tay, không commit `dist`
(nó không được theo dõi). **Lint chạy trong CI**, nên chạy trước khi push:

```bash
cd "D:/Antigravity/FC App/client" && npm run lint
```

Hiện có nhiều cảnh báo cũ nhưng exit 0. Thêm *lỗi* mới là CI đỏ.

**Backend** — `clasp push` là CHƯA ĐỦ. Nó chỉ đổi HEAD, còn URL `/exec` phục vụ
một ảnh chụp phiên bản. Phải redeploy đúng deployment ghi trong
`gas/deployment.json`:

```bash
cd "D:/Antigravity/FC App/gas" && clasp push -f && clasp redeploy AKfycbyyzw_uTdteqLobl6TB1DvcBxqE4BiorHFksXLx4Zc5jItQJD943vjXSynAecurccmS -d "mô tả"
```

Số `@n` tăng lên là bằng chứng bản mới đã tới người dùng.

## Những chỗ đã trả giá để biết

**Nút Run trong trình soạn thảo Apps Script không truyền tham số.** Hàm cần
tham số phải có một hàm `run_*` bọc ngoài để bấm Run được. Đã vấp với
`setup_setPin`.

**`getValues()` trả về SỐ với mã toàn chữ số.** Mã người dùng như `3t` thì
không sao, nhưng mã kiểu `0123` về thành số 123. Luôn `String(x).trim()`.

**`sourcemap: true` trong `vite.config.js` là cố ý**, không phải bỏ quên — để
đọc được stack trace thật khi người dùng gửi lỗi từ Console.

## Quy ước backend không được phá

- Mọi action đi qua `requireSession_` trong `Router.gs`. Không có ngoại lệ.
- Action ghi nằm trong `WRITE_ACTIONS` và chạy trong `runExclusive_`, và **đọc
  dữ liệu phải nằm BÊN TRONG khoá**. Bản cũ prefetch ngoài khoá và làm mất số
  của người lưu trước mà không báo lỗi gì.
- `NON_IDEMPOTENT_ACTIONS` trong `client/src/services/gasClient.js` liệt kê các
  action **không được tự thử lại**. Thêm action tạo mới thì thêm vào đây.
- PIN tối thiểu 6 ký tự, khoá tài khoản 15 phút sau 5 lần sai (`Config.gs`).

## Đồng bộ giá từ OEM và Xuất khẩu

`gas/PriceSync.gs` ghi `avg_price` của danh mục từ số bán thật của hai app kia.
Chạy `adminReportPrices()` xem trước, `adminSyncPrices(true)` mới ghi.

Bốn quyết định đã chốt nằm ở đầu file đó, đừng đảo lại mà không đọc: quy về
VND tại lúc đồng bộ (không phải lúc đọc), tỷ giá lấy từ ô `Exchange_Rate` của
hub, **bình quân gia quyền** chứ không phải trung bình cộng đơn giá, và chỉ lấy
12 tháng gần nhất.

Con số ở đây sẽ **khác** màn hình OEM — có chủ ý: OEM dùng trung bình cộng đơn
giá (hợp cho việc nhập đơn), FC cần doanh thu kỳ vọng trên mỗi đơn vị. Ca đầu
tiên trong `test/pricesync.test.js` chốt đúng chỗ đó.

```bash
node test/pricesync.test.js gas/PriceSync.gs
```

## Liên quan tới app khác

`gas/KarofiToken.gs` và `client/src/services/karofiSession.js` là **bản sao** —
bản gốc ở `D:\Operation\Claude\Projects\Karofi-ID`. Sửa ở đây
mà không chép sang OEM/Export là ba app trôi lệch nhau. Bộ test của Karofi ID
đọc thẳng các file này bằng đường dẫn tuyệt đối, nên **đổi tên hoặc di chuyển
kho này sẽ làm bộ test đó gãy**.

Thang màu `--color-blue-*` trong `client/src/index.css` là nhận diện Karofi dùng
chung cả bốn bề mặt. Bậc 500 là mã logo `#00A0E9`, chỉ dùng cho mảng màu và
viền; bậc 600 `#007CB8` mới là nền đặt chữ trắng lên (4,59:1). **Đừng đặt chữ
trắng lên bậc 500** — 2,91:1, không đạt.
