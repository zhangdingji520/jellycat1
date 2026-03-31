export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { query, country, apiKey } = req.body;
  if (!query || !country || !apiKey) return res.status(400).json({ error: 'Missing parameters' });

  // 1. 调用 Serper API 获取 URL 列表
  const serperRes = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: country })
  });
  const data = await serperRes.json();
  const urls = (data.organic || []).map(item => item.link).filter(Boolean);

  // 2. 去重域名（保留第一个 URL）
  const domainMap = new Map();
  for (const url of urls) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (!domainMap.has(host)) domainMap.set(host, url);
    } catch(e) {}
  }
  const uniqueUrls = Array.from(domainMap.values());

  // 3. 验证每个页面的库存（多线程，模拟 Python 脚本逻辑）
  const checkPage = async (url) => {
    try {
      const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!pageRes.ok) return { url, status: 'unknown', reason: `HTTP ${pageRes.status}` };
      const text = (await pageRes.text()).toLowerCase();
      
      const soldOutKeywords = [
        "sold out", "out of stock", "ausverkauft", "nicht vorrätig", "derzeit nicht verfügbar",
        "épuisé", "indisponible", "niedostępny", "uitverkocht", "agotado", "esgotado"
      ];
      const inStockKeywords = [
        "in stock", "available", "auf lager", "en stock", "disponible", "op voorraad", "na stanie"
      ];
      
      if (soldOutKeywords.some(kw => text.includes(kw))) return { url, status: 'sold_out' };
      if (inStockKeywords.some(kw => text.includes(kw))) {
        // 排除美元网站
        if ((text.includes('$') || text.includes('usd')) && !(text.includes('€') || text.includes('eur'))) {
          return { url, status: 'usd_excluded' };
        }
        return { url, status: 'buyable' };
      }
      return { url, status: 'unknown' };
    } catch (err) {
      return { url, status: 'unknown', reason: err.message };
    }
  };

  // 并发验证（限制并发数）
  const results = await Promise.all(uniqueUrls.map(url => checkPage(url)));
  res.status(200).json({ results });
}