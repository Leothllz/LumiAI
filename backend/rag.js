import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Alternative simple sans tiktoken pour le chunking
function simpleChunkText(text, maxChars = 1500, overlap = 200) {
  const chunks = [];
  for (let start = 0; start < text.length; start += maxChars - overlap) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
  }
  return chunks;
}

export function makeClient(provider) {
  provider = provider.toLowerCase();
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY n\'est pas défini');
    return new OpenAI({ apiKey: key });
  }
  if (provider === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY n\'est pas défini');
    return new OpenAI({ apiKey: key, baseURL: 'https://api.openrouter.ai/v1' });
  }
  if (provider === 'deepseek') {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DEEPSEEK_API_KEY n\'est pas défini');
    return new OpenAI({ apiKey: key, baseURL: 'https://api.deepseek.com' });
  }
  if (provider === 'google') {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error('GOOGLE_API_KEY n\'est pas défini');
    return new GoogleGenerativeAI(key);
  }
  throw new Error("provider doit être 'openai', 'deepseek','openrouter', ou 'google'");
}

// Utiliser le chunking simple sans tiktoken
export function chunkText(text, maxChars = 1500, overlap = 200) {
  return simpleChunkText(text, maxChars, overlap);
}

export async function loadDocuments(dataDir) {
  console.log(`📁 Recherche de documents dans: ${dataDir}`);
  const patterns = ['**/*.txt', '**/*.md'];
  const files = await glob(patterns, { cwd: dataDir, absolute: true });
  console.log(`📄 Fichiers trouvés: ${files.length}`);
  files.forEach(f => console.log(`  - ${f}`));
  return files.map((f) => ({ id: f, text: fs.readFileSync(f, 'utf8') }));
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, aMag = 0, bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] ** 2;
    bMag += b[i] ** 2;
  }
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

async function createEmbeddings(client, provider, embedModel, texts) {
  if (provider === 'google') {
    const model = client.getGenerativeModel({ model: embedModel });
    const embeddings = [];
    
    // Google API traite un texte à la fois avec des délais
    for (let i = 0; i < texts.length; i++) {
      let text = texts[i];
      
      // S'assurer que text est une chaîne
      if (typeof text !== 'string') {
        console.log(`⚠️  Texte non-string détecté à l'index ${i}:`, typeof text);
        text = String(text);
      }
      
      // Vérifier la taille du texte (limite ~1000 caractères pour être sûr)
      if (text.length > 1000) {
        console.log(`⚠️  Texte trop long (${text.length} chars), truncation...`);
        text = text.substring(0, 1000);
      }
      
      // Éviter les textes vides
      if (!text.trim()) {
        console.log(`⚠️  Texte vide à l'index ${i}, skip...`);
        embeddings.push(new Array(768).fill(0));
        continue;
      }
      
      try {
        console.log(`📊 Traitement embedding ${i+1}/${texts.length}: "${text.substring(0, 50)}..."`);
        const result = await model.embedContent(text);
        embeddings.push(result.embedding.values);
        
        // Délai pour éviter les limites de taux
        if (i < texts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`❌ Erreur embedding pour texte ${i+1}:`, error.message);
        // Utiliser un embedding vide en cas d'erreur
        embeddings.push(new Array(768).fill(0));
      }
    }
    return embeddings;
  } else {
    // OpenAI format
    const resp = await client.embeddings.create({ model: embedModel, input: texts });
    return resp.data.map(d => d.embedding);
  }
}

export async function buildIndex(docs, client, embedModel, indexFile, provider = 'openai') {
  console.log(`🔧 Construction de l'index avec ${docs.length} documents`);
  const texts = [];
  const metas = [];
  
  docs.forEach((doc) => {
    const chunks = chunkText(doc.text);
    console.log(`📝 Document ${doc.id}: ${chunks.length} chunks créés`);
    chunks.forEach((chunk) => {
      if (chunk.trim()) { // Éviter les chunks vides
        metas.push({ doc_id: doc.id, text: chunk });
        texts.push(chunk);
      }
    });
  });

  console.log(`📝 Total de chunks créés: ${texts.length}`);
  
  if (texts.length === 0) {
    throw new Error('Aucun chunk de texte créé. Vérifiez vos documents.');
  }
  
  const embeddings = [];
  
  // Pour Google, traiter chunk par chunk, pour OpenAI par batch
  if (provider === 'google') {
    console.log('🤖 Utilisation de Google Generative AI (traitement séquentiel)');
    const batchEmbeddings = await createEmbeddings(client, provider, embedModel, texts);
    embeddings.push(...batchEmbeddings);
  } else {
    const batchSize = 96;
    for (let i = 0; i < texts.length; i += batchSize) {
      const sub = texts.slice(i, i + batchSize);
      console.log(`⚡ Génération d'embeddings pour batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)}`);
      const batchEmbeddings = await createEmbeddings(client, provider, embedModel, sub);
      embeddings.push(...batchEmbeddings);
    }
  }

  console.log(`💾 Sauvegarde de l'index: ${indexFile}`);
  fs.writeFileSync(indexFile, JSON.stringify({ embeddings, metas }));
  console.log(`✅ Index créé avec ${embeddings.length} embeddings`);
}

export function loadIndex(indexFile) {
  if (!fs.existsSync(indexFile)) throw new Error(`Index ${indexFile} introuvable`);
  return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
}

export async function ensureIndex({ dataDir, indexFile, client, embedModel, provider = 'openai' }) {
  if (!fs.existsSync(indexFile)) {
    const docs = await loadDocuments(dataDir);
    if (docs.length === 0) {
      throw new Error(`Aucun document trouvé dans ${dataDir}`);
    }
    await buildIndex(docs, client, embedModel, indexFile, provider);
  }
  return loadIndex(indexFile);
}

export async function retrieve(query, index, client, embedModel, provider = 'openai', topK = 6) {
  console.log(`🔍 Recherche pour: "${query}"`);
  let queryEmbedding;
  
  if (provider === 'google') {
    const model = client.getGenerativeModel({ model: embedModel });
    const result = await model.embedContent(query);
    queryEmbedding = result.embedding.values;
  } else {
    const resp = await client.embeddings.create({ model: embedModel, input: [query] });
    queryEmbedding = resp.data[0].embedding;
  }
  
  const scored = index.embeddings.map((emb, i) => ({ 
    score: cosineSimilarity(queryEmbedding, emb), 
    meta: index.metas[i] 
  }));
  const results = scored.sort((a, b) => b.score - a.score).slice(0, topK);
  
  console.log(`📊 Top ${topK} résultats:`);
  results.forEach((r, i) => {
    console.log(`  ${i+1}. Score: ${r.score.toFixed(4)} | Texte: ${r.meta.text.substring(0, 100)}...`);
  });
  
  return results;
}