#!/usr/bin/env node

/**
 * Quick Start Script for Chrome MCP Server
 *
 * This script helps you set up and start the server quickly without database.
 *
 * Usage:
 *   node scripts/quick-start.js
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const envFile = join(rootDir, '.env');

console.log('🚀 Chrome MCP Server - Quick Start');
console.log('==================================\n');

async function checkEnv() {
  try {
    await access(envFile);
    console.log('✅ .env file found\n');
    return true;
  } catch {
    console.log('⚠️  .env file not found\n');
    return false;
  }
}

async function createEnv() {
  const exampleEnv = join(rootDir, '.env.example');
  try {
    const content = await readFile(exampleEnv, 'utf-8');
    await writeFile(envFile, content);
    console.log('✅ Created .env file from .env.example\n');
    console.log('📝 Please edit .env and set your OPENAI_API_KEY\n');
  } catch {
    console.log('❌ Could not create .env file\n');
  }
}

function startServer() {
  console.log('🔄 Starting server...\n');

  const child = spawn('npm', ['run', 'dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (err) => {
    console.error('❌ Failed to start server:', err.message);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.log(`Server exited with code ${code}`);
    }
  });
}

async function main() {
  const hasEnv = await checkEnv();

  if (!hasEnv) {
    await createEnv();
    console.log('Next steps:');
    console.log('1. Edit .env file and set your OPENAI_API_KEY');
    console.log('2. Run: npm run dev\n');
    return;
  }

  // Check if OPENAI_API_KEY is set
  const envContent = await readFile(envFile, 'utf-8');
  const apiKeyMatch = envContent.match(/OPENAI_API_KEY\s*=\s*["']?([^"'\n]+)/);

  if (!apiKeyMatch || apiKeyMatch[1].includes('your-api-key')) {
    console.log('⚠️  OPENAI_API_KEY is not configured\n');
    console.log('Please edit .env and set your API key, then run this script again.\n');
    return;
  }

  console.log('✅ OPENAI_API_KEY is configured\n');
  startServer();
}

main().catch(console.error);
