import express from 'express';
import multer from 'multer';
import archiver from 'archiver';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createWriteStream } from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeVideo, concatVideos, safeExt } from './lib/media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 800);
const JOB_TTL_HOURS = Number(process.env.JOB_TTL_HOURS || 4);
const ROOT_WORK = path.join(__dirname, 'work');
const jobs = new Map();

await fs.mkdir(ROOT_WORK, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      if (!req.jobId) req.jobId = crypto.randomUUID();
      const dir = path.join(ROOT_WORK, req.jobId, 'uploads');
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${id}${safeExt(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 15 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Envie apenas arquivos de vídeo.'), ok);
  },
});

function publicJob(job) {
  return {
    id: job.id,
    state: job.state,
    stage: job.stage,
    progress: job.progress,
    total: job.total,
    current: job.current,
    message: job.message,
    createdAt: job.createdAt,
    downloadReady: job.state === 'done',
  };
}

function setJob(job, patch) {
  Object.assign(job, patch);
  jobs.set(job.id, job);
}

async function zipOutputs(jobDir, outputDir, zipPath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(outputDir, false);
    archive.finalize();
  });
}

async function processJob(job, files, quality) {
  const jobDir = path.join(ROOT_WORK, job.id);
  const normalizedDir = path.join(jobDir, 'normalized');
  const outputDir = path.join(jobDir, 'outputs');
  const listsDir = path.join(jobDir, 'lists');
  await Promise.all([
    fs.mkdir(normalizedDir, { recursive: true }),
    fs.mkdir(outputDir, { recursive: true }),
    fs.mkdir(listsDir, { recursive: true }),
  ]);

  try {
    setJob(job, { state: 'processing', stage: 'normalize', message: 'Preparando os vídeos em alta qualidade…', progress: 0 });

    const groups = { hooks: [], bodies: [], ctas: [] };
    const flat = [
      ...files.hooks.map((file, i) => ({ group: 'hooks', i, file })),
      ...files.bodies.map((file, i) => ({ group: 'bodies', i, file })),
      ...files.ctas.map((file, i) => ({ group: 'ctas', i, file })),
    ];

    for (let index = 0; index < flat.length; index += 1) {
      const item = flat[index];
      const prefix = item.group === 'hooks' ? 'G' : item.group === 'bodies' ? 'D' : 'C';
      const target = path.join(normalizedDir, `${prefix}${String(item.i + 1).padStart(2, '0')}.mp4`);
      setJob(job, {
        current: index + 1,
        total: flat.length,
        progress: Math.round(((index) / flat.length) * 30),
        message: `Otimizando ${prefix}${item.i + 1} sem reduzir para 720p…`,
      });
      await normalizeVideo(item.file.path, target, quality);
      groups[item.group].push(target);
    }

    const combinations = [];
    for (let h = 0; h < groups.hooks.length; h += 1) {
      for (let b = 0; b < groups.bodies.length; b += 1) {
        for (let c = 0; c < groups.ctas.length; c += 1) {
          combinations.push({ h, b, c });
        }
      }
    }

    setJob(job, {
      stage: 'combine',
      current: 0,
      total: combinations.length,
      progress: 30,
      message: `Gerando ${combinations.length} combinações…`,
    });

    for (let i = 0; i < combinations.length; i += 1) {
      const { h, b, c } = combinations[i];
      const name = `G${String(h + 1).padStart(2, '0')}_D${String(b + 1).padStart(2, '0')}_C${String(c + 1).padStart(2, '0')}.mp4`;
      const out = path.join(outputDir, name);
      const list = path.join(listsDir, `${i + 1}.txt`);
      setJob(job, {
        current: i + 1,
        total: combinations.length,
        progress: 30 + Math.round((i / combinations.length) * 60),
        message: `Montando ${name}…`,
      });
      await concatVideos([groups.hooks[h], groups.bodies[b], groups.ctas[c]], out, list);
    }

    setJob(job, { stage: 'zip', progress: 92, message: 'Compactando os vídeos para download…' });
    const zipPath = path.join(jobDir, `videos-${job.id}.zip`);
    await zipOutputs(jobDir, outputDir, zipPath);

    setJob(job, {
      state: 'done',
      stage: 'done',
      progress: 100,
      current: combinations.length,
      total: combinations.length,
      zipPath,
      message: `${combinations.length} vídeos prontos para baixar.`,
    });
  } catch (error) {
    console.error(error);
    setJob(job, {
      state: 'error',
      stage: 'error',
      message: error.message || 'Falha no processamento.',
    });
  }
}

app.post('/api/jobs', upload.fields([
  { name: 'hooks', maxCount: 5 },
  { name: 'bodies', maxCount: 5 },
  { name: 'ctas', maxCount: 5 },
]), async (req, res) => {
  try {
    const hooks = req.files?.hooks || [];
    const bodies = req.files?.bodies || [];
    const ctas = req.files?.ctas || [];

    if (!hooks.length || !bodies.length || !ctas.length) {
      return res.status(400).json({ error: 'Envie pelo menos 1 gancho, 1 desenvolvimento e 1 CTA.' });
    }

    const id = req.jobId || crypto.randomUUID();
    const quality = ['max', 'high', 'compact'].includes(req.body.quality) ? req.body.quality : 'high';
    const total = hooks.length * bodies.length * ctas.length;
    const job = {
      id,
      state: 'queued',
      stage: 'queued',
      progress: 0,
      current: 0,
      total,
      message: 'Na fila de processamento…',
      createdAt: new Date().toISOString(),
    };
    jobs.set(id, job);

    res.status(202).json({ job: publicJob(job) });
    processJob(job, { hooks, bodies, ctas }, quality);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Não foi possível iniciar o processamento.' });
  }
});

app.get('/api/jobs/:id/status', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Processamento não encontrado.' });
  res.json({ job: publicJob(job) });
});

app.get('/api/jobs/:id/download', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.state !== 'done' || !job.zipPath) {
    return res.status(404).json({ error: 'Arquivo ainda não está disponível.' });
  }
  res.download(job.zipPath, `video-multiplier-${job.id}.zip`);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'Video Multiplier AI' });
});

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

setInterval(async () => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    const ageHours = (now - new Date(job.createdAt).getTime()) / 36e5;
    if (ageHours > JOB_TTL_HOURS) {
      jobs.delete(id);
      await fs.rm(path.join(ROOT_WORK, id), { recursive: true, force: true }).catch(() => {});
    }
  }
}, 30 * 60 * 1000).unref();

app.use((error, req, res, next) => {
  console.error(error);
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Um dos vídeos excede o limite de ${MAX_UPLOAD_MB} MB.` });
  }
  res.status(500).json({ error: error.message || 'Erro interno.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Video Multiplier AI: http://localhost:${PORT}`);
});
