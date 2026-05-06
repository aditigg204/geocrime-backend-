const prisma = require('../config/prisma');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

exports.updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name','phone','avatarUrl'];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  const user = await prisma.user.update({ where: { id: req.user.id }, data, include: { settings: true } });
  ok(res, user, 'Profile updated');
});

exports.getSettings = asyncHandler(async (req, res) => {
  let settings = await prisma.userSettings.findUnique({ where: { userId: req.user.id } });
  if (!settings) settings = await prisma.userSettings.create({ data: { userId: req.user.id } });
  ok(res, settings);
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const settings = await prisma.userSettings.upsert({ where: { userId: req.user.id }, update: req.body, create: { userId: req.user.id, ...req.body } });
  ok(res, settings, 'Settings saved');
});

exports.locationConsent = asyncHandler(async (req, res) => {
  const { locationConsent, lat, lng } = req.body;
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { locationConsent: Boolean(locationConsent), latestLat: lat, latestLng: lng } });
  await prisma.userSettings.upsert({ where: { userId: req.user.id }, update: { locationPermission: Boolean(locationConsent) }, create: { userId: req.user.id, locationPermission: Boolean(locationConsent) } });
  ok(res, { locationConsent: user.locationConsent, latestLat: user.latestLat, latestLng: user.latestLng }, 'Location preference updated');
});
