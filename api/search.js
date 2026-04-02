// api/search.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, country, apiKey } = req.body;
  if (!query || !country || !apiKey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // ================== 黑名单（域名关键词） ==================
  const EXCLUDE_DOMAINS = [
    "jellycat.com", "eu.jellycat.com", "de.jellycat.com", "fr.jellycat.com",
    "amazon", "ebay", "walmart", "target", "toysrus", "wish", "etsy", "zalando",
    "bol.com", "aliexpress", "cdiscount", "fnac", "darty", "otto",
    "vinted", "depop", "allegro", "marktplaats", "olx", "wallapop", "leboncoin",
    "hood.de", "kleinanzeigen",
    "facebook", "instagram", "tiktok", "twitter", "pinterest", "youtube",
    "jellyjournal.com", "lilietmilou.com", "ubuy",
    "lodenfrey.com"   // 新增
  ];

  // ================== 多语言缺货关键词 ==================
  const SOLD_OUT_KEYWORDS = [
    "sold out", "out of stock", "no stock", "not available", "currently unavailable",
    "ausverkauft", "nicht vorrätig", "nicht auf lager", "momentan nicht verfügbar",
    "derzeit nicht vorrätig", "nicht lieferbar", "vergriffen", "leider ausverkauft",
    "artikel nicht verfügbar", "nicht mehr vorrätig", "nicht auf Lager", "Nicht vorrätig",
    "niedostępny", "brak w magazynie", "wyprzedane", "chwilowo niedostępny",
    "uitverkocht", "niet op voorraad", "niet beschikbaar", "tijdelijk niet beschikbaar",
    "niet leverbaar", "momenteel niet op voorraad", "op=op", "niet meer leverbaar",
    "épuisé", "rupture de stock", "plus disponible", "indisponible",
    "temporairement indisponible", "en rupture", "produit indisponible",
    "non disponible", "hors stock",
    "esgotado", "fora de stock", "indisponível", "não disponível",
    "sem stock", "temporariamente indisponível", "produto esgotado",
    "agotado", "sin stock", "no disponible", "fuera de stock",
    "temporalmente no disponible", "artículo agotado", "no hay stock",
    "esaurito"   // 意大利语“售罄”
  ];

  const IN_STOCK_KEYWORDS = [
    "in stock", "available", "in store", "ready to ship",
    "auf lager", "sofort lieferbar", "lieferbar", "verfügbar", "auf Lager",
    "na stanie", "dostępny", "w magazynie", "dostępna",
    "op voorraad", "leverbaar", "beschikbaar",
    "en stock", "disponible",
    "em stock", "disponível", "em estoque",
    "en stock", "disponible", "en existencias"
  ];

  try {
    // 1. 调用 Serper API 获取搜索结果
    const serperRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: country, num: 20 }),
    });
    const data = await serperRes.json();
    const rawUrls = (data.organic || []).map(item => item.link).filter(Boolean);

    // 2. 域名去重 + 黑名单过滤
    const domainMap = new Map();
    for (const url of rawUrls) {
      if (EXCLUDE_DOMAINS.some(domain => url.toLowerCase().includes(domain))) continue;
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        if (!domainMap.has(host)) domainMap.set(host, url);
      } catch {}
    }
    const uniqueUrls = Array.from(domainMap.values());

    // 限制最多验证 20 个 URL（避免超时）
    const MAX_VERIFY = 20;
    const urlsToCheck = uniqueUrls.slice(0, MAX_VERIFY);

    // 3. 并发验证每个页面（限制并发数）
    const verifyPage = async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const pageRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!pageRes.ok) return { url, status: 'unknown' };
        const html = await pageRes.text();
        const text = html.toLowerCase();

        if (SOLD_OUT_KEYWORDS.some(kw => text.includes(kw))) return { url, status: 'sold_out' };
        if (IN_STOCK_KEYWORDS.some(kw => text.includes(kw))) {
          const hasDollar = text.includes('$') || text.includes('usd');
          const hasEuro = text.includes('€') || text.includes('eur');
          if (hasDollar && !hasEuro) return { url, status: 'usd_excluded' };
          return { url, status: 'buyable' };
        }
        return { url, status: 'unknown' };
      } catch (err) {
        console.error(`验证失败 ${url}:`, err.message);
        return { url, status: 'unknown' };
      }
    };

    const CONCURRENCY = 5;
    const results = [];
    for (let i = 0; i < urlsToCheck.length; i += CONCURRENCY) {
      const batch = urlsToCheck.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(verifyPage));
      results.push(...batchResults);
    }

    res.status(200).json({ results });
  } catch (err) {
    console.error('Handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
