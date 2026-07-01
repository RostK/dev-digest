/**
 * Tests for config.ts — loadConfig.
 *
 * Validates that env values are coerced + validated (not blindly Number()'d),
 * defaults apply when unset, and bad input fails fast with a clear message
 * naming the offending env var — instead of silently starting with NaN.
 */

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig — defaults', () => {
  it('applies defaults when env vars are unset', () => {
    const cfg = loadConfig({});

    expect(cfg.apiUrl).toBe('http://localhost:3001');
    expect(cfg.reviewTimeoutMs).toBe(180_000);
    expect(cfg.pollIntervalMs).toBe(2_000);
  });
});

describe('loadConfig — valid overrides', () => {
  it('coerces numeric strings to numbers', () => {
    const cfg = loadConfig({
      DEVDIGEST_API_URL: 'http://api.test:4000',
      MCP_REVIEW_TIMEOUT_MS: '60000',
      MCP_POLL_INTERVAL_MS: '500',
    });

    expect(cfg.apiUrl).toBe('http://api.test:4000');
    expect(cfg.reviewTimeoutMs).toBe(60_000);
    expect(cfg.pollIntervalMs).toBe(500);
  });
});

describe('loadConfig — invalid input fails fast', () => {
  it('throws on a non-numeric timeout (would otherwise be NaN)', () => {
    expect(() => loadConfig({ MCP_REVIEW_TIMEOUT_MS: 'abc' })).toThrow(
      /MCP_REVIEW_TIMEOUT_MS/,
    );
  });

  it('throws on a non-numeric poll interval', () => {
    expect(() => loadConfig({ MCP_POLL_INTERVAL_MS: 'soon' })).toThrow(
      /MCP_POLL_INTERVAL_MS/,
    );
  });

  it('throws on a non-positive timeout', () => {
    expect(() => loadConfig({ MCP_REVIEW_TIMEOUT_MS: '0' })).toThrow(
      /MCP_REVIEW_TIMEOUT_MS/,
    );
    expect(() => loadConfig({ MCP_REVIEW_TIMEOUT_MS: '-5' })).toThrow(
      /MCP_REVIEW_TIMEOUT_MS/,
    );
  });

  it('throws on a non-integer interval', () => {
    expect(() => loadConfig({ MCP_POLL_INTERVAL_MS: '2.5' })).toThrow(
      /MCP_POLL_INTERVAL_MS/,
    );
  });

  it('throws on a malformed API url', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not-a-url' })).toThrow(
      /DEVDIGEST_API_URL/,
    );
  });
});
