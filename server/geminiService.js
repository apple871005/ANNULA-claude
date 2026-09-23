// AI space-planning service.
//
// This is currently STUBBED — no real Gemini API calls are made yet, so it works without
// a GEMINI_API_KEY. The two functions below are the exact seams to fill in once a key is
// available; everything calling into this module (server/index.js) already expects their
// real return shape, so swapping the stub body for a real fetch() should not require
// touching index.html or plan.html.
'use strict';

const crypto = require('crypto');
const PRODUCTS = require('./products.json');

const LIGHT_KEYS = ['sun', 'semi', 'shade'];
const LIGHT_LABEL = { sun: '喜光耐曬型', semi: '明亮散光型', shade: '室內耐陰型' };

function seededRandom(seed) {
  // Small deterministic PRNG (mulberry32) so the same photo gives a stable-ish result
  // instead of a different plant list on every retry.
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashBufferToSeed(buffer) {
  const hash = crypto.createHash('sha256').update(buffer).digest();
  return hash.readUInt32BE(0);
}

/**
 * STUB: Analyze the uploaded photo and recommend plants from our catalog.
 *
 * TODO (when a real GEMINI_API_KEY is set): replace this body with a call to Gemini's
 * multimodal model, e.g.:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
 *   Authorization / key: process.env.GEMINI_API_KEY (server-side only — never send this to the browser)
 *   Body: { contents: [{ parts: [
 *     { inline_data: { mime_type, data: base64Image } },
 *     { text: `你是植栽規劃顧問。這是一張空間照片，我們的植栽目錄如下（JSON）：${JSON.stringify(PRODUCTS)}。
 *              請估計這個空間適合的光照類型（sun/semi/shade）、大約可容納的植栽數量與尺寸，
 *              並從目錄中選出 3-5 項最適合的商品，回傳 JSON：
 *              { light, summary, picks: [{ id, qty }] }` }
 *   ]}] }
 * Parse the model's JSON response and map `picks` back onto the full PRODUCTS entries
 * (look up by id) to build `recommendations` the same way the stub does below.
 *
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @returns {Promise<{mock:boolean, light:string, summary:string, recommendations:Array, total:number}>}
 */
async function analyzeSpace(imageBuffer, mimeType) {
  const seed = hashBufferToSeed(imageBuffer);
  const rand = seededRandom(seed);

  const light = LIGHT_KEYS[Math.floor(rand() * LIGHT_KEYS.length)];
  const matching = PRODUCTS.filter(
    (p) => p.light === light || (p.lightExtra && p.lightExtra.includes(light))
  );
  const pool = matching.length >= 3 ? matching : PRODUCTS;

  const shuffled = [...pool].sort(() => rand() - 0.5);
  const pickCount = 3 + Math.floor(rand() * 2); // 3-4 items
  const picks = shuffled.slice(0, pickCount).map((p) => ({
    ...p,
    qty: 1 + Math.floor(rand() * 2), // 1-2 each
  }));

  const recommendations = picks.map((p) => ({
    id: p.id,
    name: p.name,
    en: p.en,
    image: p.image,
    light: p.light,
    height: p.height,
    price: p.price,
    priceUnit: p.priceUnit,
    qty: p.qty,
    subtotal: p.price * p.qty,
  }));

  const total = recommendations.reduce((sum, r) => sum + r.subtotal, 0);

  return {
    mock: true,
    light,
    summary:
      `（此為模擬結果，尚未串接真實 AI 分析）根據照片初步判斷，這個空間較適合「${LIGHT_LABEL[light]}」的植栽組合。` +
      `以下是為您試算的建議搭配與每月訂閱報價，實際規劃仍需現場丈量與專人確認。`,
    recommendations,
    total,
    priceUnit: '月',
  };
}

/**
 * STUB: Generate a "what it could look like" mockup image with the recommended plants
 * composited into the uploaded photo.
 *
 * TODO (when a real GEMINI_API_KEY is set): replace this body with a call to Gemini's
 * image model (e.g. gemini-2.5-flash-image / "nano banana"), passing the original photo
 * plus a text prompt describing the chosen plants and asking for an edited image back,
 * e.g.:
 *   POST .../models/gemini-2.5-flash-image:generateContent
 *   Body: { contents: [{ parts: [
 *     { inline_data: { mime_type, data: base64Image } },
 *     { text: `請在這張照片中自然地加入以下植栽，維持原本的透視、光線與構圖：
 *              ${recommendations.map(r => `${r.name} x${r.qty}`).join('、')}` }
 *   ]}] }
 * The response contains inline image data (base64) — return that as `mockupImage` below
 * (data URL) instead of echoing the original photo, and set `isPlaceholderImage: false`.
 *
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {Array} recommendations
 * @returns {Promise<{mockupImage:string, isPlaceholderImage:boolean}>}
 */
async function generateMockupImage(imageBuffer, mimeType, recommendations) {
  // Stub: just echo the uploaded photo back so the UI has something to show in the
  // "mockup" slot. The frontend labels this clearly as a placeholder, not a real AI edit.
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  return {
    mockupImage: dataUrl,
    isPlaceholderImage: true,
  };
}

module.exports = { analyzeSpace, generateMockupImage };
