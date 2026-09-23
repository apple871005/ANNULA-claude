// AI space-planning service — real Gemini integration.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const PRODUCTS = require('./products.json');

const LIGHT_KEYS = ['sun', 'semi', 'shade'];
const LIGHT_LABEL = { sun: '喜光耐曬型', semi: '明亮散光型', shade: '室內耐陰型' };
const PRODUCTS_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Confirmed working against this project's key at build time (2026-09-23) --
// "gemini-2.5-flash" / "gemini-flash-latest" were unavailable/overloaded for this key.
// If Google retires this model name later, swap it here (and only here).
const ANALYZE_MODEL = process.env.GEMINI_ANALYZE_MODEL || 'gemini-3.5-flash';

const CUTOUT_DIR = path.join(__dirname, 'assets', 'plant-cutouts');

function seededRandom(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function hashBufferToSeed(buffer) {
  return crypto.createHash('sha256').update(buffer).digest().readUInt32BE(0);
}

async function callGemini(model, parts, generationConfig) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY 未設定');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], ...(generationConfig ? { generationConfig } : {}) }),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error && json.error.message ? json.error.message : `Gemini API 錯誤 (${res.status})`);
    err.status = res.status;
    err.geminiStatus = json.error && json.error.status;
    throw err;
  }
  const candidate = json.candidates && json.candidates[0];
  if (!candidate) {
    const err = new Error('Gemini 未回傳結果（可能被安全性過濾）');
    err.code = 'NO_CANDIDATE';
    err.promptFeedback = json.promptFeedback;
    throw err;
  }
  return candidate;
}

function buildFallbackRecommendations(seedBuffer) {
  // Safety net: used only if Gemini's picks don't map onto any real catalog items
  // (e.g. it invented ids, or returned too few). Keeps the UI from showing an empty result.
  const rand = seededRandom(hashBufferToSeed(seedBuffer));
  const light = LIGHT_KEYS[Math.floor(rand() * LIGHT_KEYS.length)];
  const matching = PRODUCTS.filter((p) => p.light === light || (p.lightExtra && p.lightExtra.includes(light)));
  const pool = matching.length >= 3 ? matching : PRODUCTS;
  const shuffled = [...pool].sort(() => rand() - 0.5);
  return {
    light,
    picks: shuffled.slice(0, 3).map((p) => ({ id: p.id, qty: 1 + Math.floor(rand() * 2) })),
  };
}

function buildRecommendations(picks) {
  const seen = new Set();
  const recommendations = [];
  for (const pick of picks || []) {
    const product = PRODUCTS_BY_ID[pick.id];
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    const qty = Math.max(1, Math.min(5, Math.round(Number(pick.qty) || 1)));
    recommendations.push({
      id: product.id,
      name: product.name,
      en: product.en,
      image: product.image,
      light: product.light,
      height: product.height,
      price: product.price,
      priceUnit: product.priceUnit,
      qty,
      subtotal: product.price * qty,
    });
  }
  return recommendations;
}

/**
 * Analyze the uploaded photo with Gemini and recommend plants from our catalog.
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 */
async function analyzeSpace(imageBuffer, mimeType) {
  const catalogForPrompt = PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    light: p.light,
    lightExtra: p.lightExtra || [],
    height: p.height,
    price: p.price,
  }));

  const prompt =
    `你是植栽空間規劃顧問。這是一張使用者上傳的空間照片（例如陽台、辦公室或居家一角）。\n` +
    `我們的植栽租賃目錄如下（JSON，light 欄位為 sun=喜光耐曬型 / semi=明亮散光型 / shade=室內耐陰型）：\n` +
    `${JSON.stringify(catalogForPrompt)}\n\n` +
    `請根據照片判斷這個空間大致的採光類型，並從上面目錄中選出 3-5 項最適合這個空間的植栽（必須使用目錄中既有的 id，不可自創），` +
    `並估計每項合理的數量。請只回傳以下 JSON 格式，不要有其他文字：\n` +
    `{"light": "sun|semi|shade", "summary": "一段繁體中文說明，約60-100字，說明這個空間的特性與建議理由", "picks": [{"id": "目錄中的id", "qty": 數量}]}`;

  let light = 'semi';
  let summary = '';
  let recommendations = [];

  try {
    const candidate = await callGemini(
      ANALYZE_MODEL,
      [{ inline_data: { mime_type: mimeType, data: imageBuffer.toString('base64') } }, { text: prompt }],
      { responseMimeType: 'application/json' }
    );
    const text = (candidate.content.parts || []).map((p) => p.text || '').join('');
    const parsed = JSON.parse(text);

    if (LIGHT_KEYS.includes(parsed.light)) light = parsed.light;
    if (typeof parsed.summary === 'string' && parsed.summary.trim()) summary = parsed.summary.trim();
    recommendations = buildRecommendations(parsed.picks);
  } catch (err) {
    console.error('[analyzeSpace] Gemini call failed, falling back to catalog-based pick:', err.message);
  }

  if (recommendations.length === 0) {
    const fallback = buildFallbackRecommendations(imageBuffer);
    light = fallback.light;
    recommendations = buildRecommendations(fallback.picks);
    if (!summary) {
      summary = `根據照片初步判斷，這個空間較適合「${LIGHT_LABEL[light]}」的植栽組合。以下是為您試算的建議搭配與每月訂閱報價，實際規劃仍需現場丈量與專人確認。`;
    }
  }

  const total = recommendations.reduce((sum, r) => sum + r.subtotal, 0);

  return {
    mock: false,
    light,
    summary,
    recommendations,
    total,
    priceUnit: '月',
  };
}

/**
 * Generate a "what it could look like" mockup image by compositing pre-cut, transparent
 * PNGs of the recommended plants (background-removed from our own catalog photos, see
 * server/assets/plant-cutouts/ and the generation script noted in server/README.md) onto
 * the uploaded photo.
 *
 * This intentionally does NOT call an external image-generation API: Gemini's image
 * models need a billing-enabled Google AI Studio project (confirmed via live testing --
 * the free tier has a hard 0 quota for them), and paid alternatives (Stability AI,
 * Fal.ai, ...) all need a new account + key too. Local compositing needs neither, is
 * free forever, and never rate-limits. It's a rough "collage" placement, not a
 * perspective-matched AI edit -- the frontend badge says so explicitly.
 *
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {Array} recommendations
 * @returns {Promise<{mockupImage:string, isPlaceholderImage:boolean, mockupMethod:string, mockupError?:string}>}
 */
async function generateMockupImage(imageBuffer, mimeType, recommendations) {
  try {
    const seed = hashBufferToSeed(imageBuffer);
    const rand = seededRandom(seed);

    const base = sharp(imageBuffer).rotate(); // auto-orient using EXIF before we read pixel dimensions
    const meta = await base.metadata();
    const W = meta.width;
    const H = meta.height;
    if (!W || !H) throw new Error('無法讀取照片尺寸');

    const items = (recommendations || [])
      .filter((r) => fs.existsSync(path.join(CUTOUT_DIR, `${r.id}.png`)))
      .slice(0, 4);

    if (items.length === 0) {
      return {
        mockupImage: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
        isPlaceholderImage: true,
        mockupMethod: 'original',
        mockupError: '沒有可用的植栽合成素材，顯示原始照片。',
      };
    }

    const margin = W * 0.05;
    const usableWidth = W - margin * 2;
    const slotWidth = usableWidth / items.length;

    const layers = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const cutoutPath = path.join(CUTOUT_DIR, `${item.id}.png`);
      const cutoutMeta = await sharp(cutoutPath).metadata();
      const aspect = cutoutMeta.width / cutoutMeta.height;

      // vary height a bit per slot (and with the photo's own seed) for a less mechanical layout
      const heightFrac = 0.3 + ((i % 3) * 0.045) + (rand() - 0.5) * 0.03;
      let targetH = Math.round(H * heightFrac);
      let targetW = Math.round(targetH * aspect);
      if (targetW > slotWidth * 0.92) {
        targetW = Math.round(slotWidth * 0.92);
        targetH = Math.round(targetW / aspect);
      }
      if (targetW < 1 || targetH < 1) continue;

      const resized = await sharp(cutoutPath).resize(targetW, targetH).toBuffer();
      const jitter = (rand() - 0.5) * slotWidth * 0.15;
      const slotCenterX = margin + slotWidth * (i + 0.5) + jitter;
      const left = Math.round(Math.max(0, Math.min(slotCenterX - targetW / 2, W - targetW)));
      const top = Math.round(Math.max(0, H * 0.95 - targetH));

      layers.push({ input: resized, left, top });
    }

    const outputBuffer = await base.composite(layers).jpeg({ quality: 88 }).toBuffer();

    return {
      mockupImage: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
      isPlaceholderImage: false,
      mockupMethod: 'composite',
    };
  } catch (err) {
    console.error('[generateMockupImage] local compositing failed, falling back to original photo:', err.message);
    return {
      mockupImage: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
      isPlaceholderImage: true,
      mockupMethod: 'original',
      mockupError: '植栽合成暫時無法使用，顯示原始照片。',
    };
  }
}

module.exports = { analyzeSpace, generateMockupImage };
