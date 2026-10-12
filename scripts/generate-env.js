#!/usr/bin/env node
// Generates a local .env with random secrets. Never overwrites an existing .env.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const target = path.join(root, '.env');
if (fs.existsSync(target)) {
  console.log('.env already exists - leaving it untouched.');
  process.exit(0);
}
let text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
text = text
  .replace(/__GEN_PASSWORD__/g, () => crypto.randomBytes(18).toString('base64url'))
  .replace(/__GEN_SECRET__/g, () => crypto.randomBytes(48).toString('base64url'))
  .replace(/__GEN_HEX32__/g, () => crypto.randomBytes(32).toString('hex'));
fs.writeFileSync(target, text, { mode: 0o600 });
console.log('Created .env with freshly generated secrets.');
