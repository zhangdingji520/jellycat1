export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, country, apiKey } = req.body;
  if (!query || !country || !apiKey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    // 1. 调用 Serper API
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: country }),
    });

    const data = await response.json();
    const links = (data.organic || []).map(item => item.link).filter(Boolean);

    // 2. 域名去重（每个域名只保留第一个 URL）
    const domainMap = new Map();
    for (const url of links) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        if (!domainMap.has(host)) domainMap.set(host, url);
      } catch (e) {
        // 忽略无效 URL
      }
    }
    const uniqueUrls = Array.from(domainMap.values());

    // 3. 将所有结果标记为 "buyable"（因为无库存检测）
    const results = uniqueUrls.map(url => ({ url, status: 'buyable' }));

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
