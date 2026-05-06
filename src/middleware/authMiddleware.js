const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { jwtSecret } = require('../config/env');
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Missing authorization token' });
    const payload = jwt.verify(token, jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { settings: true } });
    if (!user || user.status !== 'active') return res.status(401).json({ success: false, message: 'Invalid or inactive user' });
    req.user = user;
    next();
  } catch (e) { return res.status(401).json({ success: false, message: 'Unauthorized' }); }
}
module.exports = auth;
