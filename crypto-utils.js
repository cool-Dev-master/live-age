/* =============================================
   LIVE AGE — crypto-utils.js
   Web Crypto API AES-256-GCM + PBKDF2-HMAC-SHA-256
   Compatible with modern browsers and Node.js v18+
   ============================================= */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js environment
    const nodeCrypto = require('node:crypto');
    module.exports = factory(nodeCrypto.webcrypto || globalThis.crypto);
  } else {
    // Browser environment
    root.CryptoUtils = factory(window.crypto);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cryptoApi) {
  'use strict';

  const PBKDF2_ITERATIONS = 600000;
  const SALT_BYTE_LENGTH = 16;
  const NONCE_BYTE_LENGTH = 12; // 96 bits for AES-GCM
  const TAG_LENGTH_BITS = 128;

  // Base64 helpers for Uint8Array
  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Derive AES-256-GCM key from passphrase using PBKDF2-HMAC-SHA-256
   */
  async function deriveKey(passphrase, saltBytes, iterations = PBKDF2_ITERATIONS) {
    const enc = new TextEncoder();
    const keyMaterial = await cryptoApi.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await cryptoApi.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  const VERSION_BYTE = 1;

  /**
   * Encrypt plaintext string with passphrase
   * Returns a single compact Base64 string: [version (1B) + salt (16B) + iv (12B) + ciphertext]
   * If asJson=true, returns versioned JSON string
   */
  async function encryptData(plaintextStr, passphrase, iterations = PBKDF2_ITERATIONS, asJson = false) {
    if (!passphrase || typeof passphrase !== 'string') {
      throw new Error('A valid passphrase is required for encryption.');
    }

    const salt = new Uint8Array(SALT_BYTE_LENGTH);
    cryptoApi.getRandomValues(salt);

    const iv = new Uint8Array(NONCE_BYTE_LENGTH);
    cryptoApi.getRandomValues(iv);

    const key = await deriveKey(passphrase, salt, iterations);
    const enc = new TextEncoder();
    const encodedData = enc.encode(plaintextStr);

    const ciphertextBuffer = await cryptoApi.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: TAG_LENGTH_BITS
      },
      key,
      encodedData
    );

    const ciphertextBytes = new Uint8Array(ciphertextBuffer);

    if (asJson) {
      const payload = {
        version: VERSION_BYTE,
        kdf: {
          algorithm: 'PBKDF2',
          hash: 'SHA-256',
          iterations: iterations,
          salt: bytesToBase64(salt)
        },
        cipher: {
          algorithm: 'AES-GCM',
          iv: bytesToBase64(iv),
          tagLength: TAG_LENGTH_BITS
        },
        ciphertext: bytesToBase64(ciphertextBytes)
      };
      return JSON.stringify(payload, null, 2);
    }

    // Default: Single compact binary string packed as [version (1B) + iterations (4B) + salt (16B) + iv (12B) + ciphertext]
    const headerLen = 1 + 4 + salt.length + iv.length;
    const packed = new Uint8Array(headerLen + ciphertextBytes.length);
    packed[0] = VERSION_BYTE;
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    view.setUint32(1, iterations, false); // 4 bytes Big Endian
    packed.set(salt, 5);
    packed.set(iv, 5 + salt.length);
    packed.set(ciphertextBytes, headerLen);

    return bytesToBase64(packed);
  }

  /**
   * Decrypt encrypted payload with passphrase
   * Supports both single compact Base64 string and legacy JSON format
   * Throws an error if authentication fails (wrong password or tampered ciphertext)
   */
  async function decryptData(encryptedInput, passphrase) {
    if (!passphrase || typeof passphrase !== 'string') {
      throw new Error('A valid passphrase is required for decryption.');
    }
    if (!encryptedInput || (typeof encryptedInput !== 'string' && !(encryptedInput instanceof Uint8Array))) {
      throw new Error('Encrypted payload is missing or invalid.');
    }

    let salt, iv, ciphertextBytes, iterations = PBKDF2_ITERATIONS;

    // Check if input is JSON format (starts with '{' after trimming)
    const trimmed = typeof encryptedInput === 'string' ? encryptedInput.trim() : '';
    if (trimmed.startsWith('{')) {
      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        throw new Error('Malformed encrypted file format: invalid JSON.');
      }

      if (!payload || payload.version !== 1) {
        throw new Error('Unsupported or missing encrypted file version.');
      }
      if (!payload.kdf || !payload.kdf.salt || !payload.cipher || !payload.cipher.iv || !payload.ciphertext) {
        throw new Error('Invalid or unsupported encrypted parameters.');
      }

      salt = base64ToBytes(payload.kdf.salt);
      iv = base64ToBytes(payload.cipher.iv);
      ciphertextBytes = base64ToBytes(payload.ciphertext);
      iterations = payload.kdf.iterations || PBKDF2_ITERATIONS;
    } else {
      // Compact single Base64 string format
      let rawBytes;
      try {
        rawBytes = typeof encryptedInput === 'string' ? base64ToBytes(trimmed) : encryptedInput;
      } catch {
        throw new Error('Malformed encrypted data: invalid base64 encoding.');
      }

      const headerLen = 1 + 4 + SALT_BYTE_LENGTH + NONCE_BYTE_LENGTH; // 1 + 4 + 16 + 12 = 33
      const minLength = headerLen + 16; // at least 33 + 16 (tag) = 49 bytes
      if (!rawBytes || rawBytes.length < minLength) {
        throw new Error('Malformed encrypted data: payload too short.');
      }

      const version = rawBytes[0];
      if (version !== 1) {
        throw new Error(`Unsupported encrypted payload version: ${version}.`);
      }

      const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
      iterations = view.getUint32(1, false);
      salt = rawBytes.slice(5, 5 + SALT_BYTE_LENGTH);
      iv = rawBytes.slice(5 + SALT_BYTE_LENGTH, headerLen);
      ciphertextBytes = rawBytes.slice(headerLen);
    }

    if (iterations < 100000) {
      throw new Error('Insecure iteration count rejected.');
    }

    const key = await deriveKey(passphrase, salt, iterations);

    let decryptedBuffer;
    try {
      decryptedBuffer = await cryptoApi.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: TAG_LENGTH_BITS
        },
        key,
        ciphertextBytes
      );
    } catch {
      // AES-GCM fails authentication when password is wrong or ciphertext is tampered
      throw new Error('Decryption failed: Incorrect passphrase or corrupted data.');
    }

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  }

  return {
    PBKDF2_ITERATIONS,
    deriveKey,
    encryptData,
    decryptData,
    bytesToBase64,
    base64ToBytes
  };
});
