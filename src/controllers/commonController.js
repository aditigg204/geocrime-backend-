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
  const zone = await prisma.zone.findUnique({ 
    where: { id: req.params.id }, 
    include: { 
      predictions: { orderBy: { predictionDate: 'asc' }, take: 7 }, 
      riskScores: { orderBy: { createdAt: 'desc' }, take: 1 } 
    } 
  });
  if (!zone) return fail(res, 'Zone not found', 404);
  ok(res, zone);
});

exports.mapZones = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  const zones = await prisma.zone.findMany({ 
    where: { active: true }, 
    include: { 
      predictions: { orderBy: { predictionDate: 'asc' }, take: 7 } 
    } 
  });
  const data = zones.map(z => ({ 
    ...z, 
    distanceKm: lat && lng ? Number(haversineKm(Number(lat), Number(lng), z.lat, z.lng).toFixed(2)) : null 
  }));
  ok(res, data);
});

exports.heatmapLive = asyncHandler(async (req, res) => {
  // Get heatmap data - filter by officer's zone if applicable
  const zoneId = req.user?.assignedZoneId;
  const past7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const [zones, incidents, hotspots] = await Promise.all([
    // All active zones (or just assigned zone for officers)
    prisma.zone.findMany({
      where: { 
        active: true,
        ...(zoneId && { id: zoneId })
      },
      orderBy: { riskScore: 'desc' }
    }),
    
    // Incidents from past 7 days (real data for heatmap)
    prisma.incident.findMany({
      where: {
        createdAt: { gte: past7Days },
        ...(zoneId && { zoneId })
      },
      include: { zone: true },
      orderBy: { createdAt: 'desc' },
      take: 200
    }),
    
    // Hotspots (real crime clusters from data)
    prisma.hotspot.findMany({
      where: {
        ...(zoneId && { zoneId })
      },
      orderBy: { riskScore: 'desc' },
      take: 50
    })
  ]);
  
  // Enrich incident data for heatmap display
  const enrichedIncidents = incidents.map(i => ({
    id: i.id,
    type: i.type,
    lat: i.lat,
    lng: i.lng,
    status: i.status,
    priority: i.priority,
    riskLevel: i.riskLevelAtReport,
    zoneName: i.zone?.name,
    createdAt: i.createdAt,
    isRecent: new Date(i.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
  }));
  
  ok(res, {
    zones,
    incidents: enrichedIncidents,
    hotspots,
    metadata: {
      incidentCount: incidents.length,
      hotspotCount: hotspots.length,
      timeRange: '7 days',
      generatedAt: new Date(),
      zoneFilter: zoneId ? 'assigned zone only' : 'all zones'
    }
  });
});

exports.uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, 'No file uploaded');
  created(res, { 
    fileUrl: `${publicBaseUrl}/uploads/${req.file.filename}`, 
    fileName: req.file.originalname, 
    mimeType: req.file.mimetype 
  });
});
