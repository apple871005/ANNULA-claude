'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { analyzeSpace, generateMockupImage } = require('./geminiService');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('只接受圖片檔案'));
    }
    cb(null, true);
  },
});

app.use(cors());

// Serve the existing static site (index.html, faq.html, projects.html, plan.html, assets...)
// so the whole thing can be previewed from one local server during prototyping.
const SITE_ROOT = path.join(__dirname, '..');
app.use(express.static(SITE_ROOT));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
});

app.post('/api/plan', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請上傳一張照片' });
  }
  try {
    const analysis = await analyzeSpace(req.file.buffer, req.file.mimetype);
    const mockup = await generateMockupImage(req.file.buffer, req.file.mimetype, analysis.recommendations);
    res.json({ ...analysis, ...mockup });
  } catch (err) {
    console.error('[/api/plan] failed:', err);
    res.status(500).json({ error: '分析失敗，請稍後再試' });
  }
});

// Multer errors (bad file type, too large) land here instead of the generic 500 handler.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === '只接受圖片檔案') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ANNULA AI planner prototype running at http://localhost:${PORT}`);
  console.log(`  -> try it at http://localhost:${PORT}/plan.html`);
  console.log(
    process.env.GEMINI_API_KEY
      ? '  -> GEMINI_API_KEY detected (still using stubbed logic until geminiService.js is wired up)'
      : '  -> no GEMINI_API_KEY set — running fully on mock data, that is expected for now'
  );
});
