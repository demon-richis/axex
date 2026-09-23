const http = require('http');
const net = require('net');

function checkIP(ip) {
  if (!ip || !net.isIP(ip)) return Promise.resolve({ isVPN: false, ip: null });

  return new Promise((resolve) => {
    const request = http.get({
      hostname: 'ip-api.com',
      path: `/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting,vpn,query`,
      timeout: 4_000
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({
            isVPN: Boolean(parsed.proxy || parsed.vpn || parsed.hosting),
            ip: parsed.query || null
          });
        } catch {
          resolve({ isVPN: false, ip: null });
        }
      });
    });
    request.once('timeout', () => request.destroy());
    request.once('error', () => resolve({ isVPN: false, ip: null }));
  });
}

module.exports = { checkIP };
