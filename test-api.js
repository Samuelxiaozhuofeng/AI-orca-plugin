// 在浏览器控制台运行这个脚本来测试API
async function testApiWithToolResults() {
  const url = "http://127.0.0.1:8317/v1/chat/completions";
  const apiKey = "YOUR_API_KEY"; // 替换成你的API Key

  const requestBody = {
    model: "gemini-3-flash",
    messages: [
      {
        role: "user",
        content: "请找到带有task的block"
      },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "test-123",
            type: "function",
            function: {
              name: "searchBlocksByTag",
              arguments: '{"tag": "task"}'
            }
          }
        ]
      },
      {
        role: "tool",
        content: "Found 2 notes with task tag",
        tool_call_id: "test-123",
        name: "searchBlocksByTag"
      }
    ],
    temperature: 0.7,
    max_tokens: 4096,
    stream: true
  };

  console.log("Sending request to:", url);
  console.log("Request body:", JSON.stringify(requestBody, null, 2));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log("Response status:", res.status);
    console.log("Response headers:", Array.from(res.headers.entries()));

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Error response:", errorText);
      return;
    }

    // 读取流
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let chunkCount = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) break;

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith("data:")) {
          const data = line.slice("data:".length).trim();
          if (data === "[DONE]") {
            console.log("Stream complete");
            return;
          }
          if (data) {
            try {
              const json = JSON.parse(data);
              chunkCount++;
              console.log(`Chunk #${chunkCount}:`, json);
            } catch (e) {
              console.warn("Failed to parse:", data);
            }
          }
        }
      }
    }

    console.log(`Total chunks received: ${chunkCount}`);
  } catch (error) {
    console.error("Fetch error:", error);
  }
}

// 运行测试
testApiWithToolResults();
