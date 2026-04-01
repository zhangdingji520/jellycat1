const express = require('express');
const app = express();
app.use(express.json());

app.post('/api/search', async (req, res) => {
  const { query, country, apiKey } = req.body;
  if (!query || !country || !apiKey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: country, num: 10 }),
    });
    const data = await response.json();
    const links = (data.organic || []).map(item => item.link).filter(Boolean);
    const uniqueUrls = [...new Set(links)];
    const results = uniqueUrls.map(url => ({ url, status: 'buyable' }));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
