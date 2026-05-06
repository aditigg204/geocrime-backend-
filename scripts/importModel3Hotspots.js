/**
 * Import Model 3 DBSCAN hotspots into PostgreSQL.
 *
 * Reads:
 *   ml-services/datasets/processed/model3_hotspots.csv
 *
 * Inserts into:
 *   Hotspot table
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CSV_PATH = path.join(
  __dirname,
  '../ml-services/datasets/processed/model3_hotspots.csv'
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

function toInt(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function toFloat(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

async function importModel3Hotspots() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Model 3 CSV not found: ${CSV_PATH}`);
  }

  const rows = await readRows(CSV_PATH);
  const existing = await prisma.hotspot.findMany({
    where: {
      clusterId: {
        startsWith: 'model3_',
      },
    },
    select: { id: true },
  });

  if (existing.length) {
    await prisma.hotspot.deleteMany({
      where: {
        id: {
          in: existing.map((item) => item.id),
        },
      },
    });
  }

  let inserted = 0;
  for (const row of rows) {
    const clusterId = row.cluster_id?.trim();
    const centerLat = toFloat(row.center_latitude);
    const centerLng = toFloat(row.center_longitude);
    if (!clusterId || !centerLat || !centerLng) continue;

    await prisma.hotspot.create({
      data: {
        clusterId: `model3_${clusterId}`,
        centerLat,
        centerLng,
        crimeCount: toInt(row.crime_count),
        dominantCrimeType: row.dominant_crime_type?.trim() || null,
        riskScore: Math.round(toFloat(row.risk_score)),
        riskLevel: toRiskLevel(row.risk_level),
        radiusMeters: 500,
      },
    });
    inserted++;
  }

  const result = { rowsRead: rows.length, deleted: existing.length, inserted };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  importModel3Hotspots()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = importModel3Hotspots;
