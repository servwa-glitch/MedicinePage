export default {
  async fetch(request, env) {
    // 處理跨域問題 (CORS)，讓你的 GitHub Pages 網站可以順利呼叫此 API
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "POST") {
      try {
        // 1. 讀取前端傳過來的圖片二進位資料
        const imageData = await request.arrayBuffer();

        // 2. 呼叫 Cloudflare 內建的圖像分類模型 (ResNet-50)
        // 注意：稍後需在 Cloudflare 後台 Settings -> Variables 綁定 AI 變量
        const response = await env.AI.run('@cf/microsoft/resnet-50', {
          image: [...new Uint8Array(imageData)]
        });

        // 3. 將 AI 辨識結果回傳給前端
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.toString() }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    return new Response("請使用 POST 方法上傳圖片", { status: 400 });
  }
};
