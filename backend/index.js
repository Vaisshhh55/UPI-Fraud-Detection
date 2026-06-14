const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'upiFraud';
const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001/predict';
const mlServiceHealthUrl = process.env.ML_SERVICE_HEALTH_URL || mlServiceUrl.replace(/\/predict$/, '/health');
const jwtSecret = process.env.JWT_SECRET || 'replace_me_with_a_secret';
const port = process.env.PORT || 5000;

let db = null;
const memory = {
  users: [],
  transactions: [],
  alerts: [],
  userFlags: {},
  systemConfig: {
    fraudThreshold: 0.6
  }
};

function normalizeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return {
    id: user._id ? user._id.toString() : user.id,
    ...rest
  };
}

function buildToken(user) {
  return jwt.sign(
    {
      id: user._id ? user._id.toString() : user.id,
      email: user.email,
      role: user.role || 'user'
    },
    jwtSecret,
    { expiresIn: '8h' }
  );
}

async function findUserByEmail(email) {
  if (db) {
    return db.collection('users').findOne({ email });
  }
  return memory.users.find((user) => user.email === email);
}

async function findUserById(id) {
  if (db) {
    try {
      return db.collection('users').findOne({ _id: new ObjectId(id) });
    } catch {
      return null;
    }
  }
  return memory.users.find((user) => user.id === id || user._id === id);
}

async function createUser({ name, email, password, role = 'user' }) {
  const passwordHash = bcrypt.hashSync(password, 10);
  const user = {
    name,
    email,
    password: passwordHash,
    role,
    createdAt: new Date().toISOString()
  };

  if (db) {
    const result = await db.collection('users').insertOne(user);
    return { ...user, _id: result.insertedId };
  }

  const id = new ObjectId().toString();
  memory.users.push({ ...user, id });
  return { ...user, id };
}

async function createTransaction(record) {
  if (db) {
    await db.collection('transactions').insertOne(record);
    return record;
  }

  memory.transactions.unshift(record);
  return record;
}

function createFallbackPrediction(payload) {
  const amountScore = Math.min(1, Math.max(0, payload.amount / 20000));
  const frequencyScore = Math.min(1, payload.frequency / 10);
  const anomalyScore = (payload.location_anomaly + payload.time_anomaly) * 0.25;
  const score = Math.min(1, amountScore * 0.45 + frequencyScore * 0.25 + anomalyScore * 0.3);
  return {
    features: payload,
    fraud: score >= memory.systemConfig.fraudThreshold,
    score
  };
}

async function getPrediction(payload) {
  try {
    const response = await axios.post(mlServiceUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.warn('ML service unavailable; using fallback prediction:', error.message || error);
    return createFallbackPrediction(payload);
  }
}

async function checkMlServiceHealth() {
  try {
    await axios.get(mlServiceHealthUrl, { timeout: 3000 });
    return 'running';
  } catch {
    return 'offline';
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await findUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const normalizedRole = role === 'admin' ? 'admin' : 'user';
    const user = await createUser({ name, email: email.toLowerCase(), password, role: normalizedRole });
    const token = buildToken(user);

    res.json({ token, user: normalizeUser(user) });
  } catch (error) {
    console.error('Register error', error.message || error);
    res.status(500).json({ error: 'Unable to create user' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUserByEmail(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = buildToken(user);
    res.json({ token, user: normalizeUser(user) });
  } catch (error) {
    console.error('Login error', error.message || error);
    res.status(500).json({ error: 'Unable to login' });
  }
});

app.get('/api/users/me', authMiddleware, async (req, res) => {
  const user = await findUserById(req.user.id);
  res.json(normalizeUser(user));
});

app.get('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
  if (db) {
    const users = await db.collection('users').find().project({ password: 0 }).toArray();
    return res.json(users.map((user) => normalizeUser(user)));
  }
  return res.json(memory.users.map((user) => normalizeUser(user)));
});

app.post('/api/transactions', authMiddleware, async (req, res) => {
  try {
    const { amount, timestamp, location, deviceId, frequency, locationAnomaly, timeAnomaly } = req.body;
    const payload = {
      amount: Number(amount || 0),
      frequency: Number(frequency || 0),
      location_anomaly: locationAnomaly ? 1 : 0,
      time_anomaly: timeAnomaly ? 1 : 0
    };

    const prediction = await getPrediction(payload);
    const record = {
      userId: req.user.id,
      userEmail: req.user.email,
      amount,
      timestamp: timestamp || new Date().toISOString(),
      location,
      deviceId,
      frequency,
      locationAnomaly,
      timeAnomaly,
      prediction,
      createdAt: new Date().toISOString()
    };

    await createTransaction(record);

    // Create alert if fraud is detected
    if (prediction.fraud) {
      const alert = {
        userId: req.user.id,
        userEmail: req.user.email,
        type: 'fraud_detected',
        reason: `Suspicious transaction of ₹${amount} detected from ${location}. Fraud confidence: ${(prediction.score * 100).toFixed(1)}%`,
        transactionId: record._id || record.id,
        amount,
        location,
        createdAt: new Date().toISOString()
      };

      if (db) {
        await db.collection('alerts').insertOne(alert);
      } else {
        memory.alerts.unshift(alert);
      }
    }

    res.json(record);
  } catch (error) {
    console.error('Transaction error', error.message || error);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

app.get('/api/transactions', authMiddleware, async (req, res) => {
  if (db) {
    const filter = req.user.role === 'admin' ? {} : { userId: req.user.id };
    const stored = await db.collection('transactions').find(filter).sort({ createdAt: -1 }).limit(100).toArray();
    return res.json(stored);
  }

  const filtered = memory.transactions.filter((item) => req.user.role === 'admin' || item.userId === req.user.id);
  return res.json(filtered.slice(0, 100));
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  const source = db
    ? await db.collection('transactions').find(req.user.role === 'admin' ? {} : { userId: req.user.id }).toArray()
    : memory.transactions.filter((item) => req.user.role === 'admin' || item.userId === req.user.id);

  const total = source.length;
  const fraud = source.filter((item) => item.prediction && item.prediction.fraud).length;
  const legitimate = total - fraud;

  res.json({ total, fraud, legitimate });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  if (db) {
    const users = await db.collection('users').find({ role: 'user' }).project({ password: 0 }).toArray();
    const enhanced = await Promise.all(users.map(async (user) => {
      const txCount = await db.collection('transactions').countDocuments({ userId: user._id.toString() });
      const fraudCount = await db.collection('transactions').countDocuments({ userId: user._id.toString(), 'prediction.fraud': true });
      return {
        ...normalizeUser(user),
        transactionCount: txCount,
        fraudCount: fraudCount,
        isFlagged: memory.userFlags[user._id.toString()] ? true : false
      };
    }));
    return res.json(enhanced);
  }

  const enhanced = memory.users
    .filter((user) => user.role === 'user')
    .map((user) => {
      const userTx = memory.transactions.filter((tx) => tx.userId === user.id);
      const fraudTx = userTx.filter((tx) => tx.prediction && tx.prediction.fraud);
      return {
        ...normalizeUser(user),
        transactionCount: userTx.length,
        fraudCount: fraudTx.length,
        isFlagged: memory.userFlags[user.id] ? true : false
      };
    });

  res.json(enhanced);
});

app.get('/api/admin/users/:userId/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  if (db) {
    try {
      const txs = await db.collection('transactions').find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray();
      return res.json(txs);
    } catch {
      return res.status(400).json({ error: 'Invalid userId' });
    }
  }

  const txs = memory.transactions.filter((tx) => tx.userId === userId).slice(0, limit);
  res.json(txs);
});

app.post('/api/admin/users/:userId/flag', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { flagged, reason } = req.body;

  if (flagged) {
    memory.userFlags[userId] = { reason, flaggedAt: new Date().toISOString(), flaggedBy: req.user.id };
    if (db) {
      await db.collection('alerts').insertOne({
        type: 'user_flagged',
        userId,
        reason,
        flaggedBy: req.user.id,
        createdAt: new Date().toISOString()
      });
    }
  } else {
    delete memory.userFlags[userId];
  }

  res.json({ success: true, message: flagged ? 'User flagged' : 'User unflagged' });
});

app.get('/api/admin/fraud-analytics', authMiddleware, adminMiddleware, async (req, res) => {
  const source = db ? await db.collection('transactions').find().toArray() : memory.transactions;

  const total = source.length;
  const fraudCount = source.filter((item) => item.prediction && item.prediction.fraud).length;
  const fraudRate = total > 0 ? (fraudCount / total * 100).toFixed(2) : 0;

  const locationFraud = {};
  source.forEach((tx) => {
    if (!locationFraud[tx.location]) {
      locationFraud[tx.location] = { total: 0, fraud: 0 };
    }
    locationFraud[tx.location].total++;
    if (tx.prediction && tx.prediction.fraud) {
      locationFraud[tx.location].fraud++;
    }
  });

  const amountRanges = { 'under_1k': 0, '1k_5k': 0, '5k_10k': 0, 'over_10k': 0 };
  const amountFraud = { 'under_1k': 0, '1k_5k': 0, '5k_10k': 0, 'over_10k': 0 };
  source.forEach((tx) => {
    const amt = parseInt(tx.amount);
    let range;
    if (amt < 1000) range = 'under_1k';
    else if (amt < 5000) range = '1k_5k';
    else if (amt < 10000) range = '5k_10k';
    else range = 'over_10k';

    amountRanges[range]++;
    if (tx.prediction && tx.prediction.fraud) amountFraud[range]++;
  });

  res.json({
    totalTransactions: total,
    totalFraud: fraudCount,
    fraudRate: fraudRate + '%',
    locationFraud,
    amountFraud,
    amountRanges,
    recentAlerts: memory.alerts.slice(-10)
  });
});

app.get('/api/admin/system-health', authMiddleware, adminMiddleware, async (req, res) => {
  const txCount = db ? await db.collection('transactions').countDocuments() : memory.transactions.length;
  const userCount = db ? await db.collection('users').countDocuments() : memory.users.length;
  const fraudCount = db
    ? await db.collection('transactions').countDocuments({ 'prediction.fraud': true })
    : memory.transactions.filter((tx) => tx.prediction && tx.prediction.fraud).length;
  const mlServiceStatus = await checkMlServiceHealth();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    stats: {
      totalUsers: userCount,
      totalTransactions: txCount,
      fraudDetected: fraudCount,
      fraudThreshold: memory.systemConfig.fraudThreshold
    },
    mlServiceStatus
  });
});

app.post('/api/admin/fraud-threshold', authMiddleware, adminMiddleware, (req, res) => {
  const { threshold } = req.body;
  if (threshold < 0 || threshold > 1) {
    return res.status(400).json({ error: 'Threshold must be between 0 and 1' });
  }
  memory.systemConfig.fraudThreshold = threshold;
  res.json({ success: true, fraudThreshold: threshold });
});

app.get('/api/user/alerts', authMiddleware, async (req, res) => {
  if (db) {
    const userAlerts = await db.collection('alerts').find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(20).toArray();
    return res.json(userAlerts);
  }

  const userAlerts = memory.alerts.filter((alert) => alert.userId === req.user.id).slice(0, 20);
  res.json(userAlerts);
});

app.post('/api/transactions/export', authMiddleware, async (req, res) => {
  const source = db
    ? await db.collection('transactions').find({ userId: req.user.id }).sort({ createdAt: -1 }).toArray()
    : memory.transactions.filter((item) => item.userId === req.user.id);

  const csv = [
    ['Timestamp', 'Amount', 'Location', 'Device', 'Fraud', 'Score'].join(','),
    ...source.map((tx) =>
      [
        tx.createdAt,
        tx.amount,
        tx.location,
        tx.deviceId,
        tx.prediction.fraud ? 'Yes' : 'No',
        tx.prediction.score.toFixed(4)
      ].join(',')
    )
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
  res.send(csv);
});

async function connectDb() {
  if (!mongoUri) {
    console.log('MONGODB_URI is not configured. Running without MongoDB persistence.');
    return;
  }

  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db(mongoDbName);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.warn('MongoDB connection failed:', err.message);
    db = null;
  }
}

connectDb()
  .catch((err) => console.warn('MongoDB start failed:', err.message))
  .finally(() => {
    app.listen(port, () => {
      console.log(`Backend API running on http://localhost:${port}`);
    });
  });
