const prisma = require('../config/prisma');
const { ok, created, fail } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { haversineKm } = require('../utils/distance');
const { priorityFromRisk } = require('../utils/risk');
const { publicBaseUrl } = require('../config/env');

async function nearestZone(lat, lng) {
  const zones = await prisma.zone.findMany({ where: { active: true } });
  if (!zones.length) return null;
  return zones.map(z => ({ ...z, distance: haversineKm(Number(lat), Number(lng), z.lat, z.lng) })).sort((a,b) => a.distance - b.distance)[0];
}

exports.createReport = asyncHandler(async (req, res) => {
  const { type, description, lat, lng, accuracy, isAnonymous, locationText, severityScore, categoryId } = req.body;
  if (!type || lat === undefined || lng === undefined) return fail(res, 'type, lat and lng are required');
  const zone = await nearestZone(lat, lng);
  const officer = zone ? await prisma.user.findFirst({ where: { role: 'officer', assignedZoneId: zone.id, status: 'active' } }) : null;
  const incident = await prisma.incident.create({
    data: {
      type, description, lat: Number(lat), lng: Number(lng), accuracy: accuracy ? Number(accuracy) : null,
      isAnonymous: Boolean(isAnonymous), locationText, severityScore: Number(severityScore || 2), categoryId: categoryId || null,
      reportedById: req.user?.id || null, zoneId: zone?.id || null, assignedOfficerId: officer?.id || null,
      riskLevelAtReport: zone?.riskLevel || null, priority: priorityFromRisk(zone?.riskScore || 40),
      history: { create: { newStatus: 'submitted', updatedById: req.user?.id, comment: 'Report submitted' } }
    }, include: { zone: true, assignedOfficer: true, history: true }
  });
  if (req.file) {
    await prisma.incidentMedia.create({ data: { incidentId: incident.id, fileUrl: `${publicBaseUrl}/uploads/${req.file.filename}`, fileType: req.file.mimetype, fileName: req.file.originalname } });
  }
  const alert = await prisma.alert.create({ data: { userId: officer?.id, officerId: officer?.id, incidentId: incident.id, zoneId: zone?.id, title: 'New citizen report', message: `${type} reported near ${zone?.name || 'unknown zone'}`, alertType: 'incident', severity: incident.priority === 'critical' ? 'critical' : incident.priority === 'high' ? 'high' : 'medium', lat: Number(lat), lng: Number(lng) } });
  req.io?.to(officer?.id ? `officer:${officer.id}` : 'role:officer').emit('incident:new', incident);
  req.io?.to(officer?.id ? `officer:${officer.id}` : 'role:officer').emit('alert:new', alert);
  if (zone?.id) req.io?.to(`zone:${zone.id}`).emit('incident:new', incident);
  req.io?.to('admin').emit('incident:new', incident);
  req.io?.to('analyst').emit('incident:new', incident);
  req.io?.emit('incident.created', incident);
  created(res, incident, 'Incident report submitted');
});

exports.mine = asyncHandler(async (req, res) => {
  const reports = await prisma.incident.findMany({ where: { reportedById: req.user.id }, include: { zone: true, media: true, history: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  ok(res, reports);
});

exports.list = asyncHandler(async (req, res) => {
  const { status, priority, zoneId, type, q } = req.query;
  const where = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (zoneId) where.zoneId = zoneId;
  if (type) where.type = { contains: type, mode: 'insensitive' };
  if (q) where.OR = [{ type: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { locationText: { contains: q, mode: 'insensitive' } }];
  const incidents = await prisma.incident.findMany({ where, include: { zone: true, media: true, assignedOfficer: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  ok(res, incidents);
});

exports.detail = asyncHandler(async (req, res) => {
  const incident = await prisma.incident.findUnique({ where: { id: req.params.id }, include: { zone: true, media: true, history: { orderBy: { createdAt: 'asc' } }, updates: { orderBy: { createdAt: 'asc' }, include: { user: true } }, assignedOfficer: true } });
  if (!incident) return fail(res, 'Incident not found', 404);
  ok(res, incident);
});

exports.nearby = asyncHandler(async (req, res) => {
  const { lat, lng, radiusKm = 5 } = req.query;
  if (!lat || !lng) return fail(res, 'lat and lng required');
  const incidents = await prisma.incident.findMany({ take: 200, include: { zone: true }, orderBy: { createdAt: 'desc' } });
  const filtered = incidents.map(i => ({ ...i, distanceKm: haversineKm(Number(lat), Number(lng), i.lat, i.lng) })).filter(i => i.distanceKm <= Number(radiusKm)).sort((a,b) => a.distanceKm - b.distanceKm);
  ok(res, filtered);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status, comment } = req.body;
  const allowed = ['submitted','under_review','responding','resolved','escalated'];
  if (!allowed.includes(status)) return fail(res, 'Invalid status');
  const current = await prisma.incident.findUnique({ where: { id: req.params.id } });
  if (!current) return fail(res, 'Incident not found', 404);
  const incident = await prisma.incident.update({ where: { id: req.params.id }, data: { status, history: { create: { oldStatus: current.status, newStatus: status, updatedById: req.user.id, comment } } }, include: { history: true, zone: true } });
  const alert = current.reportedById ? await prisma.alert.create({ data: { userId: current.reportedById, incidentId: current.id, zoneId: current.zoneId, title: 'Report status updated', message: `Your report is now ${status.replace('_',' ')}`, alertType: 'incident_update', severity: 'medium' } }) : null;
  if (current.reportedById) {
    req.io?.to(`user:${current.reportedById}`).emit('incident:status_updated', incident);
    req.io?.to(`user:${current.reportedById}`).emit('alert:new', alert);
  }
  req.io?.to('admin').emit('incident:status_updated', incident);
  req.io?.to('analyst').emit('incident:status_updated', incident);
  req.io?.emit('incident.updated', incident);
  ok(res, incident, 'Incident status updated');
});

exports.addUpdate = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const update = await prisma.incidentUpdate.create({ data: { incidentId: req.params.id, userId: req.user.id, message } });
  ok(res, update, 'Update added');
});

exports.addMedia = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, 'No file uploaded');
  const media = await prisma.incidentMedia.create({ data: { incidentId: req.params.id, fileUrl: `${publicBaseUrl}/uploads/${req.file.filename}`, fileType: req.file.mimetype, fileName: req.file.originalname } });
  created(res, media, 'Media uploaded');
});

exports.timeline = asyncHandler(async (req, res) => {
  const history = await prisma.incidentStatusHistory.findMany({ where: { incidentId: req.params.id }, orderBy: { createdAt: 'asc' } });
  ok(res, history);
});
