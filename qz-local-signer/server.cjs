const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.QZ_SIGNER_PORT || 8182);
const BASE_DIR = __dirname;
const CERT_PATH = path.join(BASE_DIR, 'digital-certificate.txt');
const KEY_PATH = path.join(BASE_DIR, 'private-key.pem');

const readTextFile = (filePath) => fs.readFileSync(filePath, 'utf8');

const send = (res, status, body, contentType = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

const readRequestBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1024 * 1024) {
      reject(new Error('Requete trop volumineuse.'));
      req.destroy();
    }
  });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const getRequestToSign = (rawBody, contentType) => {
  if ((contentType || '').includes('application/json')) {
    const payload = JSON.parse(rawBody || '{}');
    return String(payload.request || payload.toSign || '');
  }
  return String(rawBody || '');
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      send(res, 204, '');
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      send(res, 200, JSON.stringify({
        ok: true,
        service: 'qz-local-signer',
        port: PORT,
        certificate: fs.existsSync(CERT_PATH),
        privateKey: fs.existsSync(KEY_PATH),
      }), 'application/json; charset=utf-8');
      return;
    }

    if (req.method === 'GET' && req.url === '/certificate') {
      send(res, 200, readTextFile(CERT_PATH));
      return;
    }

    if (req.method === 'POST' && req.url === '/sign') {
      const rawBody = await readRequestBody(req);
      const toSign = getRequestToSign(rawBody, req.headers['content-type']);
      if (!toSign) {
        send(res, 400, 'Aucune donnee a signer.');
        return;
      }
      const privateKey = readTextFile(KEY_PATH);
      const signature = crypto.createSign('SHA512').update(toSign, 'utf8').sign(privateKey, 'base64');
      send(res, 200, signature);
      return;
    }

    send(res, 404, 'Endpoint inconnu.');
  } catch (error) {
    send(res, 500, error instanceof Error ? error.message : 'Erreur signature QZ.');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`QZ local signer CHNCAK lance sur http://127.0.0.1:${PORT}`);
  console.log(`Certificat: ${CERT_PATH}`);
  console.log(`Cle privee: ${KEY_PATH}`);
});
