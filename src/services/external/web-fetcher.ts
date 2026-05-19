/**
 * Web Fetcher Service - 通用网页内容抓取工具
 *
 * 功能：
 * - 抓取任意 URL 的网页内容
 * - 自动清理 HTML，提取主要内容
 * - 保留表格、列表等结构化内容
 * - 转换为 Markdown 格式
 */

export interface FetchedWebContent {
  url: string;
  title: string;
  content: string;
  contentLength: number;
  contentType?: string;
  statusCode: number;
}

// 禁止访问的 IP 范围（私有网络、本地回环、链路本地等）
const BLOCKED_IP_PATTERNS = [
  /^127\./,           // 127.0.0.0/8
  /^10\./,            // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
  /^192\.168\./,      // 192.168.0.0/16
  /^169\.254\./,      // 169.254.0.0/16 (link-local)
  /^0\./,             // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // 100.64.0.0/10 (CGNAT)
];

// 仅允许的 URL schemes
const ALLOWED_SCHEMES = new Set(["https:", "http:"]);

function isPrivateIP(hostname: string): boolean {
  return BLOCKED_IP_PATTERNS.some(pattern => pattern.test(hostname));
}

function validateUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("无效的 URL 格式");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`不支持的协议: ${parsed.protocol}`);
  }

  if (isPrivateIP(parsed.hostname)) {
    throw new Error("不允许访问私有网络地址");
  }

  // 阻止常见云元数据端点
  if (parsed.hostname === "169.254.169.254") {
    throw new Error("不允许访问云元数据服务");
  }

  // 限制 URL 长度防止 DoS
  if (url.length > 4096) {
    throw new Error("URL 过长");
  }

  return parsed;
}

/**
 * 将 HTML 转换为可读的 Markdown 格式
 * 优化版：减少正则表达式调用次数
 */
function htmlToMarkdown(html: string): string {
  let text = html;
  
  // 一次性移除所有不需要的标签
  text = text.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  
  // 批量处理标题（一次正则）
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match, level, content) => {
    return '\n' + '#'.repeat(parseInt(level)) + ' ' + content + '\n';
  });
  
  // 批量处理格式标签
  text = text
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<(ul|ol)[^>]*>/gi, '\n')
    .replace(/<\/(ul|ol)>/gi, '\n');
  
  // 处理链接
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  
  // 处理粗体和斜体
  text = text
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  
  // 处理代码
  text = text
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  
  // 简化表格处理（减少正则调用）
  text = text
    .replace(/<table[^>]*>/gi, '\n')
    .replace(/<\/table>/gi, '\n')
    .replace(/<tr[^>]*>/gi, '')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<t[hd][^>]*>/gi, '| ')
    .replace(/<\/t[hd]>/gi, ' ');
  
  // 移除剩余标签
  text = text.replace(/<[^>]+>/g, '');
  
  // 批量解码 HTML 实体（使用对象映射更快）
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  };
  
  text = text.replace(/&[a-z]+;|&#\d+;/gi, (entity) => entities[entity] || entity);
  
  // 清理空白（合并多个正则）
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}

/**
 * 从 HTML 中提取标题
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].replace(/<[^>]+>/g, '').trim();
  }
  
  return 'Untitled';
}

/**
 * 获取针对特定网站的请求头
 */
function getHeaders(url: string): Record<string, string> {
  const urlObj = new URL(url);
  const hostname = urlObj.hostname;
  
  // 基础请求头
  const baseHeaders: Record<string, string> = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
  
  // 针对知乎的特殊处理
  if (hostname.includes('zhihu.com')) {
    return {
      ...baseHeaders,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.zhihu.com/',
    };
  }
  
  // 针对微信公众号的特殊处理
  if (hostname.includes('weixin.qq.com')) {
    return {
      ...baseHeaders,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }
  
  // 默认 User-Agent
  return {
    ...baseHeaders,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  };
}

/**
 * 抓取网页内容
 * @param url 目标 URL
 * @param options 可选配置
 */
export async function fetchWebContent(
  url: string,
  options?: {
    timeout?: number;
    maxLength?: number;
    includeRawHtml?: boolean;
  }
): Promise<FetchedWebContent> {
  const timeout = options?.timeout || 15000; // 减少到 15 秒
  const maxLength = options?.maxLength || 50000; // 减少默认长度到 50000
  
  // SSRF 防护：验证 URL 合法性
  const validatedUrl = validateUrl(url);

  console.log(`[WebFetcher] Fetching: ${validatedUrl.href}`);
  const startTime = Date.now();

  try {
    // 创建超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 使用针对特定网站优化的请求头
    const headers = getHeaders(validatedUrl.href);
    
    const response = await fetch(validatedUrl.href, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    // 检查是否为 HTML
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`不支持的内容类型: ${contentType}`);
    }
    
    const html = await response.text();
    const fetchTime = Date.now() - startTime;
    
    // 提取标题
    const title = extractTitle(html);
    
    // 转换为 Markdown
    const parseStart = Date.now();
    let content = htmlToMarkdown(html);
    const parseTime = Date.now() - parseStart;
    
    // 限制长度
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '\n\n... (内容过长，已截断)';
    }
    
    console.log(`[WebFetcher] Success: ${validatedUrl.href} (fetch: ${fetchTime}ms, parse: ${parseTime}ms, ${content.length} chars)`);

    return {
      url: validatedUrl.href,
      title,
      content,
      contentLength: content.length,
      contentType,
      statusCode: response.status,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`请求超时 (${timeout}ms)`);
    }
    
    console.error('[WebFetcher] Error:', error);
    throw new Error(`抓取失败: ${error.message}`);
  }
}

/**
 * 批量抓取多个 URL
 */
export async function fetchMultipleUrls(
  urls: string[],
  options?: {
    timeout?: number;
    maxLength?: number;
    concurrency?: number;
  }
): Promise<FetchedWebContent[]> {
  const concurrency = options?.concurrency || 3;
  const results: FetchedWebContent[] = [];
  
  // 分批处理
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(url => fetchWebContent(url, options))
    );
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.warn(`[WebFetcher] Failed to fetch ${batch[index]}:`, result.reason);
      }
    });
  }
  
  return results;
}

