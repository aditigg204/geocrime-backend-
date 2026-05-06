const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const app = require('./app');
const { port, clientOrigin, jwtSecret } = require('./config/env');

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: clientOrigin === '*' ? '*' : clientOrigin } });
app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next();

  try {
    socket.user = jwt.verify(token, jwtSecret);
  } catch (_) {
    return next(new Error('Invalid socket token'));
  }
  return next();
});

io.on('connection', socket => {
  console.log('Socket connected', socket.id);
  if (socket.user?.id) socket.join(`user:${socket.user.id}`);
  if (socket.user?.role) {
    socket.join(`role:${socket.user.role}`);
    socket.join(socket.user.role);
    if (socket.user.role === 'officer') socket.join(`officer:${socket.user.id}`);
  }
  socket.on('join.role', role => {
    socket.join(`role:${role}`);
    socket.join(role);
  });
  socket.on('join.user', userId => socket.join(`user:${userId}`));
  socket.on('join.zone', zoneId => socket.join(`zone:${zoneId}`));
  socket.on('disconnect', () => console.log('Socket disconnected', socket.id));
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Stop the existing backend process or set PORT to another value.`
    );
    process.exit(1);
  }

  console.error('Server failed to start:', error);
  process.exit(1);
});

server.listen(port, () => console.log(`GeoCrime API running on http://localhost:${port}`));
