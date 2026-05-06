const prisma = require('../config/prisma');
const { ok, created, fail } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { haversineKm } = require('../utils/distance');
const { publicBaseUrl } = require('../config/env');

exports.publicStats = asyncHandler(async (req, res) => {
  const [totalReports, redZones, alertsToday] = await Promise.all([
    prisma.incident.count(),
    prisma.zone.count({ where: { riskLevel: 'red' } }),
    prisma.alert.count({ where: { createdAt: { gte: new Date(Date.now() - 24*60*60*1000) } } })
  ]);
  ok(res, { totalReports, redZones, alertsToday });
});

exports.listZones = asyncHandler(async (req, res) => {
  const zones = await prisma.zone.findMany({ where: { active: true }, orderBy: { riskScore: 'desc' } });
  ok(res, zones);
});

exports.getZoneRisk = asyncHandler(async (req, res) => {
  const zone = await prisma.zone.findUnique({ where: { id: req.params.id }, include: { predictions: { orderBy: { predictionDate: 'asc' }, take: 7 }, riskScores: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  if (!zone) return fail(res, 'Zone not found', 404);
  ok(res, zone);
});

exports.mapZones = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  const zones = await prisma.zone.findMany({ where: { active: true }, include: { predictions: { orderBy: { predictionDate: 'asc' }, take: 7 } } });
  const data = zones.map(z => ({ ...z, distanceKm: lat && lng ? Number(haversineKm(Number(lat), Number(lng), z.lat, z.lng).toFixed(2)) : null }));
  ok(res, data);
});

exports.heatmapLive = asyncHandler(async (req, res) => {
  const zones = await prisma.zone.findMany({ where: { active: true }, orderBy: { riskScore: 'desc' } });
  const incidents = await prisma.incident.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { zone: true } });
  const hotspots = await prisma.hotspot.findMany({ take: 50, orderBy: { riskScore: 'desc' } });
  ok(res, { zones, incidents, hotspots });
});

exports.uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, 'No file uploaded');
  created(res, { fileUrl: `${publicBaseUrl}/uploads/${req.file.filename}`, fileName: req.file.originalname, mimeType: req.file.mimetype });
});
