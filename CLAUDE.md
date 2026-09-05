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

## Chạy tay: chỉ mở Run.gs

**Mọi thao tác chạy tay nằm ở `gas/Run.gs`, tất cả đều KHÔNG THAM SỐ.** Mở file
đó, chọn tên hàm trong danh sách trên thanh công cụ, bấm Run. Không phải đi tìm
hàm ở file nào, không phải gõ tham số.

Lý do: nút Run của Apps Script **không truyền được tham số**. Hàm cần tham số
thì bấm Run là báo lỗi — và mỗi lần dùng lại phải tra xem gõ gì vào đâu.

Hai khuôn, dùng đúng một cách:

- **Việc có ghi dữ liệu** -> hai hàm riêng `run_<việc>_xemTruoc()` và
  `run_<việc>_ghiThat()`, **không phải một cờ `true`/`false`**. Tách đôi vì một
  cờ để quên ở trạng thái bật là ghi đè dữ liệu ngoài ý muốn.
- **Việc cần giá trị** -> hằng số VIẾT HOA ngay dòng đầu thân hàm.

**Thêm việc mới:** viết hàm nghiệp vụ ở file của nó như bình thường, rồi thêm
một vỏ bọc `run_*` không tham số vào `Run.gs`. Đừng bắt người dùng gõ tham số.

## Những chỗ đã trả giá để biết

**Nút Run trong trình soạn thảo Apps Script không truyền tham số.** Hàm cần
tham số phải có một hàm `run_*` bọc ngoài để bấm Run được. Đã vấp với
`setup_setPin`.

**`getValues()` trả về SỐ với mã toàn chữ số.** Mã người dùng như `3t` thì
không sao, nhưng mã kiểu `0123` về thành số 123. Luôn `String(x).trim()`.

Chỗ này đã vấp bốn lần, và lần gần nhất (05/09/2026) là trong **React**, nơi
nó nguy hiểm hơn: `useState({ skuCode: product?.sku_code ?? '' })` trông đã an
toàn — `??` chỉ chặn null/undefined, không chặn number — rồi `form.skuCode.trim()`
nổ *lúc render*, làm mất CẢ TRANG chứ không phải một ô. Quy tắc: mọi giá trị đi
từ sheet vào state của form phải qua một hàm ép chuỗi **tại cửa vào**, đừng chữa
ở từng chỗ gọi `.trim()`. Xem `AddProductModal.jsx`.

**`setValues` ghi chuỗi số vào ô định dạng Tự động thì Sheets đổi nó thành
SỐ.** Đây là cách mã sản phẩm chuyển từ chữ sang số mà không ai đụng vào bảng
tính: `writeRowPatch_` ghi lại CẢ DÒNG, `upsertRows_` ghi lại CẢ BẢNG — nên
sửa một sản phẩm là đổi kiểu dòng đó, dán hàng loạt một lần là đổi kiểu cả
danh mục. Mã có số 0 đứng đầu thì mất số 0 vĩnh viễn. Mọi đường ghi vào
Products phải gọi `giuCotMaDangChu_()` trước. Kiểm bằng `run_baoCao_kieuMa()`.

**`obj[key]` tự ép chuỗi, `Set.has` và `Map.has` thì KHÔNG.** Hệ quả trực tiếp
của điều trên, và là lý do lỗi kiểu mã chỉ hiện ở vài chỗ chứ không phải khắp
nơi. `forecastMap[`${sku}_${m}`]` và `known[sku]` vẫn đúng khi mã là số;
`nonZeroSkus.has(p.sku_code)` thì trượt sạch và quét trắng bảng, không báo gì.
Dựng Set/Map từ mã SKU thì **cả hai phía** phải `String(x).trim()`. Đã vấp ở
`MonthlyForecast`, `WeeklyForecast` và `ImportForecastModal` cùng một ngày.

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

Nguồn giá Xuất khẩu theo thứ tự ưu tiên: `Details` của Operations2026 (đơn **đã
giao**) trước, thiếu mã nào mới lấy `PIDetails` của hub (**báo giá PI**, gồm cả
đơn chưa giao). Báo cáo in ra bao nhiêu mã đến từ mỗi nguồn.

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
