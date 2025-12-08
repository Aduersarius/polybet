#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Start Next.js development server
console.log('🚀 Starting Next.js development server...');
const nextProcess = spawn('npx', ['next', 'dev', '--turbo'], {
    stdio: 'inherit',
    cwd: process.cwd()
});

// Function to handle cleanup
function cleanup() {
    console.log('\n🛑 Shutting down dev server...');
    if (nextProcess && !nextProcess.killed) {
        nextProcess.kill('SIGTERM');
    }
    process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

nextProcess.on('close', (code) => {
    console.log(`Next.js process exited with code ${code}`);
    cleanup();
});

// Keep the script running
console.log('✅ Hybrid platform startup script running...');