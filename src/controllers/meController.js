const prisma = require('../config/prisma');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

exports.updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name','phone','avatarUrl'];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  const user = await prisma.user.update({ where: { id: req.user.id }, data, include: { settings: true } });
  await prisma.systemLog.create({ data: { userId: req.user.id, action: 'profile_updated', module: 'settings', details: { fields: Object.keys(data) } } });
  ok(res, user, 'Profile updated');
});

exports.getSettings = asyncHandler(async (req, res) => {
  let settings = await prisma.userSettings.findUnique({ where: { userId: req.user.id } });
  if (!settings) settings = await prisma.userSettings.create({ data: { userId: req.user.id } });
  ok(res, settings);
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const aliases = {
    locationSharing: 'locationPermission',
    sosConfirm: 'sosConfirmation',
    assistantSuggestions: 'showDashboardAssistant',
    assistantOpeningStyle: 'chatbotOpeningStyle',
  };
  const allowed = [
    'language',
    'theme',
    'notifications',
    'locationPermission',
    'anonymousReporting',
    'sosConfirmation',
    'showDashboardAssistant',
    'assistantAvatar',
    'chatbotOpeningStyle',
    'redZoneAlerts',
    'yellowZoneWarnings',
    'mlPredictionAlerts',
    'nearbyIncidentAlerts',
  ];
  const data = {};
  for (const [key, value] of Object.entries(req.body || {})) {
    const normalizedKey = aliases[key] || key;
    if (!allowed.includes(normalizedKey)) continue;
    data[normalizedKey] = value;
  }
  const settings = await prisma.userSettings.upsert({ where: { userId: req.user.id }, update: data, create: { userId: req.user.id, ...data } });
  await prisma.systemLog.create({ data: { userId: req.user.id, action: 'settings_updated', module: 'settings', details: { fields: Object.keys(data) } } });
  ok(res, settings, 'Settings saved');
});

exports.locationConsent = asyncHandler(async (req, res) => {
  const { locationConsent, lat, lng } = req.body;
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { locationConsent: Boolean(locationConsent), latestLat: lat, latestLng: lng } });
  await prisma.userSettings.upsert({ where: { userId: req.user.id }, update: { locationPermission: Boolean(locationConsent) }, create: { userId: req.user.id, locationPermission: Boolean(locationConsent) } });
  ok(res, { locationConsent: user.locationConsent, latestLat: user.latestLat, latestLng: user.latestLng }, 'Location preference updated');
});
