// server.js
const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
});

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

let latest = { temp: null, hum: null, ts: null };
/** เก็บ client ของ ESP32 ที่ต่อผ่าน WS */
const espClients = new Set();

/** ===== WebSocket สำหรับ ESP32 ===== */
wss.on('connection', (ws) => {
  espClients.add(ws);
  console.log('[ESP] connected. Total ESP:', espClients.size);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // ESP ส่ง telemetry: {type:'telemetry', temp, hum, rssi, ...}
      if (msg.type === 'telemetry') {
        latest = { ...msg, ts: Date.now() };
        io.emit('telemetry', latest); // push ไปแดชบอร์ดแบบ realtime
      }

      // ESP ขอ snapshot ล่าสุด (ไม่จำเป็น แต่เผื่อไว้)
      if (msg.type === 'hello') {
        ws.send(JSON.stringify({ type: 'hello-ack', ts: Date.now() }));
      }
    } catch (e) {
      console.error('WS parse error:', e);
    }
  });

  ws.on('close', () => {
    espClients.delete(ws);
    console.log('[ESP] disconnected. Total ESP:', espClients.size);
  });
});

/** ===== Socket.IO สำหรับเว็บแดชบอร์ด ===== */
io.on('connection', (socket) => {
  console.log('[Dashboard] connected');

  // ส่งค่าล่าสุดให้ทันทีเมื่อมีคนเข้ามา
  if (latest.ts) socket.emit('telemetry', latest);

  // แดชบอร์ดสั่งคำสั่งไปยัง ESP ทั้งหมด
  // ตัวอย่าง payload: { led: true } หรือ { led:false, pwm:128 }
  socket.on('set-command', (cmd) => {
    const payload = JSON.stringify({ type: 'command', ...cmd });
    for (const ws of espClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    io.emit('command-queued', cmd);
  });

  socket.on('disconnect', () => {
    console.log('[Dashboard] disconnected');
  });
});

/** REST เผื่อ debug/ดึงค่าล่าสุด */
app.get('/latest', (req, res) => res.json(latest));

const PORT = process.env.PORT || 8088;
server.listen(PORT, () => console.log('Server listening on', PORT));
