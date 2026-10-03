const fs=require('fs'), path=require('path'), os=require('os'), cp=require('child_process');
const root=process.cwd(); const temp=fs.mkdtempSync(path.join(os.tmpdir(),'minepanel-jest-')); const install=path.join(temp,'installation'); fs.mkdirSync(install);
for(const name of ['package.json','jest.backend.config.cjs','tests','src/frontend/src/lib/minecraftLog.ts','src/core/automation','src/docs']) fs.cpSync(path.join(root,name),path.join(install,name),{recursive:true});
function copyCode(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())copyCode(file);else if(/\.(js|js\.map)$/.test(file)){const dest=path.join(install,path.relative(root,file));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest)}}}
copyCode(path.join(root,'dist/src')); fs.symlinkSync(path.join(root,'node_modules'),path.join(install,'node_modules'),'junction');fs.writeFileSync(path.join(install,'.env'),'HTTPS=false\nJWT_SECRET=isolated-test-secret\n');
const result=cp.spawnSync(process.execPath,[path.join(root,'node_modules/jest/bin/jest.js'),'--config','jest.backend.config.cjs','--runInBand','--forceExit','--silent','--json','--outputFile',path.join(root,'scratch/dist-migration/jest-results.json')],{cwd:install,env:{...process.env,NODE_ENV:'test',HTTPS:'false'},encoding:'utf8',timeout:120000});
fs.writeFileSync(path.join(root,'scratch/dist-migration/jest-output.txt'),result.stdout+'\n'+result.stderr);
console.log('exit',result.status,'error',result.error?.message||'none');console.log((result.stderr||'').slice(-5000));
if(path.dirname(temp)===path.resolve(os.tmpdir())&&path.basename(temp).startsWith('minepanel-jest-'))fs.rmSync(temp,{recursive:true,force:true});
