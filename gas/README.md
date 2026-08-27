# Backend Apps Script — FC App

8 file `.gs` trong thư mục này tạo thành một dự án Apps Script độc lập
(Standalone), gắn với Google Sheet CSDL bằng `SPREADSHEET_ID` trong
[Config.gs](Config.gs). Apps Script gộp mọi file `.gs` vào chung một phạm vi
toàn cục khi chạy, nên việc chia file chỉ để dễ đọc — `Router.gs` gọi thẳng
hàm ở `Auth.gs`, `Queries.gs`… mà không cần import.

| File | Vai trò |
|---|---|
| `Config.gs` | ID Sheet, tên các bảng, lược đồ cột, tham số bảo mật |
| `Router.gs` | `doGet`/`doPost`, bảng điều phối action |
| `Auth.gs` | Đăng nhập PIN, phiên (token), phân quyền theo vai trò/đơn vị |
| `Queries.gs` | Toàn bộ action đọc |
| `Mutations.gs` | Toàn bộ action ghi (chu kỳ, kế hoạch, phê duyệt) |
| `SheetDb.gs` | Lớp đọc/ghi Google Sheets theo khối, đối chiếu theo tên cột |
| `Utils.gs` | Hàm dùng chung (chuẩn hoá tháng, khoá ghi, ...) |
| `Admin.gs` | `setupDatabase()`, `adminSetPin()` — chạy tay trong editor |

## Cài đặt lần đầu

```bash
npm install -D @google/clasp     # đã có sẵn trong package.json gốc, chỉ cần npm install ở thư mục gốc
npm run gas:login                # mở trình duyệt đăng nhập tài khoản Google có quyền trên Sheet CSDL
```

Tạo dự án Apps Script (một lần duy nhất) — chọn MỘT trong hai cách:

**A. Đã có dự án Apps Script sẵn** (ví dụ bản deploy hiện tại `1Iq9GT…`):
lấy Script ID ở Apps Script Editor → *Cài đặt dự án* → *ID tập lệnh*, rồi:

```bash
cp gas/.clasp.json.example gas/.clasp.json
# sửa "scriptId" trong gas/.clasp.json thành ID vừa lấy
npm run gas:push                 # đẩy code hiện tại lên, ghi đè bản cũ
```

**B. Tạo dự án mới từ đầu:**

```bash
cd gas
npx clasp create --type standalone --title "Karofi FC App Backend" --rootDir .
cd ..
```

Lệnh trên tự sinh `gas/.clasp.json`.

## Nạp danh mục & tạo PIN lần đầu

1. Mở dự án trong trình duyệt: `npm run gas:open`
2. Trong Editor, chọn hàm `setupDatabase` ở `Admin.gs` → **Run**. Lần đầu
   Google sẽ hỏi cấp quyền truy cập Sheet — đồng ý. Hàm này tạo đủ sheet,
   header, danh mục BU/Region/ProductGroup và 8 tài khoản mẫu (chưa có PIN).
3. Đặt PIN cho từng tài khoản, chạy trong editor (hoặc dùng Terminal của
   Apps Script nếu bật): chọn hàm `adminSetPin`, sửa tham số rồi Run —
   hoặc gõ trực tiếp vào ô "Execute function" nếu editor hỗ trợ:
   ```
   adminSetPin('u-admin-1', '123456')
   adminSetPin('u-gt2-ed', '246810')
   ...
   ```
   PIN tối thiểu 6 chữ số, không được là dãy trùng (`111111`) hay liên tiếp
   (`123456` bị chặn — chọn PIN khác dạng đó).
4. Nạp 1.141 SKU từ file Excel gốc lên Sheet:
   ```bash
   GAS_USER=u-admin-1 GAS_PIN=<pin vừa đặt> npm run seed:products
   ```

## Triển khai Web App

Lần đầu, tạo bản triển khai qua trình duyệt (Deploy → New deployment → Web
app → Execute as **Me**, Who has access **Anyone**) để lấy URL `/exec` và
`deploymentId`, rồi:

```bash
cp gas/deployment.json.example gas/deployment.json
# điền deploymentId (xem: npm run gas:deployments)
```

Dán URL `/exec` vào `client/src/services/gasClient.js` (biến `GAS_WEB_APP_URL`)
hoặc đặt biến môi trường build `VITE_GAS_URL`.

Từ lần sau, mỗi khi sửa code trong `gas/*.gs`:

```bash
npm run gas:deploy      # push code + cập nhật ĐÚNG bản triển khai cũ (URL không đổi)
```

Chỉ muốn đẩy code lên để xem trong Editor mà chưa cho người dùng thấy:

```bash
npm run gas:push
```

## Vì sao không tạo bản triển khai mới mỗi lần?

`clasp deploy` không tham số sẽ tạo **bản triển khai mới** với URL `/exec`
khác — người dùng đang mở app cũ sẽ gọi vào phiên bản không còn cập nhật.
`tools/gas-deploy.mjs` luôn gọi `clasp deploy -i <deploymentId>` để cập nhật
tại chỗ bản đang chạy, giữ nguyên URL.

## An toàn khi Web App ở chế độ "Anyone"

Repo này (đúng theo thiết kế GitHub Pages, không server riêng) buộc phải
để Web App ở chế độ truy cập công khai — bất kỳ ai cũng gọi được `/exec`.
An toàn không đến từ việc giấu URL (URL nằm trong bundle JS công khai), mà
từ việc **mọi action trừ `ping`/`login` đều đòi token hợp lệ**
(`Auth.gs: requireSession_`), và PIN không nằm trong Sheet dưới dạng đọc
được — chỉ có SHA-256 hash cộng "pepper" lưu trong Script Properties
(`Auth.gs: hashPin_`, không xuất hiện trong bất kỳ file `.gs` nào ở dạng
thô). Nếu nghi ngờ có token bị lộ, chạy `adminRevokeAllSessions()` trong
Admin.gs để huỷ toàn bộ phiên đang mở.
