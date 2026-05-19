/**
 * Instagram URL Parser - 解析 Instagram 链接获取真实图片 URL
 * 
 * 功能：
 * - 解析 lookaside.instagram.com SEO 链接
 * - 解析 instagram.com/p/ 帖子链接
 * - 提取 CDN 图片 URL
 */

interface InstagramMediaInfo {
  imageUrl: string;
  postUrl: string;
  mediaId?: string;
}

/**
 * 从 lookaside URL 提取 media_id
 */
function extractMediaIdFromLookaside(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get("media_id");
  } catch {
    return null;
  }
}

/**
 * 从帖子 URL 提取 shortcode
 */
function extractShortcodeFromPostUrl(url: string): string | null {
  const match = url.match(/instagram\.com\/p\/([^/?]+)/);
  return match ? match[1] : null;
}

/**
 * 检测 URL 类型
 */
function detectInstagramUrlType(url: string): "lookaside" | "post" | "cdn" | "unknown" {
  if (url.includes("lookaside.instagram.com")) return "lookaside";
  if (url.includes("instagram.com/p/")) return "post";
  if (url.includes("cdninstagram.com")) return "cdn";
  return "unknown";
}

/**
 * 从 HTML 中提取图片 URL（使用正则匹配 og:image 或 JSON-LD）
 */
function extractImageFromHtml(html: string): string | null {
  // 尝试提取 og:image meta 标签
  const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (ogImageMatch) {
    return decodeHtmlEntities(ogImageMatch[1]);
  }

  // 尝试从 JSON-LD 中提取
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
  if (jsonLdMatch) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data.image) {
        return Array.isArray(data.image) ? data.image[0] : data.image;
      }
    } catch {
      // JSON 解析失败，继续尝试其他方法
    }
  }

  // 尝试从 window._sharedData 中提取（Instagram 的数据结构）
  const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.+?});<\/script>/s);
  if (sharedDataMatch) {
    try {
      const data = JSON.parse(sharedDataMatch[1]);
      const media = data?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
      if (media?.display_url) {
        return media.display_url;
      }
    } catch {
      // 解析失败，继续
    }
  }

  // 尝试直接匹配 CDN URL（包括 jpg, jpeg, png, webp）
  const cdnMatch = html.match(/https:\/\/[^"'\s]+cdninstagram\.com[^"'\s]+\.(jpg|jpeg|png|webp)[^"'\s]*/i);
  if (cdnMatch) {
    return decodeHtmlEntities(cdnMatch[0]);
  }

  return null;
}

/**
 * 解码 HTML 实体
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

/**
 * 解析 Instagram URL 获取真实图片地址
 * @param url Instagram URL（lookaside、post 或 CDN）
 * @returns 图片信息
 */
export async function parseInstagramUrl(url: string): Promise<InstagramMediaInfo | null> {
  const urlType = detectInstagramUrlType(url);

  // 如果已经是 CDN URL，直接返回
  if (urlType === "cdn") {
    return {
      imageUrl: url,
      postUrl: url,
    };
  }

  try {
    let postUrl = url;

    // 如果是 lookaside URL，先获取帖子页面
    if (urlType === "lookaside") {
      const mediaId = extractMediaIdFromLookaside(url);
      
      // 尝试直接访问 lookaside URL 获取重定向
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
        },
      });

      postUrl = response.url; // 获取重定向后的 URL
      
      if (!postUrl.includes("instagram.com/p/")) {
        console.warn("[instagram-parser] Failed to get post URL from lookaside");
        return null;
      }
    }

    // 现在我们有了帖子 URL，获取页面内容
    const shortcode = extractShortcodeFromPostUrl(postUrl);
    if (!shortcode) {
      console.warn("[instagram-parser] Failed to extract shortcode from:", postUrl);
      return null;
    }

    // 尝试使用 Instagram 的嵌入 API（更可靠）
    try {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      const embedResponse = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (embedResponse.ok) {
        const embedHtml = await embedResponse.text();
        const imageUrl = extractImageFromHtml(embedHtml);
        
        if (imageUrl) {
          return {
            imageUrl,
            postUrl,
            mediaId: extractMediaIdFromLookaside(url) || undefined,
          };
        }
      }
    } catch (embedError) {
      console.warn("[instagram-parser] Embed API failed, trying main page:", embedError);
    }

    // 备用方案：获取主页面 HTML
    const response = await fetch(postUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const imageUrl = extractImageFromHtml(html);

    if (!imageUrl) {
      console.warn("[instagram-parser] Failed to extract image from HTML");
      return null;
    }

    return {
      imageUrl,
      postUrl,
      mediaId: extractMediaIdFromLookaside(url) || undefined,
    };
  } catch (error) {
    console.error("[instagram-parser] Failed to parse Instagram URL:", error);
    return null;
  }
}

/**
 * 批量解析 Instagram URLs
 */
export async function parseInstagramUrls(urls: string[]): Promise<InstagramMediaInfo[]> {
  const results = await Promise.allSettled(
    urls.map(url => parseInstagramUrl(url))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<InstagramMediaInfo | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((info): info is InstagramMediaInfo => info !== null);
}

/**
 * 检测文本中的 Instagram URLs 并解析
 */
export async function extractAndParseInstagramUrls(text: string): Promise<InstagramMediaInfo[]> {
  const urlRegex = /https?:\/\/[^\s]+instagram\.com[^\s]*/gi;
  const matches = text.match(urlRegex);
  
  if (!matches || matches.length === 0) {
    return [];
  }

  return parseInstagramUrls(matches);
}
