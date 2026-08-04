const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { ATTACHMENT_DIR } = require('../utils/config');

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip'];

function ensureDir() {
  fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });
}

function isAllowed(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

function downloadFile(url, destFilename) {
  return new Promise((resolve, reject) => {
    ensureDir();
    const dest = path.join(ATTACHMENT_DIR, destFilename);
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function deleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = { isAllowed, downloadFile, deleteFile };
