const FORMAT = 'scout-lab-credentials';
const ITERATIONS = 600_000;
const MAX_BYTES = 8192;
export const CREDENTIAL_FILE = 'scout-lab-credentials.json';
const encoder = new TextEncoder();
const aad = encoder.encode(`${FORMAT}:1`);
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value) => {
  if (typeof value !== 'string' || value.length > MAX_BYTES) throw new Error('Invalid credential file.');
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
};
const validatePassphrase = (passphrase) => {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
    throw new Error('Use a shared passphrase of 12–1024 characters.');
  }
};
const validateToken = (token) => {
  if (typeof token !== 'string' || !token || token.length > 2048 || /\s/.test(token)) {
    throw new Error('Save a valid Bright Data token locally first.');
  }
};
const deriveKey = async (passphrase, salt) => {
  validatePassphrase(passphrase);
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
};
export const encryptCredential = async (token, passphrase) => {
  validateToken(token);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, encoder.encode(token));
  return JSON.stringify({ format: FORMAT, version: 1, algorithm: 'AES-GCM', iterations: ITERATIONS,
    salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) });
};
export const decryptCredential = async (text, passphrase) => {
  validatePassphrase(passphrase);
  try {
    if (typeof text !== 'string' || encoder.encode(text).length > MAX_BYTES) throw new Error();
    const file = JSON.parse(text);
    if (file.format !== FORMAT || file.version !== 1 || file.algorithm !== 'AES-GCM' || file.iterations !== ITERATIONS) throw new Error();
    const salt = fromBase64(file.salt), iv = fromBase64(file.iv), ciphertext = fromBase64(file.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17 || ciphertext.length > 2064) throw new Error();
    const key = await deriveKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, ciphertext);
    const token = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    validateToken(token);
    return token;
  } catch {
    throw new Error('Could not unlock the credential file. Check your passphrase and the file.');
  }
};
const readFile = async (handle) => {
  const file = await handle.getFile();
  if (file.size > MAX_BYTES) throw new Error('Credential file is too large.');
  return file.text();
};
export const loadCredentialFromFolder = async (folder, passphrase) => {
  let handle;
  try { handle = await folder.getFileHandle(CREDENTIAL_FILE); }
  catch (error) {
    if (error.name === 'NotFoundError') throw new Error('No shared token file yet. Save it from your first device and wait for iCloud to sync.');
    throw new Error('Could not read the credential file. Reconnect your folder.');
  }
  return decryptCredential(await readFile(handle), passphrase);
};
export const saveCredentialToFolder = async (folder, token, passphrase) => {
  validateToken(token);
  validatePassphrase(passphrase);
  let existing;
  try { existing = await folder.getFileHandle(CREDENTIAL_FILE); }
  catch (error) {
    if (error.name !== 'NotFoundError') throw new Error('Could not check the credential file. Reconnect your folder.');
  }
  // Verify the existing passphrase before replacing a shared credential.
  if (existing) await decryptCredential(await readFile(existing), passphrase);
  const encrypted = await encryptCredential(token, passphrase);
  const handle = existing || await folder.getFileHandle(CREDENTIAL_FILE, { create: true });
  const writable = await handle.createWritable();
  try { await writable.write(`${encrypted}\n`); await writable.close(); }
  catch (error) { await writable.abort?.().catch(() => {}); throw error; }
  return CREDENTIAL_FILE;
};
