require('dotenv').config();
const express = require('express');
const compression = require('compression');
const path = require('path');
const cron = require('node-cron');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

// API routes (new Supabase-backed backend)
const apiRouter = require('./api');
app.use('/api', apiRouter);

// Serve static files
app.use(express.static(__dirname));

// Serve main app for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'shopee-live-creator-match-supabase.html'));
});

// Schedule hourly sync of managed sellers/affiliates (every hour at :05 past)
cron.schedule('5 * * * *', async () => {
  console.log('[CRON] Starting hourly sync of managed data...');
  try {
    const result = await fetch(`http://localhost:${PORT}/api/syncManagedData`, {
      method: 'POST'
    }).then(r => r.json());
    console.log('[CRON] Sync complete:', result);
  } catch (err) {
    console.error('[CRON] Sync failed:', err.message);
  }
});

// Schedule daily sync to Google Sheets (every day at 2:00 AM)
cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] Starting daily Google Sheets sync...');
  try {
    const result = await fetch(`http://localhost:${PORT}/api/sync-google-sheets`, {
      method: 'POST'
    }).then(r => r.json());
    console.log('[CRON] Google Sheets sync complete:', result);
  } catch (err) {
    console.error('[CRON] Google Sheets sync failed:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
