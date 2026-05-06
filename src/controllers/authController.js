const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { ok, created, fail } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

function sign(user) { return jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn }); }
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, avatarUrl: u.avatarUrl, status: u.status, assignedZoneId: u.assignedZoneId, settings: u.settings });

exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role } = req.body;
  if (!name || !email || !password) return fail(res, 'name, email and password are required');
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return fail(res, 'Email already registered', 409);
  const allowedRole = req.user?.role === 'admin' && role ? role : 'citizen';
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, phone, passwordHash, role: allowedRole, settings: { create: {} } },
    include: { settings: true }
  });
  return created(res, { token: sign(user), user: publicUser(user) }, 'Account created');
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { settings: true } });
  if (!user) return fail(res, 'Invalid email or password', 401);
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return fail(res, 'Invalid email or password', 401);
  if (user.status !== 'active') return fail(res, 'Account is not active', 403);
  await prisma.systemLog.create({ data: { userId: user.id, action: 'login', module: 'auth', details: { role: user.role } } });
  return ok(res, { token: sign(user), user: publicUser(user) }, 'Login successful');
});

exports.me = asyncHandler(async (req, res) => ok(res, publicUser(req.user)));
exports.logout = asyncHandler(async (req, res) => ok(res, null, 'Logged out'));
