---
name: stabilize-discovery-output
overview: Stabilize `rss-agent-discovery` output so consumers can reliably parse JSON, reduce stderr noise by default, and add tests to lock in the new behavior without regressing discovery accuracy or timeouts.
todos: []
isProject: false
---

# Stabilize Discovery Output and Tests

## Context

Discovery currently emits JSON to stdout but also writes errors to stderr unconditionally, which breaks downstream parsers expecting JSON-only output. The logging happens during scanning and error handling, while results are already returned in the JSON structure:

```332:334:/Users/garthscaysbrook/Code/rss-agent-discovery/find-rss-feeds.ts
  } catch (e) {
    console.error(`Error scanning ${url}: ${(e as Error).message}`);
    return { html: null, feeds: [] };
```

```386:399:/Users/garthscaysbrook/Code/rss-agent-discovery/find-rss-feeds.ts
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
```

```447:468:/Users/garthscaysbrook/Code/rss-agent-discovery/find-rss-feeds.ts
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
```

## Plan

- **Normalize output and logging**
  - In `[find-rss-feeds.ts](/Users/garthscaysbrook/Code/rss-agent-discovery/find-rss-feeds.ts)`, gate all stderr logging behind `--verbose` (including scan failures and per-URL errors). Keep JSON as the single default output.
  - Add a structured `diagnostics` or `warnings` field to each `DiscoveredResult` so that errors can be preserved in JSON without leaking to stderr. This keeps downstream parsers stable while still surfacing issues.
  - Update help text/README to document the logging contract: JSON-only stdout by default; stderr only with `--verbose`.
- **Harden timeout + error handling**
  - Ensure all fetches honor the timeout signal and errors are surfaced in JSON (not stderr). If needed, create a small helper to wrap `fetch` and standardize timeout error messages.
  - Clarify `partialResults` semantics and set it consistently when any URL fails but others succeed.
- **Add tests for stability**
  - In `[find-rss-feeds.test.ts](/Users/garthscaysbrook/Code/rss-agent-discovery/find-rss-feeds.test.ts)`, add unit tests that:
    - Assert errors are returned in JSON fields, not via stderr when `--verbose` is off.
    - Validate timeout behavior and ensure it produces a stable `error: "Timeout"` value.
    - Confirm `partialResults` behavior when one URL fails and another succeeds.
  - Add a lightweight CLI smoke test (spawn node process) to verify stdout is valid JSON and stderr is empty in non-verbose mode.
- **Documentation alignment**
  - Update `[README.md](/Users/garthscaysbrook/Code/rss-agent-discovery/README.md)` with the JSON schema (including the new `diagnostics`/`warnings` field) and clarify how stderr is used.
  - Document the recommended integration pattern for consumers (parse stdout JSON only; enable `--verbose` for troubleshooting).

## Todos

- **audit-output-paths**: Identify all stderr writes and route them through a verbose-only logger; add JSON diagnostics field.
- **timeout-helper**: Centralize timeout/error normalization and apply to all fetches.
- **test-output-contract**: Add tests for JSON-only output, timeout error normalization, and partial results.
- **docs-update**: Update README/help text with new output contract and schema.

