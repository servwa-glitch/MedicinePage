export default {
  async fetch(request, env) {
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
        // 1. 解析前端傳來的 JSON 資料
        const body = await request.json();
        
        // 2. 找到前端傳過來的 base64 圖片資料
        const base64Data = body.messages?.[0]?.content?.[0]?.source?.data;
        if (!base64Data) {
          return new Response(JSON.stringify({ error: { message: "找不到圖片資料" } }), { status: 400, headers: corsHeaders });
        }

        // 3. 將 base64 轉換為二進位陣列，供 Cloudflare AI 使用
        const binaryString = atob(base64Data);
        const imgArray = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          imgArray[i] = binaryString.charCodeAt(i);
        }

        // 4. 使用 Cloudflare 內建免費的視覺大模型 (Llama-3.2-11B 視覺版)
        // 提示詞使用你前端帶過來的指令
        const promptText = body.messages?.[0]?.content?.[1]?.text || "請識別圖中的藥品名稱";
        
       const aiResponse = await env.AI.run('@cf/qwen/qwen2-vl-7b-instruct', {
          prompt: promptText,
          image: [...imgArray],
          max_tokens: 2048 // 給予足夠的 Token 完整輸出藥材清單
        });

        // 5. 將結果包裝成你前端需要的格式回傳 (data.content[0].text)
        const responseData = {
          content: [
            {
              type: "text",
              text: aiResponse.response || aiResponse.text || ""
            }
          ]
        };

        return new Response(JSON.stringify(responseData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: { message: error.toString() } }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  }
};
