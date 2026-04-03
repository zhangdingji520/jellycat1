export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, country, apiKey, customSoldOutKeywords = [], start = 0, num = 20 } = req.body;
  if (!query || !country || !apiKey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const BUILTIN_SOLD_OUT_KEYWORDS = [
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
    "esaurito",
    "this product is no longer in stock",
    "dieser artikel steht derzeit nicht zur verfügung",
    "para ver el precio y comprar este producto debes registrarte como profesional",
    "oczekiwanie na dostawę"
  ];

  const allSoldOutKeywords = [
    ...BUILTIN_SOLD_OUT_KEYWORDS,
    ...(customSoldOutKeywords || []).map(k => k.toLowerCase())
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

  const EXCLUDE_DOMAINS = [
    "jellycat.com", "eu.jellycat.com", "de.jellycat.com", "fr.jellycat.com",
    "amazon", "ebay", "walmart", "target", "toysrus", "wish", "etsy", "zalando",
    "bol.com", "aliexpress", "cdiscount", "fnac", "darty", "otto",
    "vinted", "depop", "allegro", "marktplaats", "olx", "wallapop", "leboncoin",
    "hood.de", "kleinanzeigen",
    "facebook", "instagram", "tiktok", "twitter", "pinterest", "youtube",
    "jellyjournal.com", "lilietmilou.com", "ubuy", "lodenfrey.com",
    "wikipedia.org", "bunnyuksale.com"
  ];

  try {
    const serperRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: country, num, start }),
    });
    if (!serperRes.ok) {
      return res.status(200).json({ results: [] });
    }
    const data = await serperRes.json();
    const rawUrls = (data.organic && Array.isArray(data.organic)) ? data.organic.map(item => item.link).filter(Boolean) : [];

    const domainMap = new Map();
    for (const url of rawUrls) {
      if (EXCLUDE_DOMAINS.some(domain => url.toLowerCase().includes(domain))) continue;
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        if (!domainMap.has(host)) domainMap.set(host, url);
      } catch {}
    }
    const MAX_VERIFY = 8;
    const uniqueUrls = Array.from(domainMap.values()).slice(0, MAX_VERIFY);

    // 增强的相关性检测：对于不含 "jellycat" 的搜索词（如纯 SKU/UPC），要求页面必须同时包含 "jellycat"
    const isRelevant = (html, searchQuery) => {
      const text = html.toLowerCase();
      const words = searchQuery.toLowerCase().split(/\s+/);
      const containsAnyWord = words.some(word => word.length >= 2 && text.includes(word));
      if (!containsAnyWord) return false;
      // 如果搜索词本身不包含 "jellycat"，则要求页面必须包含 "jellycat"
      if (!searchQuery.toLowerCase().includes('jellycat')) {
        return text.includes('jellycat');
      }
      return true;
    };

    const verifyPage = async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const pageRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!pageRes.ok) return { url, status: 'unknown' };
        const html = await pageRes.text();
        if (!isRelevant(html, query)) return { url, status: 'irrelevant' };
        const text = html.toLowerCase();
        if (allSoldOutKeywords.some(kw => text.includes(kw))) return { url, status: 'sold_out' };
        if (IN_STOCK_KEYWORDS.some(kw => text.includes(kw))) {
          const hasDollar = text.includes('$') || text.includes('usd');
          const hasEuro = text.includes('€') || text.includes('eur');
          if (hasDollar && !hasEuro) return { url, status: 'usd_excluded' };
          return { url, status: 'buyable' };
        }
        return { url, status: 'unknown' };
      } catch (err) {
        return { url, status: 'unknown' };
      }
    };

    const results = [];
    for (let i = 0; i < uniqueUrls.length; i += 5) {
      const batch = uniqueUrls.slice(i, i + 5);
      const batchResults = await Promise.all(batch.map(verifyPage));
      results.push(...batchResults);
    }
    res.status(200).json({ results });
  } catch (err) {
    console.error(err);
    res.status(200).json({ results: [] });
  }
}
