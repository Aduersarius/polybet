#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Start Next.js development server
console.log('🚀 Starting Next.js development server...');
const nextProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    cwd: process.cwd()
});

// Function to handle cleanup
function cleanup() {
    console.log('\n🛑 Shutting down servers...');
    nextProcess.kill('SIGTERM');
    process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

nextProcess.on('close', (code) => {
    console.log(`Next.js process exited with code ${code}`);
    process.exit(code);
});

// Keep the script running
console.log('✅ Hybrid platform startup script running...');
console.log('📝 Note: WebSocket server will be started separately on port 3001');
console.log('🌐 Next.js app will be available at http://localhost:3000');
console.log('🔌 WebSocket server will run at ws://localhost:3001');