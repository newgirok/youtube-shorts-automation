import { createDecipheriv } from 'node:crypto';

export function decrypt(encryptedValue: string, keyHex: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedValue.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('잘못된 암호화 데이터 형식');
  }

  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
}
