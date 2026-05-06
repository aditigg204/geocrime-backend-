/**
 * Import Model 2 crime-type predictions into existing district predictions.
 *
 * Reads:
 *   ml-services/datasets/processed/model2_india_crime_type_predictions.csv
 *
 * Updates:
 *   MlPrediction.likelyCrime and MlPrediction.confidenceScore for matching
 *   state + district + predictionYear rows created by Model 1.
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CSV_PATH = path.join(
  __dirname,
  '../ml-services/datasets/processed/model2_india_crime_type_predictions.csv'
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

async function importModel2Predictions() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Model 2 CSV not found: ${CSV_PATH}`);
  }

  const rows = await readRows(CSV_PATH);
  let updated = 0;
  let inserted = 0;

  for (const row of rows) {
    const state = row.state?.trim() || null;
    const district = row.district?.trim() || null;
    const predictionYear = row.prediction_year
      ? Number.parseInt(row.prediction_year, 10)
      : null;
    const likelyCrime = row.predicted_crime_type?.trim() || null;
    const confidenceScore = row.confidence_score
      ? Number.parseFloat(row.confidence_score)
      : null;

    if (!state || !district || !predictionYear || !likelyCrime) continue;

    const model1Id = `${state}_${district}_${predictionYear}_model1_india_ipc`;
    const existing = await prisma.mlPrediction.findUnique({
      where: { id: model1Id },
    });

    if (existing) {
      await prisma.mlPrediction.update({
        where: { id: model1Id },
        data: {
          likelyCrime,
          confidenceScore: confidenceScore ?? existing.confidenceScore,
        },
      });
      updated++;
      continue;
    }

    await prisma.mlPrediction.upsert({
      where: {
        id: `${state}_${district}_${predictionYear}_model2_india_crime_type`,
      },
      update: {
        likelyCrime,
        confidenceScore,
      },
      create: {
        id: `${state}_${district}_${predictionYear}_model2_india_crime_type`,
        state,
        district,
        predictionYear,
        predictedRiskScore: 0,
        predictedRiskLevel: 'green',
        likelyCrime,
        confidenceScore,
        modelName: 'model2_india_crime_type',
      },
    });
    inserted++;
  }

  const result = { rowsRead: rows.length, updated, inserted };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  importModel2Predictions()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = importModel2Predictions;
