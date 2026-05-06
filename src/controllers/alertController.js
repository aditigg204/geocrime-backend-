const prisma = require('../config/prisma');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

exports.mine = asyncHandler(async (req, res) => ok(res, await prisma.alert.findMany({ where: { userId: req.user.id }, include: { zone: true, incident: true }, orderBy: { createdAt: 'desc' }, take: 100 })));
exports.markRead = asyncHandler(async (req, res) => ok(res, await prisma.alert.update({ where: { id: req.params.id }, data: { read: true, status: 'read' } }), 'Alert marked read'));
exports.geofenceCheck = asyncHandler(async (req, res) => {
  const { zoneId } = req.body;
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
  if (!zone || zone.riskLevel === 'green') return ok(res, { alertCreated: false, zone });
  const alert = await prisma.alert.create({ data: { userId: req.user.id, zoneId, title: `${zone.riskLevel.toUpperCase()} zone warning`, message: `You are in ${zone.name}. Risk score is ${zone.riskScore}/100.`, alertType: 'geofence', severity: zone.riskLevel === 'red' ? 'high' : 'medium' } });
  ok(res, { alertCreated: true, alert });
});
