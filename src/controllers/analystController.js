const prisma = require('../config/prisma');
const { ok, created } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const mlService = require('../services/mlService');

exports.dashboard = asyncHandler(async (req, res) => {
  const [totalCrimes, redZones, hotspots, topCrime, mlDashboard, lastRun, insights] = await Promise.all([
    prisma.incident.count(), prisma.zone.count({ where: { riskLevel: 'red' } }), prisma.hotspot.count(),
    prisma.incident.groupBy({ by: ['type'], _count: { type: true }, orderBy: { _count: { type: 'desc' } }, take: 1 }),
    mlService.getAnalystDashboard(), prisma.mlModelRun.findFirst({ orderBy: { completedAt: 'desc' } }),
    prisma.alert.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
  ]);
  const highestDistrict = mlDashboard.highestRiskDistricts?.[0];
  ok(res, {
    summary: {
      totalCrimes,
      redZones,
      hotspots,
      topCrime: topCrime[0]?.type || 'N/A',
      model1: mlDashboard.summary,
    },
    mlPrediction: highestDistrict ? {
      state: highestDistrict.state,
      district: highestDistrict.district,
      predictionYear: highestDistrict.predictionYear,
      riskScore: highestDistrict.predictedRiskScore,
      level: highestDistrict.predictedRiskLevel,
      likelyCrime: highestDistrict.mainCrimeDriver,
      recommendation: highestDistrict.recommendation,
      confidence: highestDistrict.confidenceScore,
    } : null,
    model1: mlDashboard,
    lastRun,
    insights
  });
});

exports.crimeAnalysis = asyncHandler(async (req, res) => {
  const { crimeType } = req.query;
  const where = crimeType ? { type: { contains: crimeType, mode: 'insensitive' } } : {};
  const [total, byZone, byStatus] = await Promise.all([
    prisma.incident.count({ where }),
    prisma.incident.groupBy({ by: ['zoneId'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 10 }),
    prisma.incident.groupBy({ by: ['status'], where, _count: { id: true } })
  ]);
  ok(res, { total, byZone, byStatus });
});

exports.heatmap = asyncHandler(async (req, res) => {
  const [zones, hotspots, incidents] = await Promise.all([
    prisma.zone.findMany({ orderBy: { riskScore: 'desc' } }), prisma.hotspot.findMany({ orderBy: { riskScore: 'desc' } }), prisma.incident.findMany({ take: 200, orderBy: { createdAt: 'desc' } })
  ]);
  ok(res, { zones, hotspots, incidents });
});

exports.zoneCompare = asyncHandler(async (req, res) => {
  const ids = String(req.query.zoneIds || '').split(',').filter(Boolean);
  const zones = await prisma.zone.findMany({ where: ids.length ? { id: { in: ids } } : {}, include: { predictions: { orderBy: { predictionDate: 'asc' }, take: 7 } }, orderBy: { riskScore: 'desc' }, take: 5 });
  ok(res, zones);
});

exports.timePatterns = asyncHandler(async (req, res) => {
  const incidents = await prisma.incident.findMany({ select: { createdAt: true, type: true, zoneId: true, severityScore: true } });
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: incidents.filter(i => new Date(i.createdAt).getHours() === h).length }));
  const weekly = Array.from({ length: 7 }, (_, d) => ({ day: d, count: incidents.filter(i => new Date(i.createdAt).getDay() === d).length }));
  ok(res, { hourly, weekly });
});

exports.riskHistory = asyncHandler(async (req, res) => {
  const where = req.query.zoneId ? { zoneId: req.query.zoneId } : {};
  ok(res, await prisma.zoneRiskScore.findMany({ where, orderBy: { predictionDate: 'desc' }, take: 90 }));
});

exports.reportAnalytics = asyncHandler(async (req, res) => {
  const [byStatus, byType, byZone] = await Promise.all([
    prisma.incident.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.incident.groupBy({ by: ['type'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.incident.groupBy({ by: ['zoneId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } })
  ]);
  ok(res, { byStatus, byType, byZone });
});

exports.createExport = asyncHandler(async (req, res) => {
  const timestamp = Date.now();
  const fileName = `report-${timestamp}.${req.body.format || 'csv'}`;
  const fileUrl = `/exports/${fileName}`;
  const exportJob = await prisma.exportJob.create({ 
    data: { 
      userId: req.user.id, 
      format: req.body.format || 'csv', 
      filters: req.body.filters || {}, 
      fileUrl: fileUrl,
      status: 'processing'
    } 
  });
  created(res, exportJob, 'Export job started - processing...');
});

exports.listExports = asyncHandler(async (req, res) => ok(res, await prisma.exportJob.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } })));
