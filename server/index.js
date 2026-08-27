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

// Serve client build if available
const clientBuildPath = path.join(__dirname, '../client/dist');
if (require('fs').existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.use((req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Karofi Sales Forecast Backend API running at http://localhost:${PORT}`);
});
