import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureWebDavDirectory,
  readWebDavText,
  testWebDavConnection,
  writeWebDavText,
} from '../src/lib/webdav/client';

test('WebDAV 客户端会在指定目录使用认证执行连接测试、读取和写入', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (init?.method === 'PROPFIND') return new Response(null, { status: 207 });
    if (init?.method === 'GET') return new Response(null, { status: 404 });
    return new Response(null, { status: 201 });
  };

  try {
    const settings = {
      url: 'https://example.com/dav/xmc',
      username: 'user',
      password: 'pass',
    };
    await testWebDavConnection(settings);
    assert.equal(await readWebDavText(settings, 'archive.json'), null);
    await writeWebDavText(settings, 'archive.json', '{"ok":true}');

    assert.deepEqual(
      requests.map((request) => [request.url, request.init?.method]),
      [
        ['https://example.com/dav/xmc/', 'PROPFIND'],
        ['https://example.com/dav/xmc/archive.json', 'GET'],
        ['https://example.com/dav/xmc/archive.json', 'PUT'],
      ],
    );
    for (const request of requests) {
      const headers = new Headers(request.init?.headers);
      assert.equal(headers.get('Authorization'), 'Basic dXNlcjpwYXNz');
    }
    assert.equal(new Headers(requests[0]?.init?.headers).get('Depth'), '0');
    assert.equal(requests[2]?.init?.body, '{"ok":true}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WebDAV 客户端会在目标子目录不存在时使用 MKCOL 创建', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method });
    return init?.method === 'PROPFIND'
      ? new Response(null, { status: 404 })
      : new Response(null, { status: 201 });
  };

  try {
    await ensureWebDavDirectory(
      { url: 'https://example.com/dav/', username: '', password: '' },
      'xiv-mit-composer',
    );

    assert.deepEqual(requests, [
      { url: 'https://example.com/dav/xiv-mit-composer/', method: 'PROPFIND' },
      { url: 'https://example.com/dav/xiv-mit-composer/', method: 'MKCOL' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
