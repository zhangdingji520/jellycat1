export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, country, apiKey } = req.body;
  console.log('收到请求:', { query, country, apiKey: apiKey ? '已提供' : '未提供' });

  // 模拟延迟，但不做任何实际请求
  await new Promise(resolve => setTimeout(resolve, 500));

  // 返回模拟数据
  const mockResults = [
    { url: 'https://example1.com', status: 'buyable' },
    { url: 'https://example2.com', status: 'buyable' },
    { url: 'https://example3.com', status: 'sold_out' }
  ];

  res.status(200).json({ results: mockResults });
}
