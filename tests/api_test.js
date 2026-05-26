const fetch = require('node-fetch');
(async () => {
  const base = 'http://localhost:8080/api';
  // Setup admin if not exists
  try {
    await fetch(`${base}/auth/setup`, {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:'admin', password:'admin'})});
    console.log('Setup admin attempted');
  } catch(e) { console.error('Setup error', e); }
  // Login
  const loginRes = await fetch(`${base}/auth/login`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:'admin', password:'admin'})});
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Login token', token);
  const authHeader = {'Authorization': `Bearer ${token}`, 'Content-Type':'application/json'};
  // Create server
  const createRes = await fetch(`${base}/servers/create`, {method:'POST', headers:authHeader, body:JSON.stringify({name:'TestServer', software:'paper', version:'1.20.4', ram_mb:1024, port:25565})});
  const createData = await createRes.json();
  console.log('Create server response', createData);
  const serverId = createData.id;
  // Start server
  const startRes = await fetch(`${base}/servers/${serverId}/start`, {method:'POST', headers:authHeader});
  console.log('Start response', await startRes.json());
  // Wait a bit then stop
  await new Promise(r=>setTimeout(r,5000));
  const stopRes = await fetch(`${base}/servers/${serverId}/stop`, {method:'POST', headers:authHeader});
  console.log('Stop response', await stopRes.json());
  // Get server list
  const listRes = await fetch(`${base}/servers`, {headers:authHeader});
  console.log('Servers list', await listRes.json());
})();
