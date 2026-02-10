import * as ftp from 'basic-ftp';
import { Readable } from 'stream';

const FTP_CONFIG = {
  host: process.env.SMAZKA_FTP_HOST || 'smazka.ru',
  port: parseInt(process.env.SMAZKA_FTP_PORT || '21', 10),
  user: process.env.SMAZKA_FTP_USER || '',
  password: process.env.SMAZKA_FTP_PASSWORD || '',
  remotePath: process.env.SMAZKA_FTP_PATH || '/data_test.json',
  secure: process.env.SMAZKA_FTP_SECURE === 'true',
};

export async function uploadFileViaFTP(content: string): Promise<void> {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: FTP_CONFIG.host,
      port: FTP_CONFIG.port,
      user: FTP_CONFIG.user,
      password: FTP_CONFIG.password,
      secure: FTP_CONFIG.secure,
    });

    // Convert string to readable stream
    const stream = Readable.from([content]);

    await client.uploadFrom(stream, FTP_CONFIG.remotePath);
  } finally {
    client.close();
  }
}

export async function downloadFileViaFTP(): Promise<string> {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: FTP_CONFIG.host,
      port: FTP_CONFIG.port,
      user: FTP_CONFIG.user,
      password: FTP_CONFIG.password,
      secure: FTP_CONFIG.secure,
    });

    const chunks: Buffer[] = [];
    const writable = new (require('stream').Writable)({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        chunks.push(chunk);
        callback();
      },
    });

    await client.downloadTo(writable, FTP_CONFIG.remotePath);

    return Buffer.concat(chunks).toString('utf-8');
  } finally {
    client.close();
  }
}
