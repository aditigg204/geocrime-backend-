const prisma = require('../config/prisma');
const { ok, created, fail } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { haversineKm } = require('../utils/distance');

async function nearestZone(lat, lng) {
  const zones = await prisma.zone.findMany({ where: { active: true } });
  if (!zones.length) return null;
  return zones.map(z => ({ ...z, distanceKm: haversineKm(Number(lat), Number(lng), z.lat, z.lng) })).sort((a,b) => a.distanceKm - b.distanceKm)[0];
}

async function nearestHotspots(lat, lng, limit = 5) {
  const hotspots = await prisma.hotspot.findMany({ orderBy: { riskScore: 'desc' }, take: 100, include: { zone: true } });
  return hotspots
    .map(h => ({
      ...h,
      distanceKm: haversineKm(Number(lat), Number(lng), h.centerLat, h.centerLng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

function safetyTipsFor(level) {
  return level === 'red'
    ? ['Avoid isolated areas after dark', 'Share live location with a trusted contact', 'Use SOS if unsafe', 'Prefer main roads and crowded areas']
    : level === 'yellow'
    ? ['Stay alert near crowded places', 'Avoid carrying valuables openly', 'Check alerts before travel']
    : ['Area is currently low risk', 'Follow normal safety precautions'];
}

exports.dashboard = asyncHandler(async (req, res) => {
  const lat = req.query.lat || req.user.latestLat;
  const lng = req.query.lng || req.user.latestLng;
  const currentZone = lat && lng ? await nearestZone(lat, lng) : await prisma.zone.findFirst({ orderBy: { riskScore: 'desc' } });
  const alerts = await prisma.alert.findMany({ where: { OR: [{ userId: req.user.id }, { zoneId: currentZone?.id }] }, orderBy: { createdAt: 'desc' }, take: 5 });
  const nearby = currentZone ? await prisma.incident.groupBy({ by: ['type'], where: { zoneId: currentZone.id }, _count: { type: true }, orderBy: { _count: { type: 'desc' } }, take: 5 }) : [];
  const hotspots = lat && lng ? await nearestHotspots(lat, lng, 3) : [];
  ok(res, { currentZone, alerts, nearbyIncidents: nearby.map(n => ({ type: n.type, count: n._count.type })), nearbyHotspots: hotspots, tips: safetyTipsFor(currentZone?.riskLevel) });
});

exports.myZone = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return fail(res, 'lat and lng required');
  const zone = await nearestZone(lat, lng);
  ok(res, zone);
});

exports.safetyGuide = asyncHandler(async (req, res) => {
  const zone = await prisma.zone.findUnique({ where: { id: req.query.zoneId } });
  const tips = safetyTipsFor(zone?.riskLevel);
  ok(res, { zone, tips });
});

exports.locationRisk = asyncHandler(async (req, res) => {
  const { lat, lng, accuracy } = req.query;
  if (!lat || !lng) return fail(res, 'lat and lng required');

  const [zone, hotspots, nearbyIncidents] = await Promise.all([
    nearestZone(lat, lng),
    nearestHotspots(lat, lng, 5),
    prisma.incident.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { zone: true } }),
  ]);

  const nearestIncidents = nearbyIncidents
    .map(i => ({
      id: i.id,
      type: i.type,
      status: i.status,
      priority: i.priority,
      lat: i.lat,
      lng: i.lng,
      zoneName: i.zone?.name,
      createdAt: i.createdAt,
      distanceKm: haversineKm(Number(lat), Number(lng), i.lat, i.lng),
    }))
    .filter(i => i.distanceKm <= 5)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 10);

  const strongestHotspot = hotspots[0];
  const riskScore = Math.max(zone?.riskScore || 0, strongestHotspot?.riskScore || 0);
  const riskLevel = riskScore >= 71 ? 'red' : riskScore >= 41 ? 'yellow' : 'green';
  const dominantCrime = strongestHotspot?.dominantCrimeType || zone?.dominantCrime || nearestIncidents[0]?.type || 'Unknown';

  if (req.user?.id) {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        locationConsent: true,
        latestLat: Number(lat),
        latestLng: Number(lng),
      },
    });
  }

  ok(res, {
    location: {
      lat: Number(lat),
      lng: Number(lng),
      accuracy: accuracy ? Number(accuracy) : null,
    },
    currentZone: zone,
    risk: {
      score: riskScore,
      level: riskLevel,
      dominantCrime,
      source: strongestHotspot ? 'nearest_hotspot' : 'nearest_zone',
    },
    nearbyHotspots: hotspots,
    nearbyIncidents: nearestIncidents,
    tips: safetyTipsFor(riskLevel),
    note: 'GPS risk is based on nearest stored zones/hotspots. District ML predictions require district mapping or geocoding.',
  });
});

exports.sos = asyncHandler(async (req, res) => {
  const { lat, lng, message = 'Emergency SOS', source = 'dashboard' } = req.body;
  if (lat === undefined || lng === undefined) return fail(res, 'lat and lng required');
  const zone = await nearestZone(lat, lng);
  const officer = zone ? await prisma.user.findFirst({ where: { role: 'officer', assignedZoneId: zone.id, status: 'active' } }) : null;
  const sos = await prisma.sosEvent.create({ data: { userId: req.user.id, nearestOfficerId: officer?.id || null, lat: Number(lat), lng: Number(lng), message, source } });
  const alert = await prisma.alert.create({ data: { userId: officer?.id, officerId: officer?.id, zoneId: zone?.id, title: 'Emergency SOS', message, alertType: 'sos', severity: 'critical', lat: Number(lat), lng: Number(lng) } });
  req.io?.to(officer?.id ? `officer:${officer.id}` : 'role:officer').emit('sos:new', sos);
  req.io?.to(officer?.id ? `officer:${officer.id}` : 'role:officer').emit('alert:new', alert);
  req.io?.to('admin').emit('sos:new', sos);
  req.io?.emit('alert.created', { type: 'sos', sos });
  created(res, sos, 'SOS alert created');
});
