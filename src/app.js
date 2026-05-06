const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const auth = require('./middleware/authMiddleware');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { clientOrigin } = require('./config/env');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: clientOrigin === '*' ? true : clientOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use((req, res, next) => { req.io = req.app.get('io'); next(); });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const healthPayload = () => ({
  success: true,
  service: 'GeoCrime API',
  status: 'online',
  time: new Date().toISOString(),
});

app.get('/', (req, res) => res.json(healthPayload()));
app.head('/', (req, res) => res.status(200).end());
app.get('/health', (req, res) => res.json(healthPayload()));

// Public/common routes
app.use('/api', require('./routes/commonRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));

// Protected routes
app.use('/api/me', auth, require('./routes/meRoutes'));
app.use('/api/citizen', auth, require('./routes/citizenRoutes'));
app.use('/api/officer', auth, require('./routes/officerRoutes'));
app.use('/api/admin', auth, require('./routes/adminRoutes'));
app.use('/api/analyst', auth, require('./routes/analystRoutes'));
app.use('/api/incidents', auth, require('./routes/incidentRoutes'));
app.use('/api/reports', auth, require('./routes/reportRoutes'));
app.use('/api/alerts', auth, require('./routes/alertRoutes'));
app.use('/api/sos', auth, require('./routes/sosRoutes'));
app.use('/api/datasets', auth, require('./routes/datasetRoutes'));
app.use('/api/predictions', auth, require('./routes/predictionRoutes'));
app.use('/api/ml', auth, require('./routes/mlRoutes'));
app.use('/api/assistant', auth, require('./routes/assistantRoutes'));
app.use('/api/chatbot', auth, require('./routes/assistantRoutes'));
app.use('/api/settings', auth, require('./routes/settingsRoutes'));
app.use('/api/exports', auth, require('./routes/exportRoutes'));

app.use(notFound);
app.use(errorHandler);
module.exports = app;
