import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeClient, ensureIndex, retrieve, loadDocuments } from './rag.js'; // Ajout de l'import manquant

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const INDEX_FILE = process.env.INDEX_FILE || path.join(__dirname, 'test-index.json');
const EMBED_PROVIDER = process.env.EMBED_PROVIDER || 'google';
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-004';

async function testRAG() {
  try {
    console.log('🚀 Test du système RAG');
    console.log(`📁 Dossier de données: ${DATA_DIR}`);
    console.log(`🔧 Provider: ${EMBED_PROVIDER}`);
    console.log(`🤖 Modèle: ${EMBED_MODEL}`);
    
    // Test de chargement des documents
    const docs = await loadDocuments(DATA_DIR);
    console.log(`✅ Documents chargés: ${docs.length}`);
    
    if (docs.length === 0) {
      console.log('❌ Aucun document trouvé! Vérifiez le dossier data/');
      return;
    }
    
    // Afficher un aperçu des documents
    docs.forEach((doc, i) => {
      console.log(`📄 Document ${i+1}: ${doc.id}`);
      console.log(`   Longueur: ${doc.text.length} caractères`);
      console.log(`   Aperçu: ${doc.text.substring(0, 200)}...`);
    });
    
    // Test de création d'index
    const client = makeClient(EMBED_PROVIDER);
    const index = await ensureIndex({ 
      dataDir: DATA_DIR, 
      indexFile: INDEX_FILE, 
      client, 
      embedModel: EMBED_MODEL,
      provider: EMBED_PROVIDER 
    });
    
    console.log(`✅ Index créé/chargé avec ${index.embeddings.length} embeddings`);
    
    // Test de recherche
    const testQueries = [
      'énergie solaire',
      'efficacité énergétique',
      'consommation électrique',
      'panneaux photovoltaïques'
    ];
    
    for (const query of testQueries) {
      console.log(`\n🔍 Test de recherche: "${query}"`);
      const results = await retrieve(query, index, client, EMBED_MODEL, EMBED_PROVIDER, 3);
      
      if (results.length > 0) {
        console.log(`✅ ${results.length} résultats trouvés`);
      } else {
        console.log('❌ Aucun résultat trouvé');
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

testRAG();