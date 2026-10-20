import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectRiskyLocation, filterFields, loadConfig, LOOPBACK_HOST } from '../src/index.ts';

const repoWith = (config: unknown) => {
  const dir = mkdtempSync(join(tmpdir(), 'foi-cfg-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  return dir;
};

describe('configuration', () => {
  it('defaults to loopback, port 4311 and demo mode', () => {
    const cfg = loadConfig({ repoRoot: repoWith({}), env: {} });
    expect(cfg).toMatchObject({ host: LOOPBACK_HOST, port: 4311, fixtureMode: true, logLevel: 'info' });
    expect(cfg.dataDir.endsWith('/data')).toBe(true);
  });

  it('P1-11: a non-loopback bind address is ignored and reported', () => {
    const cfg = loadConfig({
      repoRoot: repoWith({ bindHost: '0.0.0.0', port: 5000 }),
      env: { FOI_BIND_HOST: '0.0.0.0' },
    });
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(5000);
    expect(cfg.warnings.some((w) => w.includes('bindHost'))).toBe(true);
    expect(cfg.warnings.some((w) => w.includes('FOI_BIND_HOST'))).toBe(true);
  });

  it('applies environment overrides and rejects bad values', () => {
    const repo = repoWith({ port: 4311 });
    const cfg = loadConfig({ repoRoot: repo, env: { FOI_PORT: '4400', FOI_FIXTURE_MODE: 'false', FOI_DATA_DIR: '/tmp/x' } });
    expect(cfg).toMatchObject({ port: 4400, fixtureMode: false, dataDir: '/tmp/x' });
    expect(() => loadConfig({ repoRoot: repo, env: { FOI_PORT: '80' } })).toThrow(/Port/);
    expect(() => loadConfig({ repoRoot: repo, env: { FOI_FIXTURE_MODE: 'maybe' } })).toThrow(/true or false/);
  });
});

describe('P1-12: risky data locations', () => {
  it('warns for synced and network folders', () => {
    for (const p of [
      '/Users/m/Library/Mobile Documents/com~apple~CloudDocs/foi/data',
      '/Users/m/Library/CloudStorage/Dropbox/foi/data',
      '/Users/m/Dropbox/foi/data',
      '/Volumes/NAS/foi/data',
    ]) {
      expect(detectRiskyLocation(p).length, p).toBeGreaterThan(0);
    }
  });

  it('stays quiet for an ordinary local folder', () => {
    expect(detectRiskyLocation('/Users/m/Projects/foi/data')).toEqual([]);
  });
});

describe('SEC-15: log field allowlist', () => {
  it('drops fields that are not allowlisted and truncates long values', () => {
    const out = filterFields({ requestId: 'r1', authorization: 'Bearer secret', body: 'listing text', error: 'x'.repeat(1000) });
    expect(out.requestId).toBe('r1');
    expect(out).not.toHaveProperty('authorization');
    expect(out).not.toHaveProperty('body');
    expect(out.droppedFields).toBe(2);
    expect(String(out.error).length).toBeLessThanOrEqual(301);
  });
});
