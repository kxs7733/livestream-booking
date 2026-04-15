const express = require('express');
const compression = require('compression');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(compression());

// Serve static files
app.use(express.static(__dirname));

// Serve main app for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'shopee-live-creator-match.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
