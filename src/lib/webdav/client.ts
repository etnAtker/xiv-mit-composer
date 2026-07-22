import type { WebDavSettings } from '../../model/sync';

export class WebDavError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'WebDavError';
    this.status = status;
  }
}

export function isWebDavConfigured(settings: WebDavSettings): boolean {
  return Boolean(settings.url.trim());
}

export async function testWebDavConnection(settings: WebDavSettings): Promise<void> {
  const response = await request(settings, normalizeDirectoryUrl(settings.url), {
    method: 'PROPFIND',
    headers: { Depth: '0' },
  });
  if (!response.ok) {
    throwResponseError(response, 'WebDAV 连接测试失败');
  }
}

export async function ensureWebDavDirectory(
  settings: WebDavSettings,
  directoryName: string,
): Promise<void> {
  const directoryUrl = resolveFileUrl(settings.url, `${sanitizeDirectoryName(directoryName)}/`);
  const current = await request(settings, directoryUrl, {
    method: 'PROPFIND',
    headers: { Depth: '0' },
  });
  if (current.ok) return;
  if (current.status !== 404) {
    throwResponseError(current, `检查远程目录 ${directoryName} 失败`);
  }

  const created = await request(settings, directoryUrl, { method: 'MKCOL' });
  if (!created.ok) {
    throwResponseError(created, `创建远程目录 ${directoryName} 失败`);
  }
}

export async function readWebDavText(
  settings: WebDavSettings,
  fileName: string,
): Promise<string | null> {
  const response = await request(settings, resolveFileUrl(settings.url, fileName), {
    method: 'GET',
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throwResponseError(response, `读取远程文件 ${fileName} 失败`);
  }
  return await response.text();
}

export async function readWebDavBytes(
  settings: WebDavSettings,
  fileName: string,
): Promise<Uint8Array | null> {
  const response = await request(settings, resolveFileUrl(settings.url, fileName), {
    method: 'GET',
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throwResponseError(response, `读取远程文件 ${fileName} 失败`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function writeWebDavText(
  settings: WebDavSettings,
  fileName: string,
  content: string,
): Promise<void> {
  const response = await request(settings, resolveFileUrl(settings.url, fileName), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: content,
  });
  if (!response.ok) {
    throwResponseError(response, `写入远程文件 ${fileName} 失败`);
  }
}

export async function writeWebDavBytes(
  settings: WebDavSettings,
  fileName: string,
  content: Uint8Array,
): Promise<void> {
  const body = new ArrayBuffer(content.byteLength);
  new Uint8Array(body).set(content);
  const response = await request(settings, resolveFileUrl(settings.url, fileName), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/gzip' },
    body,
  });
  if (!response.ok) {
    throwResponseError(response, `写入远程文件 ${fileName} 失败`);
  }
}

function normalizeDirectoryUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new WebDavError('请填写 WebDAV 地址');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new WebDavError('WebDAV 地址格式无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebDavError('WebDAV 地址必须使用 HTTP 或 HTTPS');
  }
  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return url.toString();
}

function resolveFileUrl(baseUrl: string, fileName: string): string {
  return new URL(fileName, normalizeDirectoryUrl(baseUrl)).toString();
}

function sanitizeDirectoryName(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed || trimmed.includes('/')) {
    throw new WebDavError('WebDAV 子目录名称无效');
  }
  return trimmed;
}

async function request(
  settings: WebDavSettings,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (settings.username || settings.password) {
    headers.set('Authorization', `Basic ${encodeBasicAuth(settings.username, settings.password)}`);
  }

  try {
    return await fetch(url, { ...init, headers });
  } catch (error) {
    throw new WebDavError(
      error instanceof Error
        ? `无法访问 WebDAV：${error.message}。请检查地址、网络和服务器 CORS 设置`
        : '无法访问 WebDAV，请检查地址、网络和服务器 CORS 设置',
    );
  }
}

function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function throwResponseError(response: Response, prefix: string): never {
  const authenticationHint =
    response.status === 401 || response.status === 403 ? '，请检查用户名、密码和目录权限' : '';
  throw new WebDavError(
    `${prefix}（HTTP ${response.status}）${authenticationHint}`,
    response.status,
  );
}
