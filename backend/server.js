import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
});

app.post('/api/lumi-stream', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        res.write(`data: ${content}\n\n`);
      }
    }

    res.write('data: [END]\n\n');
    res.end();
  } catch (error) {
    console.error('Streaming error:', error);
    res.write('data: [ERROR]\n\n');
    const keepAlive = setInterval(() => res.write(':\n\n'), 15000); // commentaire ": " = ping SSE
    res.end();
  }
});
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});