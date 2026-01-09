const isBrowser = typeof window !== 'undefined' && typeof window.crypto !== 'undefined';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error("Invalid base64 input");
  }
  try {
    const cleanBase64 = base64.replace(/[\s\n\r]/g, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    throw new Error("Failed to decode base64 string");
  }
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  if (!isBrowser) {
    throw new Error("Crypto operations require browser environment");
  }
  
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-512",
    },
    true,
    ["encrypt", "decrypt"]
  );
  return keyPair;
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return arrayBufferToBase64(exported);
}

export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  if (!base64Key) throw new Error("Public key is required");
  
  const binaryDer = base64ToArrayBuffer(base64Key);
  return await window.crypto.subtle.importKey(
    "spki",
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-512",
    },
    true,
    ["encrypt"]
  );
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const exported = await window.crypto.subtle.exportKey("pkcs8", key);
  return arrayBufferToBase64(exported);
}

export async function importPrivateKey(base64Key: string): Promise<CryptoKey> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  if (!base64Key || base64Key === "undefined" || base64Key === "null") {
    throw new Error("Valid private key is required");
  }
  
  const binaryDer = base64ToArrayBuffer(base64Key);
  return await window.crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-512",
    },
    true,
    ["decrypt"]
  );
}

export async function encryptMessage(message: string, publicKey: CryptoKey): Promise<string> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    data
  );
  return arrayBufferToBase64(encrypted);
}

export async function decryptMessage(encryptedBase64: string, privateKey: CryptoKey): Promise<string> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const data = base64ToArrayBuffer(encryptedBase64);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    data
  );
  return new TextDecoder().decode(decrypted);
}

export async function generateAESKey(): Promise<CryptoKey> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(exported);
}

export async function importAESKey(base64: string): Promise<CryptoKey> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const bytes = base64ToArrayBuffer(base64);
  return await window.crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptWithAES(text: string, key: CryptoKey): Promise<{ content: string; iv: string }> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    encoder.encode(text)
  );
  return {
    content: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer)
  };
}

export async function decryptWithAES(encryptedBase64: string, ivBase64: string, key: CryptoKey): Promise<string> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  
  const encryptedBytes = base64ToArrayBuffer(encryptedBase64);
  const ivBytes = new Uint8Array(base64ToArrayBuffer(ivBase64));

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes, tagLength: 128 },
    key,
    encryptedBytes
  );
  return new TextDecoder().decode(decrypted);
}

export async function encryptAESKeyForUser(aesKey: CryptoKey, userPublicKey: CryptoKey): Promise<string> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const exported = await window.crypto.subtle.exportKey("raw", aesKey);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    userPublicKey,
    exported
  );
  return arrayBufferToBase64(encrypted);
}

export async function decryptAESKeyWithUserPrivateKey(encryptedAESKeyBase64: string, userPrivateKey: CryptoKey): Promise<CryptoKey> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  
  if (!encryptedAESKeyBase64 || !userPrivateKey) {
    throw new Error("Encrypted AES key and private key are required");
  }
  
  const bytes = base64ToArrayBuffer(encryptedAESKeyBase64);
  if (bytes.byteLength === 0) {
    throw new Error("Invalid encrypted key format");
  }
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    userPrivateKey,
    bytes
  );
  
  return await window.crypto.subtle.importKey(
    "raw",
    decrypted,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

export function generateSecureToken(length: number = 32): string {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashData(data: string): Promise<string> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await window.crypto.subtle.digest('SHA-512', dataBuffer);
  return arrayBufferToBase64(hashBuffer);
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!isBrowser) throw new Error("Crypto operations require browser environment");
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  
  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 310000,
      hash: "SHA-512"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
