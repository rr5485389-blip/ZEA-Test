import express, { Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_FILE = path.resolve(__dirname, 'data', 'exam-data.json');
const SECRETS_DIR = path.resolve(__dirname, 'secrets');
const PASSWORD_FILE = path.resolve(SECRETS_DIR, 'admin_password.json');
const PASSWORD_LOG_FILE = path.resolve(SECRETS_DIR, 'password_history.log');

// Enable CORS so second devices on the same Wi-Fi / LAN connect without friction
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

interface ExamData {
  questions: Array<{
    id: number | string;
    text: string;
    opts: string[];
    correct: number;
  }>;
  settings: {
    timeLimitMin: number;
    questionCount: number;
    maxSwitches?: number;
    passingScore?: number;
  };
  candidates: Array<{
    id: number;
    name: string;
    date: string;
    score: number;
    total: number;
    switches: number;
    status: string;
  }>;
  pw: string;
}

function ensureSecretsDir() {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
  }
}

function savePasswordToSecretsFolder(newPassword: string) {
  try {
    ensureSecretsDir();
    const payload = {
      currentPassword: newPassword,
      lastUpdated: new Date().toISOString(),
      updatedTimestamp: Date.now()
    };
    fs.writeFileSync(PASSWORD_FILE, JSON.stringify(payload, null, 2), 'utf-8');

    const logEntry = `[${new Date().toISOString()}] Password updated: "${newPassword}"\n`;
    fs.appendFileSync(PASSWORD_LOG_FILE, logEntry, 'utf-8');
  } catch (err) {
    console.error('Error saving password to secrets folder:', err);
  }
}

function getStoredPassword(): string {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      const data = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf-8'));
      if (data && data.currentPassword) {
        return data.currentPassword;
      }
    }
  } catch (err) {}
  return 'admin123';
}

function loadData(): ExamData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Ensure password synchronizes with the secrets folder
      const storedSecretPw = getStoredPassword();
      if (storedSecretPw) {
        parsed.pw = storedSecretPw;
      }
      return parsed;
    }
  } catch (err) {
    console.error('Error reading exam data file:', err);
  }
  const defaultPw = getStoredPassword();
  return {
    questions: [],
    settings: { timeLimitMin: 30, questionCount: 10, maxSwitches: 3, passingScore: 70 },
    candidates: [],
    pw: defaultPw,
  };
}

function saveData(data: ExamData) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing exam data file:', err);
  }
}

let examData: ExamData = loadData();

// SSE Clients for real-time live synchronization across devices and tabs
type SSEClient = { id: number; res: Response };
let sseClients: SSEClient[] = [];

function notifyClients(event: string, payload: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(message);
    } catch {
      // Ignore write errors; will be pruned on close
    }
  });
}

// Direct zip download endpoint for user
app.get('/download-zip', (_req: Request, res: Response) => {
  const zipPath = path.resolve(__dirname, 'interview-test-platform.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'interview-test-platform.zip');
  } else {
    res.status(404).send('Zip file not found. Re-run zip command.');
  }
});

// SSE stream endpoint
app.get('/api/exam-data/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  const clientId = Date.now() + Math.random();
  const client: SSEClient = { id: clientId, res };
  sseClients.push(client);

  // Send current state on connection
  res.write(`event: init\ndata: ${JSON.stringify(examData)}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

// API Routes
app.get('/api/exam-data', (_req: Request, res: Response) => {
  res.json(examData);
});

app.get('/api/exam-data/settings', (_req: Request, res: Response) => {
  res.json(examData.settings);
});

app.post('/api/exam-data/settings', (req: Request, res: Response) => {
  const { timeLimitMin, questionCount, maxSwitches, passingScore } = req.body;
  if (timeLimitMin) examData.settings.timeLimitMin = Number(timeLimitMin);
  if (questionCount) examData.settings.questionCount = Number(questionCount);
  if (maxSwitches) examData.settings.maxSwitches = Number(maxSwitches);
  if (passingScore) examData.settings.passingScore = Number(passingScore);

  saveData(examData);
  notifyClients('settings', examData.settings);
  res.json({ success: true, settings: examData.settings });
});

app.post('/api/exam-data/questions', (req: Request, res: Response) => {
  const { questions } = req.body;
  if (Array.isArray(questions)) {
    examData.questions = questions;
    saveData(examData);
    notifyClients('questions', examData.questions);
    res.json({ success: true, count: examData.questions.length });
  } else {
    res.status(400).json({ error: 'Questions must be an array' });
  }
});

app.post('/api/exam-data/candidates', (req: Request, res: Response) => {
  const cand = req.body;
  if (cand && cand.name) {
    const existingIndex = examData.candidates.findIndex((c) => c.id === cand.id);
    if (existingIndex >= 0) {
      examData.candidates[existingIndex] = { ...examData.candidates[existingIndex], ...cand };
    } else {
      examData.candidates.unshift(cand);
    }
    saveData(examData);
    notifyClients('candidates', examData.candidates);
    res.json({ success: true, candidate: cand });
  } else {
    res.status(400).json({ error: 'Invalid candidate data' });
  }
});

app.delete('/api/exam-data/candidates/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  examData.candidates = examData.candidates.filter((c) => c.id !== id);
  saveData(examData);
  notifyClients('candidates', examData.candidates);
  res.json({ success: true });
});

app.post('/api/exam-data/password', (req: Request, res: Response) => {
  const { pw } = req.body;
  if (pw && typeof pw === 'string') {
    examData.pw = pw;
    saveData(examData);
    savePasswordToSecretsFolder(pw);
    res.json({ success: true, message: 'Password saved to secrets folder successfully' });
  } else {
    res.status(400).json({ error: 'Password required' });
  }
});

app.get('/download-zip', (_req: Request, res: Response) => {
  const zipPath = path.resolve(__dirname, 'interview-test-platform.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'interview-test-platform.zip');
  } else {
    res.status(404).send('Zip file not found');
  }
});

async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const distHtml = path.resolve(distPath, 'index.html');
  const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(distHtml);

  if (isProd && fs.existsSync(distHtml)) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(distHtml);
    });
  } else {
    try {
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          port: PORT,
          host: '0.0.0.0',
          hmr: process.env.DISABLE_HMR !== 'true',
          watch: process.env.DISABLE_HMR === 'true' ? null : {},
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch(err) {
      const rootHtml = path.resolve(__dirname, 'index.html');
      app.use(express.static(__dirname));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(rootHtml);
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`Interview Test Server is Running!`);
    console.log(`➜ Local (this PC):       http://localhost:${PORT}`);
    
    // Find and print LAN IP addresses for 2nd device access
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const list = ifaces[name] || [];
      for (const net of list) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`➜ Network (2nd Device): http://${net.address}:${PORT}`);
        }
      }
    }
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
