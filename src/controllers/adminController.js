const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { ok, created, fail } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { riskLevel } = require('../utils/risk');
const { publicBaseUrl } = require('../config/env');

exports.dashboard = asyncHandler(async (req, res) => {
  const [totalUsers, citizens, officers, activeIncidents, resolvedIncidents, redZones, alertsSent, lastMlRun, highRiskZones, logs] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { role: 'citizen' } }), prisma.user.count({ where: { role: 'officer' } }),
    prisma.incident.count({ where: { status: { not: 'resolved' } } }), prisma.incident.count({ where: { status: 'resolved' } }),
    prisma.zone.count({ where: { riskLevel: 'red' } }), prisma.alert.count(),
    prisma.mlModelRun.findFirst({ orderBy: { completedAt: 'desc' } }),
    prisma.zone.findMany({ orderBy: { riskScore: 'desc' }, take: 5 }),
    prisma.systemLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { user: true } })
  ]);
  ok(res, { summary: { totalUsers, citizens, officers, activeIncidents, resolvedIncidents, redZones, alertsSent }, systemHealth: { backendApi: 'online', postgresql: 'connected', mlModel: lastMlRun?.status || 'unknown', alertService: 'active' }, lastMlRun, highRiskZones, logs });
});

exports.users = asyncHandler(async (req, res) => {
  const { role, status, q } = req.query;
  const where = {};
  if (role) where.role = role;
  if (status) where.status = status;
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }];
  const users = await prisma.user.findMany({ where, include: { settings: true, assignedZone: true }, orderBy: { createdAt: 'desc' } });
  ok(res, users.map(({ passwordHash, ...u }) => u));
});

exports.createOfficer = asyncHandler(async (req, res) => {
  const { name, email, phone, password = '123456', badgeId, assignedZoneId } = req.body;
  if (!name || !email) return fail(res, 'Officer name and email are required', 400, 'VALIDATION_ERROR');
  if (String(password).length < 6) return fail(res, 'Officer password must be at least 6 characters', 400, 'VALIDATION_ERROR');
  const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (existing) return fail(res, 'An account already exists with this email', 409, 'EMAIL_EXISTS');
  const passwordHash = await bcrypt.hash(password, 10);
  const zone = assignedZoneId ? await prisma.zone.findUnique({ where: { id: assignedZoneId } }) : null;
  const user = await prisma.user.create({
    data: {
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      phone,
      passwordHash,
      role: 'officer',
      badgeId,
      assignedZoneId: zone?.id,
      settings: { create: { assistantAvatar: 'male' } },
    },
    include: { assignedZone: true, settings: true },
  });
  await prisma.systemLog.create({ data: { userId: req.user.id, action: 'officer_registered', module: 'admin', details: { officerId: user.id, email: user.email, badgeId } } });
  const { passwordHash: _, ...safe } = user;
  created(res, safe, 'Officer created');
});

exports.updateUser = asyncHandler(async (req, res) => {
  const allowed = ['name','phone','role','status','assignedZoneId','badgeId'];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  const user = await prisma.user.update({ where: { id: req.params.id }, data, include: { assignedZone: true } });
  const { passwordHash, ...safe } = user;
  ok(res, safe, 'User updated');
});

exports.zones = asyncHandler(async (req, res) => ok(res, await prisma.zone.findMany({ orderBy: { riskScore: 'desc' }, include: { assignedUsers: true } })));

exports.createZone = asyncHandler(async (req, res) => {
  const { name, city, lat, lng, riskScore = 0, dominantCrime, peakTime, boundaryJson } = req.body;
  const zone = await prisma.zone.create({ data: { name, city, lat: Number(lat), lng: Number(lng), riskScore: Number(riskScore), riskLevel: riskLevel(Number(riskScore)), dominantCrime, peakTime, boundaryJson } });
  created(res, zone, 'Zone created');
});

exports.updateZone = asyncHandler(async (req, res) => {
  const data = { ...req.body };
  if (data.riskScore !== undefined) { data.riskScore = Number(data.riskScore); data.riskLevel = riskLevel(data.riskScore); }
  if (data.lat !== undefined) data.lat = Number(data.lat);
  if (data.lng !== undefined) data.lng = Number(data.lng);
  const zone = await prisma.zone.update({ where: { id: req.params.id }, data });
  ok(res, zone, 'Zone updated');
});

exports.categories = asyncHandler(async (req, res) => ok(res, await prisma.crimeCategory.findMany({ orderBy: { name: 'asc' } })));
exports.createCategory = asyncHandler(async (req, res) => created(res, await prisma.crimeCategory.create({ data: req.body }), 'Category created'));
exports.updateCategory = asyncHandler(async (req, res) => ok(res, await prisma.crimeCategory.update({ where: { id: req.params.id }, data: req.body }), 'Category updated'));

exports.alertLogs = asyncHandler(async (req, res) => ok(res, await prisma.alert.findMany({ include: { user: true, zone: true, incident: true }, orderBy: { createdAt: 'desc' }, take: 200 })));
exports.auditLogs = asyncHandler(async (req, res) => ok(res, await prisma.systemLog.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' }, take: 300 })));

exports.datasetUpload = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, 'CSV file is required');
  const upload = await prisma.datasetUpload.create({ data: { uploadedById: req.user.id, fileUrl: `${publicBaseUrl}/uploads/${req.file.filename}`, fileName: req.file.originalname, status: 'uploaded' } });
  created(res, upload, 'Dataset uploaded');
});

exports.datasetStatus = asyncHandler(async (req, res) => ok(res, await prisma.datasetUpload.findUnique({ where: { id: req.params.id } })));
