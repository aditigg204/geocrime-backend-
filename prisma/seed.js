const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

function level(score) {
  return score >= 71 ? 'red' : score >= 41 ? 'yellow' : 'green';
}

function priorityFromRisk(score) {
  if (score >= 85) return 'critical';
  if (score >= 71) return 'high';
  if (score >= 41) return 'medium';
  return 'low';
}

function randomAround(value, spread = 0.005) {
  return value + (Math.random() - 0.5) * spread;
}

async function clearDatabase() {
  // Delete child/dependent records first
  await prisma.assistantMessage.deleteMany();
  await prisma.assistantSession.deleteMany();
  await prisma.chatbotFAQ.deleteMany();

  await prisma.incidentMedia.deleteMany();
  await prisma.incidentStatusHistory.deleteMany();
  await prisma.incidentUpdate.deleteMany();

  await prisma.alert.deleteMany();
  await prisma.sosEvent.deleteMany();
  await prisma.incident.deleteMany();

  await prisma.mlPrediction.deleteMany();
  await prisma.zoneRiskScore.deleteMany();
  await prisma.hotspot.deleteMany();
  await prisma.mlModelRun.deleteMany();

  await prisma.datasetUpload.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.exportJob.deleteMany();
  await prisma.patrolRoute.deleteMany();

  await prisma.userSettings.deleteMany();
  await prisma.user.deleteMany();

  await prisma.crimeCategory.deleteMany();
  await prisma.zone.deleteMany();
}

async function main() {
  console.log('Starting GeoCrime seed...');

  await clearDatabase();

  const zonesData = [
    {
      name: 'Civil Lines',
      city: 'Delhi',
      lat: 28.6821,
      lng: 77.2250,
      riskScore: 84,
      dominantCrime: 'Theft',
      peakTime: '8 PM - 11 PM',
    },
    {
      name: 'Market Road',
      city: 'Delhi',
      lat: 28.6129,
      lng: 77.2295,
      riskScore: 78,
      dominantCrime: 'Harassment',
      peakTime: '7 PM - 10 PM',
    },
    {
      name: 'Bus Stand',
      city: 'Delhi',
      lat: 28.7041,
      lng: 77.1025,
      riskScore: 64,
      dominantCrime: 'Suspicious Activity',
      peakTime: '6 PM - 9 PM',
    },
    {
      name: 'University Area',
      city: 'Delhi',
      lat: 28.5449,
      lng: 77.1926,
      riskScore: 48,
      dominantCrime: 'Theft',
      peakTime: '5 PM - 8 PM',
    },
    {
      name: 'Green Park',
      city: 'Delhi',
      lat: 28.5582,
      lng: 77.2029,
      riskScore: 24,
      dominantCrime: 'Other',
      peakTime: 'Daytime',
    },
  ];

  const zones = [];

  for (const z of zonesData) {
    const createdZone = await prisma.zone.create({
      data: {
        name: z.name,
        city: z.city,
        lat: z.lat,
        lng: z.lng,
        riskScore: z.riskScore,
        riskLevel: level(z.riskScore),
        dominantCrime: z.dominantCrime,
        peakTime: z.peakTime,
        active: true,
      },
    });

    zones.push(createdZone);
  }

  console.log(`Created ${zones.length} zones.`);

  const categories = [
    ['Theft', 3],
    ['Harassment', 4],
    ['Assault', 5],
    ['Suspicious Activity', 2],
    ['Accident', 4],
    ['Cyber Crime', 3],
    ['Other', 2],
  ];

  const categoryMap = {};

  for (const [name, severityWeight] of categories) {
    const category = await prisma.crimeCategory.create({
      data: {
        name,
        severityWeight,
        active: true,
      },
    });

    categoryMap[name] = category;
  }

  console.log(`Created ${categories.length} crime categories.`);

  const passwordHash = await bcrypt.hash('123456', 10);

  const citizen = await prisma.user.create({
    data: {
      name: 'Aditi Sharma',
      email: 'citizen@geocrime.com',
      phone: '+91 9000000001',
      passwordHash,
      role: 'citizen',
      status: 'active',
      onboardingCompleted: true,
      settings: {
        create: {
          theme: 'light',
          language: 'en',
          notifications: true,
          locationPermission: true,
          anonymousReporting: true,
          sosConfirmation: true,
          showDashboardAssistant: true,
          assistantAvatar: 'female',
          chatbotOpeningStyle: 'compact',
        },
      },
    },
  });

  const officer = await prisma.user.create({
    data: {
      name: 'Officer Rahul',
      email: 'officer@geocrime.com',
      phone: '+91 9000000002',
      passwordHash,
      role: 'officer',
      status: 'active',
      badgeId: 'DL-PS-102',
      assignedZone: {
        connect: { id: zones[0].id },
      },
      settings: {
        create: {
          theme: 'light',
          language: 'en',
          notifications: true,
          showDashboardAssistant: true,
          assistantAvatar: 'male',
          chatbotOpeningStyle: 'compact',
        },
      },
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@geocrime.com',
      phone: '+91 9000000003',
      passwordHash,
      role: 'admin',
      status: 'active',
      settings: {
        create: {
          theme: 'light',
          language: 'en',
          notifications: true,
          showDashboardAssistant: true,
          assistantAvatar: 'neutral',
          chatbotOpeningStyle: 'expanded',
        },
      },
    },
  });

  const analyst = await prisma.user.create({
    data: {
      name: 'Analyst User',
      email: 'analyst@geocrime.com',
      phone: '+91 9000000004',
      passwordHash,
      role: 'analyst',
      status: 'active',
      settings: {
        create: {
          theme: 'light',
          language: 'en',
          notifications: true,
          showDashboardAssistant: true,
          assistantAvatar: 'neutral',
          chatbotOpeningStyle: 'compact',
        },
      },
    },
  });

  console.log('Created demo users.');

  const incidentTypes = [
    'Theft',
    'Harassment',
    'Suspicious Activity',
    'Assault',
    'Accident',
  ];

  const incidentStatuses = [
    'submitted',
    'under_review',
    'responding',
    'resolved',
    'escalated',
  ];

  for (let i = 0; i < 35; i++) {
    const z = zones[i % zones.length];
    const type = incidentTypes[i % incidentTypes.length];
    const status = incidentStatuses[i % incidentStatuses.length];
    const category = categoryMap[type] || categoryMap.Other;

    const incident = await prisma.incident.create({
      data: {
        type,
        description: `${type} reported near ${z.name}`,
        status,
        priority: priorityFromRisk(z.riskScore),
        riskLevelAtReport: z.riskLevel,
        severityScore:
          type === 'Assault'
            ? 5
            : type === 'Harassment'
              ? 4
              : type === 'Accident'
                ? 4
                : 3,
        locationText: z.name,
        lat: randomAround(z.lat, 0.01),
        lng: randomAround(z.lng, 0.01),
        isAnonymous: i % 4 === 0,
        createdAt: new Date(Date.now() - i * 3600 * 1000),

        reportedBy: {
          connect: { id: citizen.id },
        },
        assignedOfficer: {
          connect: { id: officer.id },
        },
        zone: {
          connect: { id: z.id },
        },
        category: {
          connect: { id: category.id },
        },
        history: {
          create: {
            oldStatus: null,
            newStatus: status,
            updatedById: officer.id,
            comment: 'Seed status',
          },
        },
      },
    });

    if (i < 8) {
      await prisma.alert.create({
        data: {
          user: {
            connect: { id: officer.id },
          },
          incident: {
            connect: { id: incident.id },
          },
          zone: {
            connect: { id: z.id },
          },
          officerId: officer.id,
          title: 'New report',
          message: `${type} in ${z.name}`,
          alertType: 'incident',
          severity: z.riskLevel === 'red' ? 'high' : 'medium',
          status: 'sent',
          lat: incident.lat,
          lng: incident.lng,
        },
      });
    }
  }

  console.log('Created incidents and alerts.');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const z of zones) {
    await prisma.zoneRiskScore.create({
      data: {
        zoneId: z.id,
        zoneName: z.name,
        predictionDate: today,
        riskScore: z.riskScore,
        riskLevel: z.riskLevel,
        confidenceScore: 0.82,
        topReason: 'Recent crime count and severity increased',
        modelName: 'RandomForestRegressor',
      },
    });

    for (let d = 0; d < 7; d++) {
      const predictionDate = new Date(today);
      predictionDate.setDate(today.getDate() + d);

      const score = Math.max(
        10,
        Math.min(95, z.riskScore + Math.round((Math.random() - 0.5) * 14))
      );

      await prisma.mlPrediction.create({
        data: {
          zone: {
            connect: { id: z.id },
          },
          zoneName: z.name,
          predictionDate,
          predictedRiskScore: score,
          predictedRiskLevel: level(score),
          likelyCrime: z.dominantCrime,
          peakTime: z.peakTime,
          confidenceScore: 0.75 + Math.random() * 0.18,
          modelName: 'RandomForestRegressor',
        },
      });
    }

    if (z.riskScore > 60) {
      await prisma.hotspot.create({
        data: {
          clusterId: `H-${z.name.slice(0, 3).toUpperCase()}`,
          zoneId: z.id,
          centerLat: z.lat,
          centerLng: z.lng,
          radiusMeters: 650,
          crimeCount: Math.round(z.riskScore / 2),
          dominantCrimeType: z.dominantCrime,
          riskScore: z.riskScore,
          riskLevel: z.riskLevel,
        },
      });
    }
  }

  console.log('Created zone risk scores, ML predictions, and hotspots.');

  await prisma.mlModelRun.create({
    data: {
      modelName: 'risk_model_v1',
      modelType: 'RandomForestRegressor',
      mae: 7.8,
      rmse: 10.6,
      r2Score: 0.74,
      trainingRows: 10000,
      testRows: 2500,
      status: 'success',
    },
  });

  await prisma.mlModelRun.create({
    data: {
      modelName: 'crime_type_model_v1',
      modelType: 'RandomForestClassifier',
      accuracy: 0.78,
      precision: 0.76,
      recall: 0.73,
      f1Score: 0.74,
      trainingRows: 10000,
      testRows: 2500,
      status: 'success',
    },
  });

  console.log('Created ML model run records.');

  await prisma.sosEvent.create({
    data: {
      user: {
        connect: { id: citizen.id },
      },
      lat: zones[0].lat,
      lng: zones[0].lng,
      message: 'Emergency SOS from dashboard',
      source: 'dashboard',
      status: 'open',
      nearestOfficerId: officer.id,
    },
  });

  const faqs = [
    [
      'citizen',
      'safety_tip',
      'What should I do in a red zone?',
      'Avoid isolated streets, stay in crowded areas, share your live location, and use SOS if unsafe.',
    ],
    [
      'citizen',
      'report_help',
      'How do I report an incident?',
      'Open Report, select crime type, add description and GPS, attach evidence if available, then submit.',
    ],
    [
      'officer',
      'patrol_help',
      'Which zone should I patrol first?',
      'Patrol zones sorted by predicted risk score, starting with red zones and high-confidence hotspots.',
    ],
    [
      'admin',
      'ml_help',
      'How to run ML model?',
      'Open ML Control Center and click Run Prediction or Train Model after dataset validation.',
    ],
    [
      'analyst',
      'model_report',
      'How to read model accuracy?',
      'Risk model uses MAE, RMSE, and R2; crime type model uses accuracy, precision, recall, and F1 score.',
    ],
  ];

  for (const [role, intent, question, answer] of faqs) {
    await prisma.chatbotFAQ.create({
      data: {
        role,
        intent,
        question,
        answer,
      },
    });
  }

  console.log('Created chatbot FAQs.');

  await prisma.systemLog.create({
    data: {
      user: {
        connect: { id: admin.id },
      },
      action: 'seed_database',
      module: 'system',
      details: {
        message: 'Seed data generated successfully',
        users: 4,
        zones: zones.length,
        incidents: 35,
      },
    },
  });

  console.log('Seed completed. Demo users password: 123456');
  console.table([
    { role: 'citizen', email: 'citizen@geocrime.com', password: '123456' },
    { role: 'officer', email: 'officer@geocrime.com', password: '123456' },
    { role: 'admin', email: 'admin@geocrime.com', password: '123456' },
    { role: 'analyst', email: 'analyst@geocrime.com', password: '123456' },
  ]);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });