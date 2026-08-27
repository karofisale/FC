/**
 * ⚠️  BACKEND CŨ — KHÔNG CÒN ĐƯỢC APP SỬ DỤNG.
 *
 * Từ v3.0, client chỉ nói chuyện với backend Apps Script trong thư mục gas/
 * (có xác thực PIN và phân quyền). File Express này giữ lại để tham chiếu
 * mô hình dữ liệu, KHÔNG có xác thực, và không được deploy ra ngoài.
 * Chạy bằng: npm run legacy:server
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, db } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Init database & run seed check
initDb();

// Seed check: if products table is empty, trigger seed script
const productCount = db.prepare(`SELECT COUNT(*) as count FROM products`).get().count;
if (productCount === 0) {
  console.log('Database empty. Running seed...');
  require('./db/seed');
}

// Mount Routes
app.use('/api/master', require('./routes/masterData'));
app.use('/api/cycles', require('./routes/forecastCycles'));
app.use('/api/forecast/monthly', require('./routes/monthlyForecast'));
app.use('/api/forecast/weekly', require('./routes/weeklyForecast'));
app.use('/api/summary', require('./routes/summary'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/actuals', require('./routes/actuals'));

// Route /api sai (không khớp router nào ở trên) phải trả JSON 404, không
// để lọt xuống catch-all bên dưới và trả về index.html với status 200 —
// client gọi nhầm endpoint sẽ thấy res.ok=true rồi vỡ khi res.json().
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Không có route API: ${req.method} ${req.originalUrl}` });
});

// Serve client build if available
const clientBuildPath = path.join(__dirname, '../client/dist');
if (require('fs').existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.use((req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}


console.warn('
[CẢNH BÁO] Đây là backend cũ không có xác thực. Chỉ dùng cục bộ để tham chiếu, không mở ra Internet.
');

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Karofi Sales Forecast Backend API running at http://localhost:${PORT}`);
});
