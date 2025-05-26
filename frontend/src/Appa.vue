<template>
  <div>
    <h1>Lumi</h1>

    <div>
      <!-- Filtrer les messages système et appliquer des classes dynamiques -->
      <div v-for="(msg, index) in messages.filter(m => m.role !== 'system')" :key="index">
        <p>
          <span v-if="msg.role === 'user'">User: </span>
          <span v-else-if="msg.role === 'assistant'">Lumi: </span>
          {{ msg.content }}
        </p>
      </div>

      <!-- Affichage de la réponse en cours de streaming -->
      <div v-if="streaming && currentReply" class="streaming-message">
        <p>Lumi (en cours): {{ currentReply }}</p>
      </div>
    </div>

    <div>
      <textarea v-model="input" placeholder="Pose ta question..." rows="3"></textarea>
      <button @click="askLumi">Envoyer</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const input = ref('')
const currentReply = ref('')
const streaming = ref(false)

const STREAM_END_TOKEN = '[END]';
const STREAM_ERROR_TOKEN = '[ERROR]';

const messages = ref([
  { role: 'system', content: 'Tu es Lumi, un assistant lumineux, calme, enthousiaste et pédagogue qui aide les citoyens de la communoté de E-LEC, un quartier écologique en énergie et quasi auto-sufisant. Qui répond de manière courte' }
])

// --- Chat Logic ---
const askLumi = async () => {
  if (!input.value.trim()) return
  messages.value.push({ role: 'user', content: input.value })
  currentReply.value = ''
  streaming.value = true

  const currentInput = input.value;
  input.value = '';

  try {
    const response = await fetch('/api/lumi-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.value })
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Erreur inconnue du serveur.');
      console.error('API Error:', response.status, errorText);
      messages.value.push({ role: 'assistant', content: `Désolé, Lumi a rencontré un problème (erreur ${response.status}).` });
      input.value = currentInput;
      return;
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (streaming.value && currentReply.value.trim()) {
          messages.value.push({ role: 'assistant', content: currentReply.value });
        }
        break;
      }
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6)
          if (data === STREAM_END_TOKEN) {
            messages.value.push({ role: 'assistant', content: currentReply.value })
            currentReply.value = '';
            streaming.value = false;
            return;
          } else if (data === STREAM_ERROR_TOKEN) {
            messages.value.push({ role: 'assistant', content: 'Lumi a signalé une erreur dans sa réponse.' });
            input.value = currentInput;
            streaming.value = false;
            return;
          } else {
            currentReply.value += data
          }
        }
      }
    }
  } catch (error) {
    console.error('Fetch/Network Error:', error);
    messages.value.push({ role: 'assistant', content: 'Impossible de contacter Lumi. Veuillez vérifier votre connexion.' });
    input.value = currentInput;
  } finally {
    streaming.value = false
  }
}
</script>

<style scoped>
/* Basic styles to make it readable */
div {
  font-family: sans-serif;
  margin: 20px;
}

h1 {
  text-align: center;
  margin-bottom: 20px;
}

/* Main content container (wraps chat and input) */
/* This is the div that is the second child of the root div */
div > div:nth-of-type(2) {
  max-width: 500px; /* Ajuste cette valeur pour changer la largeur */
  height: auto;
  margin: 0 auto; /* Centre le bloc */
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background-color: #fff;
}

/* Chat container */
div > div:first-of-type {
  height: auto; /* Fixed height for basic scrolling */
  overflow-y: auto;
  margin-bottom: 10px;
}

/* Styling pour chaque message */
div > div:first-of-type > div { /* Cibler les conteneurs de message */
  margin-bottom: 8px; /* Espacement entre les messages */
  padding: 8px;
  border-radius: 4px;
  background-color: #f9f9f9; /* Un seul fond gris très clair pour tous les messages */
}

div > div:first-of-type > div p { /* Cibler les paragraphes de message */
  margin: 0; /* Retirer la marge par défaut des paragraphes */
  word-wrap: break-word; /* S'assurer que les longs mots ne débordent pas */
}

/* Style pour la réponse de Lumi en cours de streaming */
div[v-if="streaming && currentReply"] p {
  background-color: #f9f9f9; /* Même fond que les autres messages */
  padding: 5px;
  border-radius: 5px;
  margin-bottom: 8px; /* Espacement comme les autres messages */
  font-style: italic; /* Optionnel: pour indiquer que c'est en cours */
}

/* Input area */
/* This is the div that is the last child of the main content container */
div > div:last-of-type {
  display: flex;
  gap: 10px;
}

textarea {
  flex-grow: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 5px;
  resize: none; /* Prevent manual resize */
}

button {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}
</style>
```