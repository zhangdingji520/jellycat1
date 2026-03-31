export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, country, apiKey } = req.body;
  if (!query || !country || !apiKey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    // 调用 Serper API，限制返回数量为 10，减少处理时间
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

    // 简单去重（避免复杂 URL 解析）
    const uniqueUrls = [...new Set(links)];
    // 将所有结果标记为 "buyable"（前端会展示为可购买）
    const results = uniqueUrls.map(url => ({ url, status: 'buyable' }));

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
