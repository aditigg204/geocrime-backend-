function riskLevel(score = 0) {
  if (score >= 71) return 'red';
  if (score >= 41) return 'yellow';
  return 'green';
}
function priorityFromRisk(score = 0) {
  if (score >= 85) return 'critical';
  if (score >= 71) return 'high';
  if (score >= 41) return 'medium';
  return 'low';
}
module.exports = { riskLevel, priorityFromRisk };
