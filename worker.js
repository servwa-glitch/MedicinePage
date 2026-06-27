/**
 * Cloudflare Worker — Claude API Proxy
 *
 * 部署步驟:
 *   1. 登入 https://dash.cloudflare.com → Workers & Pages → Create application → Worker
 *   2. 貼上此檔案內容 → Deploy
 *   3. 到 Settings → Variables → Add variable
 *      名稱: ANTHROPIC_API_KEY
 *      值: sk-ant-xxxx (你的 Claude API Key)
 *      勾選 Encrypt
 *   4. 複製 Worker URL (xxx.workers.dev)，貼到 js/app.js 的 WORKER_URL
 */

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      const data = await claudeRes.json();
      return new Response(JSON.stringify(data), {
        status: claudeRes.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });

    } catch (err) {
      return new Response(
        JSON.stringify({ error: { message: err.message } }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
