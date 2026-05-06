const prisma = require('../config/prisma');
const { ok, created } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

function detectIntent(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('safe') || m.includes('danger') || m.includes('red zone') || m.includes('yellow')) return 'safety_tip';
  if (m.includes('report') || m.includes('incident') || m.includes('complaint')) return 'report_help';
  if (m.includes('sos') || m.includes('emergency') || m.includes('112')) return 'sos_help';
  if (m.includes('risk') || m.includes('zone') || m.includes('red')) return 'zone_risk';
  if (m.includes('predict') || m.includes('hotspot') || m.includes('tomorrow') || m.includes('7')) return 'prediction';
  if (m.includes('patrol')) return 'patrol_help';
  if (m.includes('accuracy') || m.includes('model') || m.includes('feature')) return 'model_report';
  return 'fallback';
}

exports.createSession = asyncHandler(async (req, res) => created(res, await prisma.assistantSession.create({ data: { userId: req.user.id, role: req.user.role, title: req.body.title || 'GeoCrime Assistant' } })));
exports.history = asyncHandler(async (req, res) => ok(res, await prisma.assistantSession.findMany({ where: { userId: req.user.id }, include: { messages: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 10 })));
exports.faqs = asyncHandler(async (req, res) => ok(res, await prisma.chatbotFAQ.findMany({ where: { OR: [{ role: req.user.role }, { role: null }], active: true } })));

exports.message = asyncHandler(async (req, res) => {
  const { message, role, context = {}, sessionId } = req.body;
  const intent = detectIntent(message);
  let session = sessionId ? await prisma.assistantSession.findUnique({ where: { id: sessionId } }) : null;
  if (!session) session = await prisma.assistantSession.create({ data: { userId: req.user?.id, role: req.user?.role || role || 'citizen', title: 'GeoCrime Assistant' } });
  await prisma.assistantMessage.create({ data: { sessionId: session.id, sender: 'user', message } });
  let reply = 'I can help with safety guidance, reports, predictions, alerts, and dashboard insights.';
  let cards = [];
  if (intent === 'zone_risk' || intent === 'safety_tip' || intent === 'prediction') {
    let zone = null;
    if (context.zoneId) zone = await prisma.zone.findUnique({ where: { id: context.zoneId }, include: { predictions: { orderBy: { predictionDate: 'asc' }, take: 7 } } });
    if (!zone) zone = await prisma.zone.findFirst({ orderBy: { riskScore: 'desc' }, include: { predictions: { orderBy: { predictionDate: 'asc' }, take: 7 } } });
    if (zone) {
      reply = `${zone.name} is currently ${zone.riskLevel.toUpperCase()} with risk score ${zone.riskScore}/100. Likely crime is ${zone.dominantCrime || 'Theft'} and peak time is ${zone.peakTime || '8 PM - 11 PM'}.`;
      cards.push({ type: 'risk_score', zoneName: zone.name, score: zone.riskScore, level: zone.riskLevel, forecast: zone.predictions });
    }
  } else if (intent === 'report_help') reply = 'To report an incident, open Report, select crime type, add description, attach photo if available, use current GPS location, and submit.';
  else if (intent === 'sos_help') reply = 'Use SOS only in emergency. GeoCrime will capture your GPS, create an emergency alert, and you should call 112 immediately.';
  else if (intent === 'patrol_help') {
    const zones = await prisma.zone.findMany({ orderBy: { riskScore: 'desc' }, take: 3 });
    reply = `Patrol priority: ${zones.map((z,i)=>`${i+1}. ${z.name} (${z.riskScore})`).join(', ')}.`;
    cards.push({ type: 'patrol_priority', zones });
  } else if (intent === 'model_report') {
    const run = await prisma.mlModelRun.findFirst({ orderBy: { completedAt: 'desc' } });
    reply = run ? `Latest model run ${run.modelName}: RMSE ${run.rmse}, R2 ${run.r2Score}, status ${run.status}.` : 'No ML run is available yet.';
    cards.push({ type: 'model_report', run });
  }
  await prisma.assistantMessage.create({ data: { sessionId: session.id, sender: 'bot', message: reply, cards } });
  if (req.user?.id) {
    req.io?.to(`user:${req.user.id}`).emit('chatbot:message', {
      sessionId: session.id,
      reply,
      intent,
      cards,
    });
  }
  ok(res, { sessionId: session.id, reply, cards, intent });
});
