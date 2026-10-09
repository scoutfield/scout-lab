import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { encryptCredential, decryptCredential, saveCredentialToFolder, loadCredentialFromFolder, CREDENTIAL_FILE } from '../src/services/credentialFile.js';

const passphrase = 'test-only strong shared passphrase';
const token = 'test-only-api-token';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
const folder = () => {
  let contents;
  const file = {
    getFile: async () => ({ size: new TextEncoder().encode(contents).length, text: async () => contents }),
    createWritable: vi.fn(async () => {
      let pending;
      return { write: async (value) => { pending = value; }, close: async () => { contents = pending; }, abort: vi.fn() };
    }),
  };
  return {
    getFileHandle: vi.fn(async (name, options) => {
      expect(name).toBe(CREDENTIAL_FILE);
      if (contents === undefined && !options?.create) throw new DOMException('Missing', 'NotFoundError');
      return file;
    }),
    contents: () => contents,
    writes: file.createWritable,
    corrupt: () => { contents = '{}'; },
  };
};
describe('shared encrypted credential file', () => {
  it('uses fresh salt and IV and decrypts only with the correct passphrase', async () => {
    const a = await encryptCredential(token, passphrase);
    const b = await encryptCredential(token, passphrase);
    expect(a).not.toContain(token);
    expect(a).not.toContain(passphrase);
    expect(JSON.parse(a).salt).not.toBe(JSON.parse(b).salt);
    expect(JSON.parse(a).iv).not.toBe(JSON.parse(b).iv);
    expect(await decryptCredential(a, passphrase)).toBe(token);
    await expect(decryptCredential(a, 'wrong shared passphrase')).rejects.toThrow('Could not unlock');
    const tampered = JSON.parse(a);
    tampered.ciphertext = (tampered.ciphertext[0] === 'A' ? 'B' : 'A') + tampered.ciphertext.slice(1);
    await expect(decryptCredential(JSON.stringify(tampered), passphrase)).rejects.toThrow('Could not unlock');
  });
  it('transfers through a folder and refuses to overwrite with a wrong passphrase or corrupt file', async () => {
    const handle = folder();
    await saveCredentialToFolder(handle, token, passphrase);
    expect(await loadCredentialFromFolder(handle, passphrase)).toBe(token);
    const previous = handle.contents();
    await expect(saveCredentialToFolder(handle, 'replacement-token', 'wrong shared passphrase')).rejects.toThrow('Could not unlock');
    expect(handle.contents()).toBe(previous);
    expect(handle.writes).toHaveBeenCalledTimes(1);
    await saveCredentialToFolder(handle, 'replacement-token', passphrase);
    expect(await loadCredentialFromFolder(handle, passphrase)).toBe('replacement-token');
    handle.corrupt();
    await expect(saveCredentialToFolder(handle, token, passphrase)).rejects.toThrow('Could not unlock');
    expect(handle.writes).toHaveBeenCalledTimes(2);
  });
  it('rejects missing, oversized, malformed and unsupported files and weak passphrases', async () => {
    await expect(loadCredentialFromFolder(folder(), passphrase)).rejects.toThrow('No shared token file');
    await expect(encryptCredential(token, 'short')).rejects.toThrow('12');
    await expect(encryptCredential('', passphrase)).rejects.toThrow('valid Bright Data token');
    for (const text of ['x'.repeat(8193), '{}', '{', JSON.stringify({format:'scout-lab-credentials',version:2})]) {
      await expect(decryptCredential(text, passphrase)).rejects.toThrow('Could not unlock');
    }
  });
});
