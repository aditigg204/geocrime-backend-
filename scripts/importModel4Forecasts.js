/**
 * Import Model 4 7-day zone forecasts into PostgreSQL.
 *
 * Reads:
 *   ml-services/datasets/processed/model4_7day_zone_predictions.csv
 *
 * Inserts/updates:
 *   Zone
 *   MlPrediction
 *   ZoneRiskScore
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CSV_PATH = path.join(
  __dirname,
  '../ml-services/datasets/processed/model4_7day_zone_predictions.csv'
);

function readRows(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function toRiskLevel(value) {
  const level = `${value || ''}`.toLowerCase();
  return ['red', 'yellow', 'green'].includes(level) ? level : 'green';
}

function toFloat(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function toIntScore(value) {
  return Math.round(Math.max(0, Math.min(100, toFloat(value, 0))));
}

async function ensureZone(row) {
  const zoneName = row.zone_name?.trim() || `Chicago Zone ${row.zone_id}`;
  const centerLat = toFloat(row.center_latitude);
  const centerLng = toFloat(row.center_longitude);
  const score = toIntScore(row.predicted_risk_score);
  const level = toRiskLevel(row.predicted_risk_level);

  return prisma.zone.upsert({
    where: { name: zoneName },
    update: {
      riskScore: score,
      riskLevel: level,
      dominantCrime: row.predicted_crime_type?.trim() || undefined,
      lat: centerLat || undefined,
      lng: centerLng || undefined,
      active: true,
    },
    create: {
      name: zoneName,
      city: 'Chicago',
      lat: centerLat,
      lng: centerLng,
      riskScore: score,
      riskLevel: level,
      dominantCrime: row.predicted_crime_type?.trim() || null,
      active: true,
    },
  });
}

async function importModel4Forecasts() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Model 4 CSV not found: ${CSV_PATH}`);
  }

  const rows = await readRows(CSV_PATH);
  const existing = await prisma.mlPrediction.findMany({
    where: { modelName: 'model4_7day_zone_forecast' },
    select: { id: true },
  });

  if (existing.length) {
    await prisma.mlPrediction.deleteMany({
      where: { id: { in: existing.map((item) => item.id) } },
    });
  }

  const deletedRiskScores = await prisma.zoneRiskScore.deleteMany({
    where: { modelName: 'model4_7day_zone_forecast' },
  });

  let predictions = 0;
  let riskScores = 0;
  const zones = new Map();

  for (const row of rows) {
    const zoneKey = row.zone_id?.trim();
    const predictionDate = row.prediction_date
      ? new Date(`${row.prediction_date}T00:00:00.000Z`)
      : null;
    if (!zoneKey || !predictionDate) continue;

    const zone = zones.get(zoneKey) || (await ensureZone(row));
    zones.set(zoneKey, zone);

    const score = toIntScore(row.predicted_risk_score);
    const level = toRiskLevel(row.predicted_risk_level);
    const likelyCrime = row.predicted_crime_type?.trim() || null;
    const confidenceScore = row.confidence_score
      ? toFloat(row.confidence_score, null)
      : null;
    const id = `${zone.id}_${row.prediction_date}_model4_7day_zone_forecast`;

    await prisma.mlPrediction.create({
      data: {
        id,
        zoneId: zone.id,
        zoneName: zone.name,
        predictionDate,
        predictionYear: predictionDate.getUTCFullYear(),
        predictedRiskScore: score,
        predictedRiskLevel: level,
        likelyCrime,
        confidenceScore,
        recommendation:
          level === 'red'
            ? 'Increase patrol coverage for the forecast window'
            : level === 'yellow'
            ? 'Monitor trend and prepare patrol adjustment'
            : 'Normal patrol coverage is sufficient',
        modelName: 'model4_7day_zone_forecast',
      },
    });
    predictions++;

    await prisma.zoneRiskScore.create({
      data: {
        zoneId: zone.id,
        zoneName: zone.name,
        predictionDate,
        riskScore: score,
        riskLevel: level,
        confidenceScore,
        topReason: likelyCrime ? `Forecast driver: ${likelyCrime}` : '7-day forecast',
        modelName: 'model4_7day_zone_forecast',
      },
    });
    riskScores++;
  }

  const result = {
    rowsRead: rows.length,
    zones: zones.size,
    deletedPredictions: existing.length,
    deletedRiskScores: deletedRiskScores.count,
    predictions,
    riskScores,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  importModel4Forecasts()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = importModel4Forecasts;
