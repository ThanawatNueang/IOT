const express = require('express');
const http = require('http');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ['websocket', 'polling'], // รองรับทุกกรณี
  pingInterval: 25000,
  pingTimeout: 60000,
});

app.use(cors());
app.use(express.json());

let latest = { temp: null, hum: null, ts: null };
let pendingCommand = null; // คำสั่งล่าสุดสำหรับ ESP32 (ดึงครั้งเดียวแล้วเคลียร์)

// REST: ESP32 ส่งค่าเข้ามา
app.post('/ingest', (req, res) => {
  latest = { ...req.body, ts: Date.now() };
  io.emit('telemetry', latest);           // push ไป dashboard แบบ realtime
  return res.json({ ok: true });
});

// REST: ESP32 มาดึงคำสั่ง (ถ้ามี)
app.get('/command', (req, res) => {
  res.json({ command: pendingCommand });
}); 

// หน้าเว็บอยากดูค่าล่าสุดแบบกดรีเฟรช
app.get('/latest', (req, res) => res.json(latest));

// Socket.IO: Dashboard ส่งคำสั่งไปให้ ESP32
io.on('connection', (socket) => {
  console.log('dashboard connected');
  socket.on('set-command', (cmd) => {
    pendingCommand = cmd;                  // เช่น {led:true, pwm:128}
    io.emit('command-queued', cmd);
  });
});

const PORT = process.env.PORT || 8088;
server.listen(PORT, () => console.log('Server on', PORT));
