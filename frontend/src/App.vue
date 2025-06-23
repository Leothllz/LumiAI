<template>
  <div class="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-6 transition-colors duration-300">
    <div class="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-4">
      <div class="flex justify-center items-center relative">
        <h1 class="text-2xl font-semibold text-center text-indigo-600 dark:text-indigo-400">Lumi</h1>
        <button @click="toggleDarkMode" class="ml-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400" aria-label="Changer de thème">
          <span v-if="isDarkMode">☀️</span>
          <span v-else>🌙</span>
        </button>
      </div>
      <div class="w-32 h-32 md:w-40 md:h-40 mx-auto flex items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <img :src="avatarGif" alt="Lumi Avatar" class="w-full h-full object-contain " />
      </div>
      <div ref="chatContainer" class="space-y-2 max-h-96 overflow-y-auto pr-2 relative" aria-live="polite">
        
        <div v-for="msg in messages.filter(m => m.role !== 'system')" :key="msg.id" :class="msg.role === 'user' ? 'text-right' : 'text-left'">
          <p 
            :class="[
              msg.role === 'user' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-700 dark:text-indigo-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
              msg.isError ? '!bg-red-100 !text-red-700 dark:!bg-red-700 dark:!text-red-100' : ''
            ]"
            class="inline-block px-3 py-2 rounded-lg text-sm max-w-[80%]"
          >
            {{ msg.content }}
          </p>
        </div>
        
        <div v-if="streaming" class="text-left">
          <p class="inline-block px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300">
            <span v-if="!currentReply" class="italic ">Lumi est en train d'écrire...</span>
            <span v-else>{{ currentReply }}</span>
            <!-- Simple pulsing dot animation for typing indicator -->
            <span v-if="!currentReply" class="inline-block ml-1 w-1 h-1 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse delay-75"></span><span v-if="!currentReply" class="inline-block ml-1 w-1 h-1 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse delay-150"></span><span v-if="!currentReply" class="inline-block ml-1 w-1 h-1 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse delay-300"></span>
          </p>
        </div>
      </div>
      <!-- Container for the GIF avatar -->
      
      <div class="flex gap-2">
        <textarea ref="inputField" v-model="input" @keydown.enter.prevent="askLumi" id="lumi-input" aria-label="Pose ta question à Lumi..." placeholder="Pose ta question à Lumi..." class="flex-grow resize-none rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400" />
        <button type="button" @click="askLumi" :disabled="isSending" class="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400">
          {{ isSending ? 'Envoi...' : 'Envoyer' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, watchEffect } from 'vue'

const input = ref('')
const currentReply = ref('')
const streaming = ref(false)
const isSending = ref(false) // To track the overall request state
const inputField = ref(null) // Ref for the textarea
const chatContainer = ref(null) // Assuming you added this ref for scrolling earlier
const isDarkMode = ref(false)

// Define URLs for your GIFs
const idleGifUrl = ref('/img/lumi-idle.gif') // Correct path for public assets
const speakingGifUrl = ref('/img/lumi-speaking.gif') // Correct path for public assets

const STREAM_END_TOKEN = '[END]';
const STREAM_ERROR_TOKEN = '[ERROR]';

const messages = ref([
  { id: 'system-init', role: 'system', content: 'Tu es Lumi, un assistant lumineux, calme, enthousiaste et pédagogue qui aide les citoyens de la communoté de E-LEC, un quartier écologique en énergie et quasi auto-sufisant. Qui répond de manière courte' }
])

// Dark Mode Logic
const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
};

onMounted(() => {
  try {
    const storedTheme = localStorage.getItem('lumi-theme');
    if (storedTheme) {
      isDarkMode.value = storedTheme === 'dark';
    } else {
      // Si aucun thème n'est sauvegardé, utilise la préférence système
      isDarkMode.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch (e) {
    console.error("Erreur lors de l'accès à localStorage pour lire le thème:", e);
    // En cas d'erreur avec localStorage, utilise la préférence système par défaut
    isDarkMode.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
});

watchEffect(() => {
  // Applique la classe dark/light au document
  document.documentElement.classList.toggle('dark', isDarkMode.value);
  // Sauvegarde la préférence dans localStorage
  try {
    localStorage.setItem('lumi-theme', isDarkMode.value ? 'dark' : 'light');
  } catch (e) {
    console.error("Erreur lors de la sauvegarde du thème dans localStorage:", e);
  }
});


// Computed property to determine which GIF to display
const avatarGif = computed(() => {
  // Show speaking GIF if either sending the request or actively streaming a reply
  return isSending.value || (streaming.value && currentReply.value) ? speakingGifUrl.value : idleGifUrl.value;
});

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

// --- Chat Logic ---
const askLumi = async () => {
  if (!input.value.trim() || isSending.value) return // Prevent sending if already sending or input is empty
  messages.value.push({ id: Date.now(), role: 'user', content: input.value }) // Added unique ID
  scrollToBottom()
  currentReply.value = ''
  isSending.value = true // Start overall sending state
  // streaming.value will be set to true once the first chunk arrives or handled by the stream logic

  // Conserver la valeur de l'input pour la vider seulement après la réponse ou en cas d'erreur
  const currentInput = input.value;
  input.value = ''; // Vider le champ de saisie immédiatement pour une meilleure UX
  inputField.value?.focus(); // Keep focus on input field

  const response = await fetch('/api/lumi-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.value })
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  try {
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Erreur inconnue du serveur.');
      console.error('API Error:', response.status, errorText);
      messages.value.push({ id: Date.now(), role: 'assistant', content: `Désolé, Lumi a rencontré un problème (erreur ${response.status}).`, isError: true });
      input.value = currentInput; // Restaurer l'input en cas d'erreur serveur
      return;
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (streaming.value && currentReply.value.trim()) { // S'il reste du texte non poussé par [END]
           messages.value.push({ id: Date.now(), role: 'assistant', content: currentReply.value });
        }
        break;
      }
      if (!streaming.value) streaming.value = true; // First chunk received, start streaming state for UI

      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6) // Plus efficace que .replace()
          if (data === STREAM_END_TOKEN) {
            messages.value.push({ id: Date.now(), role: 'assistant', content: currentReply.value })
            currentReply.value = ''; // Réinitialiser pour la prochaine réponse
            streaming.value = false; // End streaming state
            return; // Sortir de la fonction askLumi
          } else if (data === STREAM_ERROR_TOKEN) {
            messages.value.push({ id: Date.now(), role: 'assistant', content: 'Lumi a signalé une erreur dans sa réponse.', isError: true });
            input.value = currentInput; // Restaurer l'input
            streaming.value = false; // End streaming state
            return; // Sortir
          } else {
            currentReply.value += data
            scrollToBottom() // Défilement pendant la réception du flux
          }
        }
      }
    }
  } catch (error) {
    console.error('Fetch/Network Error:', error);
    messages.value.push({ id: Date.now(), role: 'assistant', content: 'Impossible de contacter Lumi. Veuillez vérifier votre connexion.', isError: true });
    input.value = currentInput; // Restaurer l'input en cas d'erreur réseau
  } finally {
    isSending.value = false // End overall sending state
    // streaming.value should be false here if stream ended properly or an error occurred.
    // If it's still true, it means the loop exited without [END] or [ERROR] and without 'done', which is unusual.
    scrollToBottom()
    inputField.value?.focus(); // Return focus to input field after completion/error
  }
}
</script>
