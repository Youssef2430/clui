#!/usr/bin/env node
const http = require('node:http')
const server = http.createServer((req, res) => {
  const expected = 'Basic ' + Buffer.from('glui:' + process.env.OPENCODE_SERVER_PASSWORD).toString('base64')
  if (req.headers.authorization !== expected) { res.writeHead(401); res.end(); return }
  if (req.url === '/health') { res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); return }
  if (req.url !== '/event') { res.writeHead(503); res.end('unavailable'); return }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  res.flushHeaders()
  res.write('data: {"type":"first"}\r')
  setTimeout(() => res.write('\n\r'), 10)
  setTimeout(() => res.write('\ndata: {"type":"second"}\r\n\r'), 20)
  setTimeout(() => res.write('\n'), 30)
})
server.listen(0, '127.0.0.1', () => console.log(`OpenCode server listening on http://127.0.0.1:${server.address().port}`))
