import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureWebDavDirectory,
  readWebDavBytes,
  readWebDavText,
  testWebDavConnection,
  writeWebDavBytes,
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

test('WebDAV 客户端会以二进制方式读写 gzip 存档', async () => {
  const originalFetch = globalThis.fetch;
  const uploadedBodies: ArrayBuffer[] = [];
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'GET') {
      return new Response(new Uint8Array([0x1f, 0x8b, 0x01]), { status: 200 });
    }
    uploadedBodies.push(init?.body as ArrayBuffer);
    return new Response(null, { status: 201 });
  };

  try {
    const settings = { url: 'https://example.com/dav/', username: '', password: '' };
    const downloaded = await readWebDavBytes(settings, 'archive.gz');
    await writeWebDavBytes(settings, 'archive.gz', new Uint8Array([0x1f, 0x8b, 0x02]));

    assert.deepEqual(Array.from(downloaded ?? []), [0x1f, 0x8b, 0x01]);
    assert.deepEqual(Array.from(new Uint8Array(uploadedBodies[0]!)), [0x1f, 0x8b, 0x02]);
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
