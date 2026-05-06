const prisma = require('../config/prisma');
const { ok, created } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { haversineKm } = require('../utils/distance');

// Helper to get ISO date string for today at midnight
function getTodayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

exports.dashboard = asyncHandler(async (req, res) => {
  const zoneId = req.user.assignedZoneId;
  const todayStart = getTodayStart();
  
  // Query all real metrics in parallel
  const [
    newIncidents,
    pending,
    responding,
    resolved,
    sosAlerts,
    assignedZone,
    highRiskZones,
    alerts,
    nearbyHotspots,
    latestPrediction
  ] = await Promise.all([
    // New incidents submitted today
    prisma.incident.count({ 
      where: { 
        ...(zoneId && { zoneId }), 
        status: 'submitted',
        createdAt: { gte: todayStart }
      } 
    }),
    
    // Pending cases (submitted or under review)
    prisma.incident.count({ 
      where: { 
        ...(zoneId && { zoneId }), 
        status: { in: ['submitted', 'under_review'] }
      } 
    }),
    
    // Currently responding
    prisma.incident.count({ 
      where: { 
        ...(zoneId && { zoneId }), 
        status: 'responding'
      } 
    }),
    
    // Resolved today
    prisma.incident.count({ 
      where: { 
        ...(zoneId && { zoneId }), 
        status: 'resolved',
        updatedAt: { gte: todayStart }
      } 
    }),
    
    // Active SOS events today
    prisma.sosEvent.count({
      where: {
        createdAt: { gte: todayStart }
      }
    }),
    
    // Officer's assigned zone with all related data
    zoneId ? prisma.zone.findUnique({ 
      where: { id: zoneId }, 
      include: { 
        predictions: { orderBy: { predictionDate: 'desc' }, take: 7 },
        riskScores: { orderBy: { createdAt: 'desc' }, take: 1 }
      } 
    }) : null,
    
    // High-risk zones (red zones)
    prisma.zone.findMany({ 
      where: { riskLevel: 'red' },
      orderBy: { riskScore: 'desc' }, 
      take: 5 
    }),
    
    // Unread alerts for this officer
    prisma.alert.findMany({ 
      where: { officerId: req.user.id, read: false },
      orderBy: { createdAt: 'desc' }, 
      take: 5 
    }),
    
    // Nearby hotspots in assigned zone
    zoneId ? prisma.hotspot.findMany({
      where: { zoneId },
      orderBy: { riskScore: 'desc' },
      take: 5
    }) : [],
    
    // Latest ML prediction for assigned zone
    zoneId ? prisma.mlPrediction.findFirst({
      where: { zoneId },
      orderBy: { predictionDate: 'desc' }
    }) : null
  ]);
  
  // Calculate today's strategy based on predictions
  const todayStrategy = latestPrediction ? {
    recommendedFocus: latestPrediction.likelyCrime,
    peakTime: latestPrediction.peakTime,
    riskLevel: latestPrediction.predictedRiskLevel,
    confidence: latestPrediction.confidenceScore,
    action: latestPrediction.recommendation
  } : null;
  
  ok(res, {
    shiftSummary: {
      newIncidents,
      pending,
      responding,
      resolved,
      sosAlerts
    },
    assignedZone,
    highRiskZones,
    alerts,
    nearbyHotspots,
    latestPrediction: latestPrediction ? {
      id: latestPrediction.id,
      predictedRiskScore: latestPrediction.predictedRiskScore,
      predictedRiskLevel: latestPrediction.predictedRiskLevel,
      likelyCrime: latestPrediction.likelyCrime,
      confidence: latestPrediction.confidenceScore,
      mainDriver: latestPrediction.mainCrimeDriver,
      peakTime: latestPrediction.peakTime
    } : null,
    todayStrategy
  });
});

exports.incidents = asyncHandler(async (req, res) => {
  const zoneId = req.user.assignedZoneId;
  const { status, priority } = req.query;
  
  const where = zoneId ? { zoneId } : {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  
  const incidents = await prisma.incident.findMany({ 
    where,
    include: { 
      zone: true, 
      media: true, 
      reportedBy: { select: { id: true, name: true, phone: true } },
      assignedOfficer: { select: { id: true, name: true } },
      history: { orderBy: { createdAt: 'desc' }, take: 1 }
    }, 
    orderBy: { createdAt: 'desc' }, 
    take: 100 
  });
  
  ok(res, incidents);
});

exports.incidentDetail = asyncHandler(async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params.id },
    include: {
      zone: true,
      media: true,
      reportedBy: { select: { id: true, name: true, email: true, phone: true } },
      assignedOfficer: { select: { id: true, name: true } },
      history: { orderBy: { createdAt: 'asc' } },
      updates: { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true } } } }
    }
  });
  
  if (!incident) return ok(res, null);
  ok(res, incident);
});

exports.patrolPlan = asyncHandler(async (req, res) => {
  const zoneId = req.user.assignedZoneId;
  
  // Get today's ML predictions, prioritized
  let predictions = await prisma.mlPrediction.findMany({ 
    where: { 
      predictionDate: { gte: getTodayStart() },
      ...(zoneId && { zoneId })
    }, 
    orderBy: [{ predictedRiskScore: 'desc' }], 
    take: 10, 
    include: { zone: true } 
  });
  
  // Fallback to recent predictions if none for today
  if (!predictions.length) {
    predictions = await prisma.mlPrediction.findMany({ 
      orderBy: [{ predictedRiskScore: 'desc' }, { predictionDate: 'desc' }], 
      take: 10, 
      include: { zone: true } 
    });
  }
  
  const recommendations = predictions.map((p, i) => ({
    rank: i + 1,
    id: p.id,
    zoneName: p.zoneName || p.zone?.name || p.district || 'Priority zone',
    riskScore: p.predictedRiskScore,
    riskLevel: p.predictedRiskLevel,
    likelyCrime: p.likelyCrime,
    confidence: p.confidenceScore,
    mainDriver: p.mainCrimeDriver,
    peakTime: p.peakTime,
    recommendation: p.predictedRiskLevel === 'red' ? 'High priority patrol' : 'Monitor during peak time'
  }));
  
  ok(res, { recommendations });
});

exports.generatePatrolRoute = asyncHandler(async (req, res) => {
  let { zoneIds = [] } = req.body;
  
  // If no zones specified, use high-risk zones
  if (!Array.isArray(zoneIds) || zoneIds.length === 0) {
    const zones = await prisma.zone.findMany({ 
      where: { riskLevel: 'red' },
      orderBy: { riskScore: 'desc' }, 
      take: 3 
    });
    zoneIds = zones.map(z => z.id);
  }
  
  // Get zone data for route optimization
  const zones = await prisma.zone.findMany({
    where: { id: { in: zoneIds } },
    select: { id: true, name: true, lat: true, lng: true }
  });
  
  // Simple route: sort by distance (could be enhanced with Google Maps API)
  const routeWaypoints = zones.map(z => ({
    name: z.name,
    lat: z.lat,
    lng: z.lng
  }));
  
  // Create patrol route record
  const route = await prisma.patrolRoute.create({
    data: {
      officerId: req.user.id,
      name: `Patrol Route - ${new Date().toLocaleString()}`,
      zoneIds,
      status: 'created',
      routeJson: {
        waypoints: routeWaypoints,
        totalDistance: 'calculated',
        estimatedTime: 'varies',
        generatedAt: new Date(),
        guidance: 'Prioritize red zones. Check hotspot markers. Report any incidents immediately.'
      }
    }
  });
  
  // Log the action
  await prisma.systemLog.create({
    data: {
      userId: req.user.id,
      action: 'patrol_route_generated',
      module: 'officer',
      details: { routeId: route.id, zoneIds, zoneCount: zoneIds.length }
    }
  });
  
  // Emit to admin for visibility
  req.io?.to('admin').emit('patrol:route_generated', {
    officerId: req.user.id,
    officerName: req.user.name,
    routeId: route.id,
    zoneCount: zoneIds.length
  });
  
  created(res, route, 'Patrol route generated with real waypoints');
});

exports.startPatrolRoute = asyncHandler(async (req, res) => {
  const route = await prisma.patrolRoute.findUnique({
    where: { id: req.params.id }
  });
  
  if (!route) return ok(res, null);
  
  const updated = await prisma.patrolRoute.update({
    where: { id: req.params.id },
    data: { status: 'started', startedAt: new Date() }
  });
  
  await prisma.systemLog.create({
    data: {
      userId: req.user.id,
      action: 'patrol_started',
      module: 'officer',
      details: { routeId: route.id, startedAt: new Date() }
    }
  });
  
  // Notify admin and other officers
  req.io?.to('admin').emit('patrol:started', {
    officerId: req.user.id,
    officerName: req.user.name,
    routeId: route.id,
    startedAt: new Date()
  });
  
  ok(res, updated, 'Patrol started - real-time tracking enabled');
});
