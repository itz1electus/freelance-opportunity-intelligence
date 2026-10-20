import { describe, expect, it } from 'vitest';
import { makeTestServer } from './helpers.ts';

describe('P1-01: a fresh start serves health and the UI on loopback only', () => {
  it('listens on 127.0.0.1 and answers real HTTP requests', async () => {
    const port = 42000 + Math.floor(Math.random() * 15000);
    const server = makeTestServer({ port });
    const { url } = await server.runtime.listen();
    try {
      expect(url).toBe(`http://127.0.0.1:${port}`);
      const health = await fetch(`${url}/api/v1/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: 'ok' });

      const page = await fetch(`${url}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(await page.text()).toContain('FOI test shell');

      // The listening socket is bound to the loopback address, not all interfaces.
      const blocked = await fetch(`http://localhost:${port}/api/v1/health`).catch(() => null);
      if (blocked) expect(blocked.status).toBe(403);
    } finally {
      await server.runtime.shutdown();
    }
  });
});
