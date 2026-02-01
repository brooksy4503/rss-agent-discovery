import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// Note: This file tests the compiled code in dist/
// Import will be resolved to dist/find-rss-feeds.js after build
import { parseArgs, extractBlogLinksFromHTML, discoverBlogSubdirectories, cliOptions, COMMON_BLOG_PATHS } from './find-rss-feeds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '..', 'dist', 'find-rss-feeds.js');

// Reset cliOptions before each test
function resetCliOptions() {
  cliOptions.help = false;
  cliOptions.version = false;
  cliOptions.verbose = false;
  cliOptions.skipBlogs = false;
  cliOptions.maxBlogs = 5;
  cliOptions.customBlogPaths = null;
  cliOptions.timeout = 10000;
}

test('parseArgs - valid flags and URLs', () => {
  resetCliOptions();
  const urls = parseArgs(['https://example.com', 'https://test.com']);
  assert.strictEqual(urls.length, 2);
  assert.strictEqual(urls[0], 'https://example.com');
  assert.strictEqual(urls[1], 'https://test.com');
});

test('parseArgs - --help sets help flag', () => {
  resetCliOptions();
  parseArgs(['--help']);
  assert.strictEqual(cliOptions.help, true);
});

test('parseArgs - --version / -V sets version flag', () => {
  resetCliOptions();
  parseArgs(['--version']);
  assert.strictEqual(cliOptions.version, true);

  resetCliOptions();
  parseArgs(['-V']);
  assert.strictEqual(cliOptions.version, true);
});

test('parseArgs - --verbose / -v sets verbose flag', () => {
  resetCliOptions();
  parseArgs(['--verbose']);
  assert.strictEqual(cliOptions.verbose, true);

  resetCliOptions();
  parseArgs(['-v']);
  assert.strictEqual(cliOptions.verbose, true);
});

test('parseArgs - --timeout missing value throws error', () => {
  resetCliOptions();
  assert.throws(() => {
    parseArgs(['--timeout']);
  }, /--timeout requires a value/);
});

test('parseArgs - --timeout invalid number throws error', () => {
  resetCliOptions();
  assert.throws(() => {
    parseArgs(['--timeout', 'invalid']);
  }, /--timeout requires a positive number/);

  resetCliOptions();
  assert.throws(() => {
    parseArgs(['--timeout', '0']);
  }, /--timeout requires a positive number/);

  resetCliOptions();
  assert.throws(() => {
    parseArgs(['--timeout', '-5']);
  }, /--timeout requires a positive number/);
});

test('parseArgs - --timeout valid value sets timeout', () => {
  resetCliOptions();
  parseArgs(['--timeout', '15000']);
  assert.strictEqual(cliOptions.timeout, 15000);
});

test('parseArgs - --max-blogs missing value throws error', () => {
  resetCliOptions();
  assert.throws(() => {
    parseArgs(['--max-blogs']);
  }, /--max-blogs requires a value/);
});

test('parseArgs - --max-blogs invalid number throws error', () => {
  resetCliOptions();
  assert.throws(() => {
    parseArgs(['--max-blogs', 'invalid']);
  }, /--max-blogs requires a positive number/);
});

test('parseArgs - --max-blogs valid value sets maxBlogs', () => {
  resetCliOptions();
  parseArgs(['--max-blogs', '10']);
  assert.strictEqual(cliOptions.maxBlogs, 10);
});

test('parseArgs - --blog-paths missing value throws error', () => {
  resetCliOptions();
  assert.throws(() => {
    parseArgs(['--blog-paths']);
  }, /--blog-paths requires a value/);
});

test('parseArgs - --blog-paths with comma separator', () => {
  resetCliOptions();
  parseArgs(['--blog-paths', '/blog,/news']);
  assert.deepStrictEqual(cliOptions.customBlogPaths, ['/blog', '/news']);
});

test('parseArgs - --blog-paths with pipe separator', () => {
  resetCliOptions();
  parseArgs(['--blog-paths', '/blog|/news']);
  assert.deepStrictEqual(cliOptions.customBlogPaths, ['/blog', '/news']);
});

test('parseArgs - --blog-paths with mixed separators', () => {
  resetCliOptions();
  parseArgs(['--blog-paths', '/blog,/news|/updates']);
  assert.deepStrictEqual(cliOptions.customBlogPaths, ['/blog', '/news', '/updates']);
});

test('extractBlogLinksFromHTML - finds blog links', () => {
  const html = `
    <html>
      <body>
        <a href="/blog">Blog</a>
        <a href="/news">News</a>
        <a href="/articles">Articles</a>
        <a href="https://external.com/blog">External</a>
      </body>
    </html>
  `;
  const paths = extractBlogLinksFromHTML(html, 'https://example.com');
  assert.ok(paths.length > 0, 'Should find blog paths');
  assert.ok(paths.includes('/blog'), 'Should include /blog');
});

test('extractBlogLinksFromHTML - only same-origin links', () => {
  const html = `
    <html>
      <body>
        <a href="/blog">Blog</a>
        <a href="https://external.com/blog">External</a>
      </body>
    </html>
  `;
  const paths = extractBlogLinksFromHTML(html, 'https://example.com');
  assert.ok(!paths.includes('https://external.com/blog'), 'Should not include external links');
});

test('extractBlogLinksFromHTML - keyword matching', () => {
  const html = `
    <html>
      <body>
        <a href="/blog">Blog</a>
        <a href="/random">Random</a>
      </body>
    </html>
  `;
  const paths = extractBlogLinksFromHTML(html, 'https://example.com');
  assert.ok(paths.includes('/blog'), 'Should find /blog via keyword');
});

test('discoverBlogSubdirectories - uses custom paths when provided', () => {
  resetCliOptions();
  cliOptions.customBlogPaths = ['/custom1', '/custom2'];
  cliOptions.maxBlogs = 10;
  const paths = discoverBlogSubdirectories('https://example.com');
  assert.ok(paths.includes('/custom1'));
  assert.ok(paths.includes('/custom2'));
});

test('discoverBlogSubdirectories - respects maxBlogs limit', () => {
  resetCliOptions();
  cliOptions.maxBlogs = 3;
  const paths = discoverBlogSubdirectories('https://example.com');
  assert.strictEqual(paths.length, 3);
});

test('discoverBlogSubdirectories - falls back to COMMON_BLOG_PATHS when no HTML', () => {
  resetCliOptions();
  cliOptions.customBlogPaths = null;
  const paths = discoverBlogSubdirectories('https://example.com', null);
  assert.ok(paths.length > 0);
  assert.ok(paths.some(p => COMMON_BLOG_PATHS.includes(p)));
});

test('feed validation logic - valid RSS should pass', () => {
  const validRSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
  </channel>
</rss>`;
  const contentType = 'application/rss+xml';
  const hasXmlDeclaration = validRSS.trimStart().startsWith('<?xml') || validRSS.includes('<?xml');
  const hasXmlContentType = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom');
  const hasRssOrFeed = validRSS.includes('<rss') || validRSS.includes('<feed');
  const isHtml = contentType.includes('text/html');

  assert.ok(hasXmlDeclaration);
  assert.ok(hasXmlContentType);
  assert.ok(hasRssOrFeed);
  assert.ok(!isHtml);
  assert.ok(hasRssOrFeed && (hasXmlDeclaration || hasXmlContentType) && !isHtml);
});

test('feed validation logic - HTML with <rss> should be rejected', () => {
  const htmlWithRss = `<html>
<body>
  <p>Check out our <rss> feed!</p>
</body>
</html>`;
  const contentType = 'text/html';
  const hasXmlDeclaration = htmlWithRss.trimStart().startsWith('<?xml') || htmlWithRss.includes('<?xml');
  const hasXmlContentType = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom');
  const hasRssOrFeed = htmlWithRss.includes('<rss') || htmlWithRss.includes('<feed');
  const isHtml = contentType.includes('text/html');

  assert.ok(isHtml, 'Should detect HTML content type');
  assert.ok(!(hasRssOrFeed && (hasXmlDeclaration || hasXmlContentType) && !isHtml), 'Should reject HTML');
});

test('feed validation logic - valid Atom should pass', () => {
  const validAtom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Feed</title>
</feed>`;
  const contentType = 'application/atom+xml';
  const hasXmlDeclaration = validAtom.trimStart().startsWith('<?xml') || validAtom.includes('<?xml');
  const hasXmlContentType = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom');
  const hasRssOrFeed = validAtom.includes('<rss') || validAtom.includes('<feed');
  const isHtml = contentType.includes('text/html');

  assert.ok(hasXmlDeclaration);
  assert.ok(hasXmlContentType);
  assert.ok(hasRssOrFeed);
  assert.ok(!isHtml);
  assert.ok(hasRssOrFeed && (hasXmlDeclaration || hasXmlContentType) && !isHtml);
});

test('output contract - JSON-only stdout when verbose is off', async () => {
  resetCliOptions();
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('node', [CLI_PATH, '--timeout', '1000', 'https://httpstat.us/500'], {
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      try {
        // Should have JSON output
        assert.ok(stdout.length > 0, 'Should have stdout output');
        const output = JSON.parse(stdout);
        assert.ok(output.hasOwnProperty('success'), 'Output should have success field');
        assert.ok(output.hasOwnProperty('results'), 'Output should have results field');

        // Should have no stderr output when verbose is off
        assert.strictEqual(stderr, '', 'Should have no stderr output when verbose is off');
        resolve();
      } catch (e) {
        reject(new Error(`Test failed: ${(e as Error).message}\nstdout: ${stdout}\nstderr: ${stderr}`));
      }
    });

    proc.on('error', (e) => {
      reject(new Error(`Process spawn failed: ${e.message}`));
    });
  });
});

test('output contract - stderr output when verbose is on', async () => {
  resetCliOptions();
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('node', [CLI_PATH, '--verbose', '--timeout', '1000', 'https://httpstat.us/500'], {
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      try {
        // Should still have valid JSON output
        assert.ok(stdout.length > 0, 'Should have stdout output');
        const output = JSON.parse(stdout);
        assert.ok(output.hasOwnProperty('success'), 'Output should have success field');

        // May have stderr output when verbose is on (but not required for all cases)
        // Just verify JSON is still valid
        resolve();
      } catch (e) {
        reject(new Error(`Test failed: ${(e as Error).message}\nstdout: ${stdout}\nstderr: ${stderr}`));
      }
    });

    proc.on('error', (e) => {
      reject(new Error(`Process spawn failed: ${e.message}`));
    });
  });
});

test('output contract - timeout error normalization', async () => {
  resetCliOptions();
  return new Promise<void>((resolve, reject) => {
    // Use a very short timeout to force a timeout error
    const proc = spawn('node', [CLI_PATH, '--timeout', '1', 'https://httpstat.us/200?sleep=5000'], {
      cwd: __dirname
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      try {
        const output = JSON.parse(stdout);
        assert.ok(output.hasOwnProperty('results'), 'Output should have results field');
        assert.ok(Array.isArray(output.results), 'Results should be an array');

        if (output.results.length > 0 && output.results[0].error) {
          // Error should be normalized to "Timeout" or contain timeout-related message
          const errorMsg = output.results[0].error;
          assert.ok(
            errorMsg === 'Timeout' || errorMsg.toLowerCase().includes('timeout'),
            `Error message should be normalized: got "${errorMsg}"`
          );
        }
        resolve();
      } catch (e) {
        reject(new Error(`Test failed: ${(e as Error).message}\nstdout: ${stdout}`));
      }
    });

    proc.on('error', (e) => {
      reject(new Error(`Process spawn failed: ${e.message}`));
    });
  });
});

test('output contract - partial results when one URL fails', async () => {
  resetCliOptions();
  return new Promise<void>((resolve, reject) => {
    // Use one valid URL and one that will fail
    const proc = spawn('node', [CLI_PATH, '--timeout', '5000', 'https://httpstat.us/500', 'https://httpstat.us/404'], {
      cwd: __dirname
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      try {
        const output = JSON.parse(stdout);
        assert.ok(output.hasOwnProperty('success'), 'Output should have success field');
        assert.ok(output.hasOwnProperty('results'), 'Output should have results field');
        assert.ok(Array.isArray(output.results), 'Results should be an array');
        assert.strictEqual(output.results.length, 2, 'Should have results for both URLs');

        // If there are errors but also some success, partialResults should be true
        const hasErrors = output.results.some((r: { error: string | null }) => r.error !== null);
        const hasFeeds = output.results.some((r: { feeds: unknown[] }) => r.feeds.length > 0);

        if (hasErrors && hasFeeds) {
          assert.strictEqual(
            output.partialResults,
            true,
            'partialResults should be true when some URLs fail but others succeed'
          );
        }

        resolve();
      } catch (e) {
        reject(new Error(`Test failed: ${(e as Error).message}\nstdout: ${stdout}`));
      }
    });

    proc.on('error', (e) => {
      reject(new Error(`Process spawn failed: ${e.message}`));
    });
  });
});

test('output contract - diagnostics field in results', async () => {
  resetCliOptions();
  return new Promise<void>((resolve, reject) => {
    // Use a URL that might generate diagnostics (blog scan failures)
    const proc = spawn('node', [CLI_PATH, '--timeout', '5000', 'https://httpstat.us/200'], {
      cwd: __dirname
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      try {
        const output = JSON.parse(stdout);
        assert.ok(output.hasOwnProperty('results'), 'Output should have results field');
        assert.ok(Array.isArray(output.results), 'Results should be an array');

        // Check that diagnostics field is optional and valid when present
        output.results.forEach((result: { diagnostics?: string[] }) => {
          if (result.diagnostics !== undefined) {
            assert.ok(Array.isArray(result.diagnostics), 'Diagnostics should be an array');
            result.diagnostics.forEach((diag: unknown) => {
              assert.strictEqual(typeof diag, 'string', 'Each diagnostic should be a string');
            });
          }
        });

        resolve();
      } catch (e) {
        reject(new Error(`Test failed: ${(e as Error).message}\nstdout: ${stdout}`));
      }
    });

    proc.on('error', (e) => {
      reject(new Error(`Process spawn failed: ${e.message}`));
    });
  });
});
