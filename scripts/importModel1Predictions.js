/**
 * Import Model 1 Predictions from CSV to PostgreSQL
 * 
 * Usage: node scripts/importModel1Predictions.js
 * 
 * Reads: ml-services/datasets/processed/model1_india_ipc_future_predictions.csv
 * Inserts into: MlPrediction table
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const csv = require('csv-parser');

const prisma = new PrismaClient();

const CSV_PATH = path.join(__dirname, '../ml-services/datasets/processed/model1_india_ipc_future_predictions.csv');

async function importPredictions() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('IMPORTING MODEL 1 PREDICTIONS TO DATABASE');
    console.log('='.repeat(60));

    // Check if file exists
    if (!fs.existsSync(CSV_PATH)) {
      throw new Error(`CSV file not found: ${CSV_PATH}`);
    }

    const predictions = [];
    let rowCount = 0;

    // Read CSV file
    console.log(`\n[1/3] Reading CSV file...`);
    console.log(`File: ${CSV_PATH}`);

    return new Promise((resolve, reject) => {
      fs.createReadStream(CSV_PATH)
        .pipe(csv())
        .on('data', (row) => {
          // Map CSV columns to database fields
          const prediction = {
            state: row.state?.trim() || null,
            district: row.district?.trim() || null,
            predictionYear: row.prediction_year ? parseInt(row.prediction_year) : null,
            predictedRiskScore: parseFloat(row.predicted_risk_score) || 0,
            predictedRiskLevel: (row.predicted_risk_level?.toLowerCase() || 'green'),
            mainCrimeDriver: row.main_crime_driver?.trim() || null,
            likelyCrime: row.main_crime_driver?.trim() || null,
            recommendation: row.recommendation?.trim() || null,
            confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : 0.95,
            modelName: row.model_name?.trim() || 'model1_india_ipc',
          };

          predictions.push(prediction);
          rowCount++;

          // Log progress every 100 rows
          if (rowCount % 100 === 0) {
            process.stdout.write(`\r  Rows read: ${rowCount}`);
          }
        })
        .on('end', async () => {
          console.log(`\n  ✓ Total rows read: ${rowCount}`);

          try {
            // Step 2: Clear existing predictions for this model (optional - uncomment if needed)
            // console.log(`\n[2/3] Clearing existing predictions...`);
            // const deletedCount = await prisma.mlPrediction.deleteMany({
            //   where: { modelName: 'model1_india_ipc' }
            // });
            // console.log(`  ✓ Deleted ${deletedCount.count} old predictions`);

            // Step 2: Upsert predictions (insert or update if exists)
            console.log(`\n[2/3] Inserting predictions into database...`);
            
            let insertedCount = 0;
            let updatedCount = 0;

            for (const prediction of predictions) {
              try {
                const result = await prisma.mlPrediction.upsert({
                  where: {
                    // Unique constraint: state + district + predictionYear + modelName
                    id: `${prediction.state}_${prediction.district}_${prediction.predictionYear}_${prediction.modelName}`,
                  },
                  update: prediction,
                  create: {
                    id: `${prediction.state}_${prediction.district}_${prediction.predictionYear}_${prediction.modelName}`,
                    ...prediction,
                  },
                });

                insertedCount++;
              } catch (err) {
                // If upsert fails, try simple create
                try {
                  await prisma.mlPrediction.create({
                    data: {
                      id: `${prediction.state}_${prediction.district}_${prediction.predictionYear}_${prediction.modelName}_${Date.now()}`,
                      ...prediction,
                    },
                  });
                  insertedCount++;
                } catch (createErr) {
                  console.error(`Error inserting prediction for ${prediction.district}: ${createErr.message}`);
                }
              }

              if (insertedCount % 100 === 0) {
                process.stdout.write(`\r  Processed: ${insertedCount}/${rowCount}`);
              }
            }

            console.log(`\n  ✓ Inserted/Updated: ${insertedCount} predictions`);

            // Step 3: Get statistics
            console.log(`\n[3/3] Database statistics...`);
            
            const riskLevels = await prisma.mlPrediction.groupBy({
              by: ['predictedRiskLevel'],
              _count: true,
              where: { modelName: 'model1_india_ipc' }
            });

            const avgRiskScore = await prisma.mlPrediction.aggregate({
              _avg: { predictedRiskScore: true },
              where: { modelName: 'model1_india_ipc' }
            });

            const stateCount = await prisma.mlPrediction.findMany({
              distinct: ['state'],
              select: { state: true },
              where: { modelName: 'model1_india_ipc' }
            });

            console.log(`\n  Risk Level Distribution:`);
            riskLevels.forEach(level => {
              const emoji = level.predictedRiskLevel === 'red' ? '🔴' : 
                           level.predictedRiskLevel === 'yellow' ? '🟡' : '🟢';
              console.log(`    ${emoji} ${level.predictedRiskLevel.toUpperCase()}: ${level._count}`);
            });

            console.log(`\n  Average Risk Score: ${(avgRiskScore._avg.predictedRiskScore || 0).toFixed(2)}/100`);
            console.log(`  States Covered: ${stateCount.length}`);
            console.log(`  Total Predictions: ${insertedCount}`);

            console.log('\n' + '='.repeat(60));
            console.log('✓ IMPORT COMPLETED SUCCESSFULLY');
            console.log('='.repeat(60) + '\n');

            resolve(true);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  } catch (error) {
    console.error('\n✗ IMPORT FAILED:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run import
importPredictions()
  .then(() => {
    console.log('Ready to use predictions in API!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  });
