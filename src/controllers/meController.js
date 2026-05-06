const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { ok, fail } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

exports.updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name','email','phone','avatarUrl'];
  const data = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) data[k] = typeof req.body[k] === 'string' ? req.body[k].trim() : req.body[k];
  }
  if (data.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing && existing.id !== req.user.id) return fail(res, 'Email is already used by another account', 409, 'EMAIL_IN_USE');
  }
  const user = await prisma.user.update({ where: { id: req.user.id }, data, include: { settings: true } });
  await prisma.systemLog.create({ data: { userId: req.user.id, action: 'profile_updated', module: 'settings', details: { fields: Object.keys(data) } } });
  ok(res, user, 'Profile updated');
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return fail(res, 'Current and new password are required', 400, 'PASSWORD_REQUIRED');
  if (String(newPassword).length < 6) return fail(res, 'New password must be at least 6 characters', 400, 'PASSWORD_TOO_SHORT');
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return fail(res, 'User not found', 404, 'USER_NOT_FOUND');
  const valid = await bcrypt.compare(String(currentPassword), user.passwordHash);
  if (!valid) return fail(res, 'Current password is incorrect', 401, 'INVALID_CURRENT_PASSWORD');
  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
  await prisma.systemLog.create({ data: { userId: req.user.id, action: 'password_changed', module: 'settings', details: { method: 'mobile' } } });
  ok(res, null, 'Password updated');
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
