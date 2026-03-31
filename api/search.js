export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, country, apiKey } = req.body;
  if (!query || !country || !apiKey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // 1. 调用 Serper API 获取搜索结果的 URL
  let serperData;
  try {
    const serperRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: country }),
    });
    serperData = await serperRes.json();
  } catch (err) {
    return res.status(500).json({ error: `Serper API error: ${err.message}` });
  }

  const rawUrls = (serperData.organic || []).map(item => item.link).filter(Boolean);
  // 域名去重（每个域名只保留第一个 URL）
  const domainMap = new Map();
  for (const url of rawUrls) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (!domainMap.has(host)) domainMap.set(host, url);
    } catch {}
  }
  const uniqueUrls = Array.from(domainMap.values());

  // 如果 URL 太多，限制验证数量（避免超时）
  const MAX_VERIFY = 20;
  const urlsToVerify = uniqueUrls.slice(0, MAX_VERIFY);

  // 2. 定义缺货和有货关键词（多语言）
  const soldOutKeywords = [
    'sold out', 'out of stock', 'no stock', 'not available', 'currently unavailable',
    'ausverkauft', 'nicht vorrätig', 'nicht auf lager', 'momentan nicht verfügbar',
    'derzeit nicht vorrätig', 'derzeit nicht verfügbar', 'nicht lieferbar', 'vergriffen',
    'niedostępny', 'brak w magazynie', 'wyprzedane', 'chwilowo niedostępny',
    'uitverkocht', 'niet op voorraad', 'niet beschikbaar', 'tijdelijk niet beschikbaar',
    'niet leverbaar', 'momenteel niet op voorraad', 'op=op', 'niet meer leverbaar',
    'épuisé', 'rupture de stock', 'plus disponible', 'indisponible',
    'temporairement indisponible', 'en rupture', 'produit indisponible',
    'non disponible', 'hors stock',
    'esgotado', 'fora de stock', 'indisponível', 'não disponível',
    'sem stock', 'temporariamente indisponível', 'produto esgotado',
    'agotado', 'sin stock', 'no disponible', 'fuera de stock',
    'temporalmente no disponible', 'artículo agotado', 'no hay stock'
  ];

  const inStockKeywords = [
    'in stock', 'available', 'in store', 'ready to ship',
    'auf lager', 'sofort lieferbar', 'lieferbar', 'verfügbar', 'auf Lager',
    'na stanie', 'dostępny', 'w magazynie', 'dostępna',
    'op voorraad', 'leverbaar', 'beschikbaar',
    'en stock', 'disponible',
    'em stock', 'disponível', 'em estoque',
    'en stock', 'disponible', 'en existencias'
  ];

  // 3. 并发验证每个 URL
  const verifyPage = async (url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5秒超时
      const pageRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!pageRes.ok) {
        return { url, status: 'unknown', reason: `HTTP ${pageRes.status}` };
      }
      const html = await pageRes.text();
      const text = html.toLowerCase();

      // 检查缺货
      if (soldOutKeywords.some(kw => text.includes(kw))) {
        return { url, status: 'sold_out' };
      }
      // 检查有货
      if (inStockKeywords.some(kw => text.includes(kw))) {
        // 美元网站检测
        const hasDollar = text.includes('$') || text.includes('usd');
        const hasEuro = text.includes('€') || text.includes('eur');
        if (hasDollar && !hasEuro) {
          return { url, status: 'usd_excluded' };
        }
        return { url, status: 'buyable' };
      }
      return { url, status: 'unknown' };
    } catch (err) {
      return { url, status: 'unknown', reason: err.message };
    }
  };

  // 控制并发数（避免同时请求太多导致超时）
  const CONCURRENCY = 10;
  const results = [];
  for (let i = 0; i < urlsToVerify.length; i += CONCURRENCY) {
    const batch = urlsToVerify.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(verifyPage));
    results.push(...batchResults);
  }

  // 4. 返回分类结果
  res.status(200).json({ results });
}
