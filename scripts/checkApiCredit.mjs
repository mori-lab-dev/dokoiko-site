#!/usr/bin/env node
/**
 * checkApiCredit.mjs — Anthropic APIの残高が復活しているかを、最小のリクエストで確かめる。
 *
 * 前回の画像取得は credit balance is too low で止まった。
 * 123件を流し始めてから同じ理由で落ちると途中の成果が中途半端になるので、
 * 走らせる前にここで1回だけ叩いて判定する。
 */
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const env = fs.readFileSync('./.env', 'utf-8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) process.env[m[1]] = m[2].trim(); }
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

for (const model of ['claude-haiku-4-5', 'claude-sonnet-4-6']) {
  try {
    const r = await client.messages.create({
      model, max_tokens: 8, messages: [{ role: 'user', content: 'ok とだけ答えてください' }],
    });
    console.log(`✅ ${model}  ${r.content[0]?.text?.trim()}  (in ${r.usage.input_tokens} / out ${r.usage.output_tokens})`);
  } catch (e) {
    console.log(`❌ ${model}  ${e.status ?? ''} ${e.error?.error?.message ?? e.message}`);
    process.exitCode = 1;
  }
}
