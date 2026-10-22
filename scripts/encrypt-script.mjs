#!/usr/bin/env node
/**
 * CLI Tool to encrypt dataset records into anonymous "script.enc"
 * Usage:
 *   node scripts/encrypt-script.mjs <input.json or input.txt> [output.enc]
 * Example:
 *   node scripts/encrypt-script.mjs data.json script.enc
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import cryptoUtils from '../crypto-utils.js';

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0];
  const outputFile = args[1] || 'script.enc';

  if (!inputFile) {
    console.error('Usage: node scripts/encrypt-script.mjs <input-file.json|txt> [output-file.enc]');
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputFile);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input file "${resolvedInput}" not found.`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(resolvedInput, 'utf-8').trim();
  let records = [];

  if (resolvedInput.endsWith('.json')) {
    try {
      const parsed = JSON.parse(fileContent);
      if (!Array.isArray(parsed)) {
        throw new Error('JSON root must be an array of person objects');
      }
      records = parsed;
    } catch (err) {
      console.error(`Invalid JSON in ${inputFile}:`, err.message);
      process.exit(1);
    }
  } else {
    // Treat as comma-separated lines: Name, MM-DD-YYYY, HH-MM-AM/PM (optional)
    const lines = fileContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const dateMatch = parts[1].match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (name && dateMatch) {
          const mo = dateMatch[1].padStart(2, '0');
          const day = dateMatch[2].padStart(2, '0');
          const yr = dateMatch[3];
          let birthTime = null;
          if (parts[2]) {
            const timeMatch = parts[2].match(/^(\d{1,2})-(\d{2})-(AM|PM)$/i);
            if (timeMatch) {
              let h = parseInt(timeMatch[1], 10);
              const m = timeMatch[2].padStart(2, '0');
              const ap = timeMatch[3].toUpperCase();
              if (ap === 'AM' && h === 12) h = 0;
              if (ap === 'PM' && h !== 12) h += 12;
              birthTime = `${String(h).padStart(2, '0')}:${m}`;
            }
          }
          records.push({
            name,
            dob: `${yr}-${mo}-${day}`,
            birthTime
          });
        }
      }
    }
  }

  if (records.length === 0) {
    console.error('Error: No valid records found in input file.');
    process.exit(1);
  }

  console.log(`Found ${records.length} record(s) to encrypt.`);

  // Prompt for passphrase securely
  let passphrase = process.env.PASSPHRASE;
  if (!passphrase) {
    const rl = readline.createInterface({ input, output });
    passphrase = await rl.question('Enter passphrase to encrypt: ');
    const confirm = await rl.question('Confirm passphrase: ');
    rl.close();

    if (passphrase !== confirm) {
      console.error('Error: Passphrases do not match.');
      process.exit(1);
    }
  }

  if (!passphrase || passphrase.length < 6) {
    console.error('Error: Passphrase must be at least 6 characters.');
    process.exit(1);
  }

  console.log('Deriving key (PBKDF2-HMAC-SHA-256 with 600,000 iterations)...');
  const payloadJson = JSON.stringify(records);
  const encrypted = await cryptoUtils.encryptData(payloadJson, passphrase, 600000);

  const resolvedOutput = path.resolve(process.cwd(), outputFile);
  fs.writeFileSync(resolvedOutput, encrypted, 'utf-8');

  console.log(`\nSuccessfully encrypted ${records.length} record(s) into:`);
  console.log(`  ${resolvedOutput}`);
  console.log('\nRemember: Never commit plaintext data or the passphrase to GitHub.');
}

main().catch(err => {
  console.error('Encryption failed:', err);
  process.exit(1);
});
