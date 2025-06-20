import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';
import { getEncoding } from '@dqbd/tiktoken';
import OpenAI from 'openai';

const enc = getEncoding('cl100k_base');

export function makeClient(provider) {
  provider = provider.toLowerCase();
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY n\'est pas défini');
    return new OpenAI({ apiKey: key });
  }
  if (provider === 'deepseek') {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DEEPSEEK_API_KEY n\'est pas défini');
    return new OpenAI({ apiKey: key, baseURL: 'https://api.deepseek.com' });
  }
  throw new Error("provider doit être 'openai' ou 'deepseek'");
}

export function chunkText(text, maxTokens = 750, overlap = 100) {
  const tokens = enc.encode(text);
  const chunks = [];
  for (let start = 0; start < tokens.length; start += maxTokens - overlap) {
    const end = Math.min(start + maxTokens, tokens.length);
    chunks.push(enc.decode(tokens.slice(start, end)));
  }
  return chunks;
}

export async function loadDocuments(dataDir) {
  const patterns = ['**/*.txt', '**/*.md'];
  const files = await glob(patterns, { cwd: dataDir, absolute: true });
  return files.map((f) => ({ id: f, text: fs.readFileSync(f, 'utf8') }));
}

function cosineSimilarity(a, b) {
  let dot = 0, aMag = 0, bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] ** 2;
    bMag += b[i] ** 2;
  }
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

export async function buildIndex(docs, client, embedModel, indexFile) {
  const texts = [];
  const metas = [];
  docs.forEach((doc) => {
    chunkText(doc.text).forEach((chunk) => {
      metas.push({ doc_id: doc.id, text: chunk });
      texts.push(chunk);
    });
  });

  const embeddings = [];
  const batchSize = 96;
  for (let i = 0; i < texts.length; i += batchSize) {
    const sub = texts.slice(i, i + batchSize);
    const resp = await client.embeddings.create({ model: embedModel, input: sub });
    resp.data.forEach((d) => embeddings.push(d.embedding));
  }

  fs.writeFileSync(indexFile, JSON.stringify({ embeddings, metas }));
}

export function loadIndex(indexFile) {
  if (!fs.existsSync(indexFile)) throw new Error(`Index ${indexFile} introuvable`);
  return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
}

export async function ensureIndex({ dataDir, indexFile, client, embedModel }) {
  if (!fs.existsSync(indexFile)) {
    const docs = await loadDocuments(dataDir);
    await buildIndex(docs, client, embedModel, indexFile);
  }
  return loadIndex(indexFile);
}

export async function retrieve(query, index, client, embedModel, topK = 6) {
  const qEmb = (await client.embeddings.create({ model: embedModel, input: [query] })).data[0].embedding;
  const scored = index.embeddings.map((emb, i) => ({ score: cosineSimilarity(qEmb, emb), meta: index.metas[i] }));
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
