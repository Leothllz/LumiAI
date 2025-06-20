#!/usr/bin/env node
/**
 * LUMI Knowledge Assistant (Node.js)
 * ---------------------------------
 * RAG pipeline minimaliste compatible OpenAI **et** DeepSeek.
 *
 * Fonctionnalités :
 * 1. Ingestion des fichiers *.txt* / *.md* dans un dossier "data/".
 * 2. Découpage en chunks (~750 tokens, chevauchement 100) avec @dqbd/tiktoken.
 * 3. Génération d'embeddings (OpenAI ou DeepSeek) puis stockage dans un petit
 *    fichier JSON (`index.json`). Aucune dépendance native lourde : la similarité
 *    cosinus est calculée en mémoire ⇒ suffisant pour des bases < 5‐10k chunks.
 * 4. Chat RAG : recherche des `top‑k` passages, construction d'un prompt strict,
 *    appel au modèle chat choisi, réponse avec citations.
 *
 * Installation rapide :
 *   npm install openai @dqbd/tiktoken fast-glob yargs
 *
 * Variables d'environnement :
 *   export OPENAI_API_KEY="sk-..."    # pour OpenAI
 *   export DEEPSEEK_API_KEY="dpk-..."  # pour DeepSeek
 *
 * Exemples :
 *   # Build index puis discussion (embeddings OpenAI, chat DeepSeek)
 *   node lumi_rag.js --reindex \
 *        --embedProvider openai \
 *        --chatProvider deepseek
 *
 *   # Simple chat si l'index existe déjà
 *   node lumi_rag.js
 */

import fs from "fs";
import glob from "fast-glob";
import readline from "readline";
import { getEncoding } from "@dqbd/tiktoken";
import OpenAI from "openai";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

/* ------------------------------------------------------------------------- */
/*  Helpers                                                                  */
/* ------------------------------------------------------------------------- */
const enc = getEncoding("cl100k_base");

function makeClient(provider) {
  provider = provider.toLowerCase();
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY n'est pas défini");
    return new OpenAI({ apiKey: key });
  }
  if (provider === "deepseek") {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error("DEEPSEEK_API_KEY n'est pas défini");
    // DeepSeek est compatible avec le SDK OpenAI ; on change simplement l'URL.
    return new OpenAI({ apiKey: key, baseURL: "https://api.deepseek.com" });
  }
  throw new Error("provider doit être 'openai' ou 'deepseek'");
}

function chunkText(text, maxTokens = 750, overlap = 100) {
  const tokens = enc.encode(text);
  const chunks = [];
  for (let start = 0; start < tokens.length; start += maxTokens - overlap) {
    const end = Math.min(start + maxTokens, tokens.length);
    chunks.push(enc.decode(tokens.slice(start, end)));
  }
  return chunks;
}

async function loadDocuments(dataDir) {
  const patterns = ["**/*.txt", "**/*.md"];
  const files = await glob(patterns, { cwd: dataDir, absolute: true });
  if (!files.length) console.error("[WARN] Aucun fichier texte trouvé dans", dataDir);
  return files.map((file) => ({ id: file, text: fs.readFileSync(file, "utf8") }));
}

function cosineSimilarity(a, b) {
  let dot = 0,
    aMag = 0,
    bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] ** 2;
    bMag += b[i] ** 2;
  }
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

async function buildIndex(docs, client, embedModel, indexFile) {
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
  console.log("[OK] Index sauvegardé dans", indexFile);
}

function loadIndex(indexFile) {
  if (!fs.existsSync(indexFile)) throw new Error(`Index ${indexFile} introuvable. Exécute --reindex.`);
  return JSON.parse(fs.readFileSync(indexFile, "utf8"));
}

async function retrieve(query, index, client, embedModel, topK = 6) {
  const qEmb = (
    await client.embeddings.create({ model: embedModel, input: [query] })
  ).data[0].embedding;
  const scored = index.embeddings.map((emb, i) => ({ score: cosineSimilarity(qEmb, emb), meta: index.metas[i] }));
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

async function chat(query, index, clientChat, clientEmbed, embedModel, chatModel, topK = 6) {
  const retrieved = await retrieve(query, index, clientEmbed, embedModel, topK);
  const context = retrieved.map((r, i) => `Source ${i + 1}:\n${r.meta.text}`).join("\n\n");
  const systemPrompt =
    "Tu es LUMI, IA experte et bienveillante spécialisée dans l'\u00e9nergie. " +
    "Réponds UNIQUEMENT à partir des informations ci-dessous. Si la réponse n'y figure pas, " +
    "réponds : « Je ne dispose pas de cette information dans ma base ». " +
    "Réponses concises (\u2264200 mots) en français, cite la source [Source N] quand pertinent.\n\n" +
    context;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Question : ${query}` },
  ];

  const resp = await clientChat.chat.completions.create({ model: chatModel, messages });
  return resp.choices[0].message.content.trim();
}

/* ------------------------------------------------------------------------- */
/*  CLI                                                                     */
/* ------------------------------------------------------------------------- */
const argv = yargs(hideBin(process.argv))
  .option("dataDir", { default: "data", type: "string" })
  .option("indexFile", { default: "index.json", type: "string" })
  .option("reindex", { type: "boolean" })
  .option("embedProvider", { default: "openai", choices: ["openai", "deepseek"] })
  .option("chatProvider", { default: "openai", choices: ["openai", "deepseek"] })
  .option("embedModel", { default: "text-embedding-3-small", type: "string" })
  .option("chatModel", { type: "string" })
  .help()
  .argv;

const clientEmbed = makeClient(argv.embedProvider);
const clientChat = makeClient(argv.chatProvider);
const chatModelName = argv.chatModel || (argv.chatProvider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");

(async () => {
  if (argv.reindex || !fs.existsSync(argv.indexFile)) {
    const docs = await loadDocuments(argv.dataDir);
    await buildIndex(docs, clientEmbed, argv.embedModel, argv.indexFile);
  }

  const index = loadIndex(argv.indexFile);

  console.log("\u001b[36mLUMI est prête. Pose-moi tes questions ! (exit pour quitter)\u001b[0m");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "[Vous] > " });
  rl.prompt();
  for await (const line of rl) {
    const q = line.trim();
    if (["exit", "quit", "q"].includes(q.toLowerCase())) break;
    try {
      const answer = await chat(q, index, clientChat, clientEmbed, argv.embedModel, chatModelName);
      console.log(answer);
    } catch (err) {
      console.error("[ERR]", err.message);
    }
    rl.prompt();
  }
  rl.close();
})();
