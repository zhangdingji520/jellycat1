export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, country, apiKey } = req.body;
  if (!query || !country || !apiKey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    // 1. 调用 Serper API 获取 URL
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

    // 2. 轻量库存检测（只检查标题或页面顶部文本，并发低）
    const soldOutKeywords = [
      'sold out', 'out of stock', 'ausverkauft', 'nicht vorrätig', 'épuisé',
      'indisponible', 'niedostępny', 'uitverkocht', 'agotado', 'esgotado'
    ];
    const inStockKeywords = [
      'in stock', 'available', 'auf lager', 'en stock', 'disponible', 'op voorraad'
    ];

    // 并发检测，但限制并发数为 5
    const verify = async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // 3秒超时
        const pageRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!pageRes.ok) return { url, status: 'unknown' };
        const html = await pageRes.text();
        const text = html.toLowerCase();
        if (soldOutKeywords.some(kw => text.includes(kw))) return { url, status: 'sold_out' };
        if (inStockKeywords.some(kw => text.includes(kw))) {
          // 可选：美元网站排除
          if ((text.includes('$') || text.includes('usd')) && !(text.includes('€') || text.includes('eur'))) {
            return { url, status: 'usd_excluded' };
          }
          return { url, status: 'buyable' };
        }
        return { url, status: 'unknown' };
      } catch (err) {
        return { url, status: 'unknown' };
      }
    };

    // 限制并发数为 5
    const results = [];
    for (let i = 0; i < uniqueUrls.length; i += 5) {
      const batch = uniqueUrls.slice(i, i + 5);
      const batchResults = await Promise.all(batch.map(verify));
      results.push(...batchResults);
    }

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
