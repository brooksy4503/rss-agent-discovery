import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load version from package.json at runtime
let CLI_VERSION = '0.0.0';
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  CLI_VERSION = packageJson.version || '0.0.0';
} catch {
  // Fallback if package.json can't be read
  CLI_VERSION = '0.0.0';
}

interface CLIOptions {
  help: boolean;
  version: boolean;
  verbose: boolean;
  skipBlogs: boolean;
  maxBlogs: number;
  customBlogPaths: string[] | null;
  timeout: number;
}

interface FeedResult {
  url: string;
  title: string;
  type: 'rss' | 'atom' | 'unknown';
}

interface ScanResult {
  html: string | null;
  feeds: FeedResult[];
}

interface DiscoveredResult {
  url: string;
  feeds: FeedResult[];
  error: string | null;
}

export const cliOptions: CLIOptions = {
  help: false,
  version: false,
  verbose: false,
  skipBlogs: false,
  maxBlogs: 5,
  customBlogPaths: null,
  timeout: 10000
};

const BLOG_KEYWORDS = [
  'blog', 'news', 'articles', 'posts', 'updates',
  'journal', 'insights', 'stories', 'press', 'medium',
  'substack', 'the-edge', 'engineering-blog', 'dev',
  'engineering', 'developers', 'community'
];

export const COMMON_BLOG_PATHS = [
  '/blog',
  '/news',
  '/articles',
  '/posts',
  '/updates',
  '/journal',
  '/insights',
  '/stories',
  '/press',
  '/medium',
  '/substack',
  '/the-edge',
  '/engineering-blog',
  '/engineering',
  '/developers',
  '/dev',
  '/community'
];

export function parseArgs(args: string[]): string[] {
  const urls: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      cliOptions.help = true;
    } else if (arg === '--version' || arg === '-V') {
      cliOptions.version = true;
    } else if (arg === '--verbose' || arg === '-v') {
      cliOptions.verbose = true;
    } else if (arg === '--no-blogs' || arg === '--skip-blogs') {
      cliOptions.skipBlogs = true;
    } else if (arg === '--max-blogs') {
      if (i + 1 >= args.length) {
        throw new Error('--max-blogs requires a value');
      }
      const value = parseInt(args[++i], 10);
      if (Number.isNaN(value) || value <= 0) {
        throw new Error(`--max-blogs requires a positive number, got: ${args[i]}`);
      }
      cliOptions.maxBlogs = value;
    } else if (arg === '--blog-paths') {
      if (i + 1 >= args.length || !args[i + 1].trim()) {
        throw new Error('--blog-paths requires a value');
      }
      cliOptions.customBlogPaths = args[++i].split(/[,|]/).map(p => p.trim()).filter(Boolean);
    } else if (arg === '--timeout') {
      if (i + 1 >= args.length) {
        throw new Error('--timeout requires a value');
      }
      const value = parseInt(args[++i], 10);
      if (Number.isNaN(value) || value <= 0) {
        throw new Error(`--timeout requires a positive number, got: ${args[i]}`);
      }
      cliOptions.timeout = value;
    } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
      urls.push(arg);
    }
  }
  return urls;
}

function showHelp(): void {
  console.log(`
Usage: node find-rss-feeds.js [options] <URL1> <URL2> ...

Discover RSS feeds from websites for AI agent consumption. JSON-only output.

Arguments:
  URL(s)              One or more website URLs to scan for RSS feeds

Options:
  --no-blogs, --skip-blogs
                      Skip blog subdirectory scanning
  --max-blogs <num>   Maximum number of blog subdirectories to scan (default: 5)
  --blog-paths <paths>
                      Comma- or pipe-separated custom blog paths to try (e.g., '/blog,/news' or '/blog|/news')
  --timeout <ms>      Timeout per URL in milliseconds (default: 10000)
  --verbose, -v       Log debug info to stderr
  --version, -V       Print version and exit
  --help, -h          Show this help message

Exit codes:
  0                   One or more feeds found (or --help/--version)
  1                   No feeds found
  2                   Error occurred

Examples:
  node find-rss-feeds.js https://example.com
  node find-rss-feeds.js https://site1.com https://site2.com
  node find-rss-feeds.js --timeout 15000 https://example.com
  node find-rss-feeds.js --max-blogs 3 https://example.com
  node find-rss-feeds.js --blog-paths '/blog,/updates' https://example.com | jq

Output schema:
  {
    "success": true,
    "results": [
      {
        "url": "https://example.com",
        "feeds": [
          {"url": "https://example.com/atom", "title": "Blog", "type": "atom"}
        ],
        "error": null
      }
    ]
  }
  `);
}

export function extractBlogLinksFromHTML(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const blogPaths = new Set<string>();

  const linkTextAndUrls: Array<{ text: string; path: string; href: string }> = [];

  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().toLowerCase().trim();
    if (href) {
      try {
        const url = new URL(href, baseUrl);
        if (url.origin === new URL(baseUrl).origin) {
          linkTextAndUrls.push({
            text: text,
            path: url.pathname,
            href: url.href
          });
        }
      } catch (e) {
      }
    }
  });

  const seenPaths = new Set<string>();
  for (const link of linkTextAndUrls) {
    if (seenPaths.has(link.path)) continue;

    const lowerPath = link.path.toLowerCase();

    const foundKeyword = BLOG_KEYWORDS.find(keyword =>
      link.text.includes(keyword) ||
      lowerPath.includes(keyword)
    );

    if (foundKeyword) {
      if (link.path.startsWith('/') && link.path !== '/') {
        const parts = link.path.split('/').filter(Boolean);
        if (parts.length >= 1 && parts.length <= 3) {
          const blogPath = '/' + parts[0];
          if (!seenPaths.has(blogPath)) {
            blogPaths.add(blogPath);
            seenPaths.add(blogPath);
            seenPaths.add(link.path);
          }
        }
      }
    }
  }

  return Array.from(blogPaths);
}

export function discoverBlogSubdirectories(baseUrl: string, html: string | null = null): string[] {
  let blogPaths: string[] = [];

  if (html) {
    blogPaths = extractBlogLinksFromHTML(html, baseUrl);
  }

  if (blogPaths.length === 0 || cliOptions.customBlogPaths) {
    const pathsToUse = cliOptions.customBlogPaths ? cliOptions.customBlogPaths : COMMON_BLOG_PATHS;
    for (const path of pathsToUse) {
      if (!blogPaths.includes(path)) {
        blogPaths.push(path);
      }
    }
  }

  return blogPaths.slice(0, cliOptions.maxBlogs);
}

async function scanURLForFeeds(url: string, signal?: AbortSignal): Promise<ScanResult> {
  const discoveredFeeds = new Map<string, FeedResult>();

  try {
    const res = await fetch(url, {
      signal,
      headers: { 'User-Agent': `rss-agent-discovery/${CLI_VERSION}` }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`);
    }
    const html = await res.text();

    const $ = cheerio.load(html);

    $('link[rel="alternate"]').each((i, el) => {
      const type = $(el).attr('type');
      if (type && (type.includes('rss+xml') || type.includes('atom+xml'))) {
        let href = $(el).attr('href');
        const title = $(el).attr('title') || 'RSS Feed';
        if (href) {
          try {
            const fullHref = new URL(href, url).href;
            const feedType = type.includes('atom') ? 'atom' : 'rss';
            if (!discoveredFeeds.has(fullHref)) {
              discoveredFeeds.set(fullHref, { url: fullHref, title, type: feedType });
            }
          } catch (e) {
            if (cliOptions.verbose) {
              console.error(`Skipping invalid feed href: ${href}`, (e as Error).message);
            }
          }
        }
      }
    });

    const commonPaths = [
      'rss.xml', 'feed.xml', 'rss', 'atom', 'atom.xml', 'index.xml',
      'feeds/rss.xml', 'feed', 'rss/feed.xml'
    ];

    for (const path of commonPaths) {
      try {
        const candidateUrl = new URL(path, url).href;
        if (!discoveredFeeds.has(candidateUrl)) {
          const type = path.includes('atom') ? 'atom' : 'rss';
          discoveredFeeds.set(candidateUrl, {
            url: candidateUrl,
            title: candidateUrl.split('/').pop() || 'RSS Feed',
            type
          });
        }
      } catch (e) {
        if (cliOptions.verbose) {
          console.error(`Skipping invalid candidate URL: ${path}`, (e as Error).message);
        }
      }
    }

    const validFeeds: FeedResult[] = [];
    for (const [feedUrl, feed] of Array.from(discoveredFeeds)) {
      try {
        const res = await fetch(feedUrl, {
          signal,
          headers: { 'User-Agent': `rss-agent-discovery/${CLI_VERSION}` }
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          const text = await res.text();
          // Stricter validation: require XML declaration or XML content-type, and root-level RSS/Atom element
          const hasXmlDeclaration = text.trimStart().startsWith('<?xml') || text.includes('<?xml');
          const hasXmlContentType = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom');
          const hasRssOrFeed = text.includes('<rss') || text.includes('<feed');
          const isHtml = contentType.includes('text/html');

          if (hasRssOrFeed && (hasXmlDeclaration || hasXmlContentType) && !isHtml) {
            validFeeds.push(feed);
          }
        }
      } catch (e) {
        if (cliOptions.verbose) {
          console.error(`Failed to validate feed ${feedUrl}:`, (e as Error).message);
        }
      }
    }

    return { html, feeds: validFeeds };
  } catch (e) {
    console.error(`Error scanning ${url}: ${(e as Error).message}`);
    return { html: null, feeds: [] };
  }
}

async function findRSSFeeds(baseUrl: string): Promise<DiscoveredResult> {
  const timeoutMs = cliOptions.timeout;
  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const scanResult = await scanURLForFeeds(baseUrl, signal);

    const allFeeds = new Map<string, FeedResult>();

    scanResult.feeds.forEach(feed => {
      if (!allFeeds.has(feed.url)) {
        allFeeds.set(feed.url, feed);
      }
    });

    if (!cliOptions.skipBlogs && scanResult.html) {
      const blogPaths = discoverBlogSubdirectories(baseUrl, scanResult.html);

      if (blogPaths.length > 0) {
        const blogURLs = blogPaths.map(path => {
          try {
            return new URL(path, baseUrl).href;
          } catch {
            return null;
          }
        }).filter((url): url is string => url !== null);

        const blogResults = await Promise.allSettled(
          blogURLs.map(blogUrl => scanURLForFeeds(blogUrl, signal))
        );

        blogResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            result.value.feeds.forEach((feed: FeedResult) => {
              if (!allFeeds.has(feed.url)) {
                allFeeds.set(feed.url, feed);
              }
            });
          }
        });
      }
    }

    return {
      url: baseUrl,
      feeds: Array.from(allFeeds.values()),
      error: null
    };
  } catch (e) {
    let errorMessage = (e as Error).message;
    // Handle abort/timeout errors
    if (e instanceof DOMException && e.name === 'AbortError') {
      errorMessage = 'Timeout';
    } else if (errorMessage === 'Timeout') {
      errorMessage = 'Timeout';
    }
    console.error(`Error processing ${baseUrl}: ${errorMessage}`);
    return {
      url: baseUrl,
      feeds: [],
      error: errorMessage
    };
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  let urls: string[];

  try {
    urls = parseArgs(args);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    return 2;
  }

  if (cliOptions.version) {
    console.log(CLI_VERSION);
    return 0;
  }

  if (cliOptions.help) {
    showHelp();
    return 0;
  }

  if (urls.length === 0) {
    console.error('Error: No URLs provided. Use --help for usage information.');
    return 2;
  }

  const results: DiscoveredResult[] = [];

  const scanResults = await Promise.all(
    urls.map(url => findRSSFeeds(url))
  );

  let totalFeedsFound = 0;
  let hasError = false;

  for (const result of scanResults) {
    results.push(result);
    if (result.error) {
      hasError = true;
    } else {
      totalFeedsFound += result.feeds.length;
    }
  }

  const output: {
    success: boolean;
    partialResults?: boolean;
    results: DiscoveredResult[];
  } = {
    success: !hasError,
    results: results
  };

  if (hasError && totalFeedsFound > 0) {
    output.partialResults = true;
  }

  console.log(JSON.stringify(output, null, 2));

  if (hasError) {
    return 2;
  } else if (totalFeedsFound === 0) {
    return 1;
  } else {
    return 0;
  }
}

// Only run main if this file is executed directly or imported by the bin script
// Skip if imported by test files (they have .test.js in the caller)
const currentFile = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === currentFile ||
  process.argv[1]?.endsWith('find-rss-feeds.js') ||
  (process.argv[1]?.includes('rss-agent-discovery') && !process.argv[1]?.includes('.test.'));

if (isMainModule) {
  main().then(exitCode => {
    process.exit(exitCode);
  }).catch(e => {
    console.error(JSON.stringify({
      success: false,
      error: (e as Error).message,
      results: []
    }, null, 2));
    process.exit(2);
  });
}
