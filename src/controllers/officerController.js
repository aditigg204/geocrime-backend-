const prisma = require('../config/prisma');
const { ok, created } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

exports.dashboard = asyncHandler(async (req, res) => {
  const zoneId = req.user.assignedZoneId;
  const where = zoneId ? { zoneId } : {};
  const [newIncidents, pending, responding, resolved, assignedZone, redZones, alerts] = await Promise.all([
    prisma.incident.count({ where: { ...where, status: 'submitted' } }),
    prisma.incident.count({ where: { ...where, status: { in: ['submitted','under_review'] } } }),
    prisma.incident.count({ where: { ...where, status: 'responding' } }),
    prisma.incident.count({ where: { ...where, status: 'resolved' } }),
    zoneId ? prisma.zone.findUnique({ where: { id: zoneId }, include: { predictions: { orderBy: { predictionDate: 'asc' }, take: 7 } } }) : null,
    prisma.zone.findMany({ where: { riskLevel: 'red' }, orderBy: { riskScore: 'desc' }, take: 5 }),
    prisma.alert.findMany({ where: { userId: req.user.id, read: false }, orderBy: { createdAt: 'desc' }, take: 5 })
  ]);
  ok(res, { shiftSummary: { newIncidents, pending, responding, resolved }, assignedZone, redZones, alerts });
});

exports.incidents = asyncHandler(async (req, res) => {
  const zoneId = req.user.assignedZoneId;
  const incidents = await prisma.incident.findMany({ where: zoneId ? { zoneId } : {}, include: { zone: true, media: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  ok(res, incidents);
});

exports.patrolPlan = asyncHandler(async (req, res) => {
  const predictions = await prisma.mlPrediction.findMany({ where: { predictionDate: { gte: new Date(new Date().toDateString()) } }, orderBy: [{ predictedRiskScore: 'desc' }], take: 10 });
  ok(res, { recommendations: predictions.map((p, i) => ({ rank: i + 1, ...p, recommendation: p.predictedRiskLevel === 'red' ? 'High priority patrol' : 'Monitor during peak time' })) });
});

exports.generatePatrolRoute = asyncHandler(async (req, res) => {
  const { zoneIds = [] } = req.body;
  const route = await prisma.patrolRoute.create({ data: { officerId: req.user.id, name: 'Generated patrol route', zoneIds, routeJson: { zoneIds, generatedAt: new Date() } } });
  created(res, route, 'Patrol route generated');
});

exports.startPatrolRoute = asyncHandler(async (req, res) => {
  const route = await prisma.patrolRoute.update({ where: { id: req.params.id }, data: { status: 'started' } });
  ok(res, route, 'Patrol started');
});
