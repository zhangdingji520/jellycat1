// api/translate.js
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // 百度翻译 API 配置（替换为你的真实信息）
  const APP_ID = '20260404002587238';
  const SECRET_KEY = 'iYvLPIidFJiZIDy7DqY9';   // 请改为截图中的正确密钥
  const salt = Date.now().toString();
  const signStr = APP_ID + text + salt + SECRET_KEY;
  const sign = crypto.createHash('md5').update(signStr).digest('hex');

  const url = 'https://fanyi-api.baidu.com/api/trans/vip/translate';
  const params = new URLSearchParams({
    q: text,
    from: 'auto',        // 自动检测源语言
    to: targetLang,
    appid: APP_ID,
    salt: salt,
    sign: sign,
  });

  try {
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    if (data.error_code) {
      console.error('百度翻译 API 错误:', data);
      return res.status(500).json({ error: data.error_msg });
    }
    const translated = data.trans_result?.[0]?.dst || text;
    res.status(200).json({ translated });
  } catch (err) {
    console.error('翻译请求失败:', err);
    res.status(500).json({ error: err.message });
  }
}
