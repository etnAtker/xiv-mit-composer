import { XMC_PROJECT_PREFIX, type XmcProjectDocument } from '../../model/project';
import { gzipText, gunzipText } from '../../utils/compression';

export class ProjectCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectCodecError';
  }
}

export async function encodeProjectDocument(document: XmcProjectDocument): Promise<string> {
  const json = JSON.stringify(document);
  const compressed = await gzipText(json);
  return `${XMC_PROJECT_PREFIX}${bytesToBase64Url(compressed)}`;
}

export async function decodeProjectDocument(text: string): Promise<XmcProjectDocument> {
  const payload = text.trim();
  if (!payload.startsWith(XMC_PROJECT_PREFIX)) {
    throw new ProjectCodecError('工程文本格式不正确');
  }

  try {
    const compressed = base64UrlToBytes(payload.slice(XMC_PROJECT_PREFIX.length));
    const json = await gunzipText(compressed);
    return JSON.parse(json) as XmcProjectDocument;
  } catch (error) {
    if (error instanceof ProjectCodecError) throw error;
    throw new ProjectCodecError('工程文本解析失败');
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
