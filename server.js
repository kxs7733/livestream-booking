require('dotenv').config();
const express = require('express');
const compression = require('compression');
const path = require('path');
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
  res.sendFile(path.join(__dirname, 'shopee-live-creator-match.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
