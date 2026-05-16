const { spawn } = require('child_process');
const path = require('path');
const api = spawn('node', [path.join(__dirname,'apps/marketing-api/dist/server.js')], {stdio:'inherit'});
const wkr = spawn('node', [path.join(__dirname,'apps/marketing-worker/dist/worker.js')], {stdio:'inherit'});
api.on('exit', c => console.error('[api] exit='+c));
wkr.on('exit', c => console.error('[worker] exit='+c));
process.on('SIGTERM', () => { api.kill(); wkr.kill(); setTimeout(()=>process.exit(0),5000); });
console.log('[runtime] 45cm started');