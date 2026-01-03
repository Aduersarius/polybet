#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Suppress url.parse() deprecation warnings from dependencies (e.g., socket.io)
// This is a known issue in socket.io-client and will be fixed in future versions
// We only suppress DEP0169 warnings (url.parse) to avoid hiding other important warnings
const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, type, code, ctor) {
    if (code === 'DEP0169' || (type === 'DeprecationWarning' && String(warning).includes('url.parse()'))) {
        // Suppress url.parse() deprecation warnings from dependencies
        return;
    }
    return originalEmitWarning.call(this, warning, type, code, ctor);
};

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