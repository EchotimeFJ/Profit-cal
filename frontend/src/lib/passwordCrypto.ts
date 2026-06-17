import { API_BASE } from './api';

interface PasswordKeyResponse {
  algorithm: string;
  public_key: string;
}

let cachedPublicKey: CryptoKey | null = null;

const pemToArrayBuffer = (pem: string) => {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
};

const bytesToBase64 = (bytes: ArrayBuffer) => {
  const values = new Uint8Array(bytes);
  let binary = '';

  values.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return window.btoa(binary);
};

const getPasswordPublicKey = async () => {
  if (cachedPublicKey) {
    return cachedPublicKey;
  }

  if (!window.crypto?.subtle) {
    throw new Error('当前浏览器不支持密码加密，请使用最新版 Chrome、Edge 或 Safari');
  }

  const response = await fetch(`${API_BASE}/auth/password-key`);
  if (!response.ok) {
    throw new Error('获取密码加密公钥失败');
  }

  const data = await response.json() as PasswordKeyResponse;
  if (data.algorithm !== 'RSA-OAEP-256') {
    throw new Error('密码加密算法不匹配');
  }

  cachedPublicKey = await window.crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(data.public_key),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );

  return cachedPublicKey;
};

export const encryptPassword = async (password: string) => {
  const publicKey = await getPasswordPublicKey();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    new TextEncoder().encode(password),
  );

  return bytesToBase64(encrypted);
};
