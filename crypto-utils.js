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

  /**
   * Encrypt plaintext string with passphrase
   * Returns a versioned JSON string containing algorithm, salt, iv, tagLength, and ciphertext
   */
  async function encryptData(plaintextStr, passphrase, iterations = PBKDF2_ITERATIONS) {
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

    const payload = {
      version: 1,
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

  /**
   * Decrypt versioned encrypted payload with passphrase
   * Throws an error if authentication fails (wrong password or tampered ciphertext)
   */
  async function decryptData(encryptedJsonStr, passphrase) {
    if (!passphrase || typeof passphrase !== 'string') {
      throw new Error('A valid passphrase is required for decryption.');
    }

    let payload;
    try {
      payload = typeof encryptedJsonStr === 'string' ? JSON.parse(encryptedJsonStr) : encryptedJsonStr;
    } catch {
      throw new Error('Malformed encrypted file format: invalid JSON.');
    }

    if (!payload || payload.version !== 1) {
      throw new Error('Unsupported or missing encrypted file version.');
    }

    if (
      !payload.kdf ||
      payload.kdf.algorithm !== 'PBKDF2' ||
      payload.kdf.hash !== 'SHA-256' ||
      !payload.kdf.salt ||
      !payload.kdf.iterations
    ) {
      throw new Error('Invalid or unsupported key derivation parameters.');
    }

    if (
      !payload.cipher ||
      payload.cipher.algorithm !== 'AES-GCM' ||
      !payload.cipher.iv ||
      !payload.ciphertext
    ) {
      throw new Error('Invalid or unsupported cipher parameters.');
    }

    const salt = base64ToBytes(payload.kdf.salt);
    const iv = base64ToBytes(payload.cipher.iv);
    const ciphertextBytes = base64ToBytes(payload.ciphertext);
    const iterations = payload.kdf.iterations;

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
          tagLength: payload.cipher.tagLength || TAG_LENGTH_BITS
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
