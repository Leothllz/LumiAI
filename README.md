# Lumi Assistant

This repository contains a small Vue/Express demo for the **Lumi** knowledge assistant.  
A minimal Node.js RAG script (`lumi_rag.js`) is also provided for quick experiments with OpenAI or DeepSeek.

## Setup

### Backend

```bash
cd backend
npm install
npm run dev        # start Express server (PORT env variable optional)
```
The backend now includes the RAG pipeline. It builds an index from the
`data/` directory (if missing) and uses it for every request.
You can configure providers and models via environment variables:

```bash
export EMBED_PROVIDER=openai       # or deepseek
export CHAT_PROVIDER=deepseek      # or openai
export EMBED_MODEL=text-embedding-3-small
export CHAT_MODEL=deepseek-chat    # default depends on provider
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Node.js RAG script

```bash
npm install       # installs dependencies defined in `package.json`
# Build index then chat (OpenAI embeddings, DeepSeek chat)
node lumi_rag.js --reindex --embedProvider openai --chatProvider deepseek
```

API keys should be exported as environment variables:

```bash
export OPENAI_API_KEY="sk-..."      # if using OpenAI
export DEEPSEEK_API_KEY="dpk-..."   # if using DeepSeek
```

Data files (`.txt`/`.md`) go into a `data/` directory.

