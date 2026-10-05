import Fastify from 'fastify';
import {expect,it} from 'vitest';
import {mkdtempSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {Learning} from './learning.js';
import {personalSetupRoutes} from './personal-setup-routes.js';
const home=()=>mkdtempSync(path.join(os.tmpdir(),'shua-setup-routes-'));
it('rejects stale completion before changing learning and preserves failed completion',async()=>{
 const dir=home(),app=Fastify();let goals:string[]=[];personalSetupRoutes(app,dir,goal=>{goals.push(goal);throw Error('Learning store unavailable');});
 try{
  expect((await app.inject({method:'POST',url:'/api/personal-setup',payload:{expectedRevision:0,patch:{goal:'Saved',step:2}}})).statusCode).toBe(200);
  expect((await app.inject({method:'POST',url:'/api/personal-setup',payload:{expectedRevision:0,patch:{goal:'Stale',complete:true}}})).statusCode).toBe(409);expect(goals).toEqual([]);
  expect((await app.inject({method:'POST',url:'/api/personal-setup',payload:{expectedRevision:1,patch:{goal:'Current',complete:true}}})).statusCode).toBe(503);expect(goals).toEqual(['Current']);
  expect((await app.inject('/api/personal-setup')).json()).toMatchObject({revision:1,goal:'Saved',step:2,completedAt:null});
 }finally{await app.close();}
});
it('archives browser content privately, accepts large history, and rejects stale epochs',async()=>{
 const dir=home(),app=Fastify();writeFileSync(path.join(dir,'content-epoch.json'),JSON.stringify({epoch:'fresh-1'}));personalSetupRoutes(app,dir);
 try{
  const content={'shuacrew.history':'a'.repeat(900000),'spark.history':'b'.repeat(900000)};
  expect((await app.inject({method:'POST',url:'/api/content-epoch/archive',payload:{epoch:'old',content}})).statusCode).toBe(409);
  expect((await app.inject({method:'POST',url:'/api/content-epoch/archive',payload:{epoch:'fresh-1',content}})).statusCode).toBe(200);
  const folder=path.join(dir,'backups/browser-fresh-1'),files=readdirSync(folder);expect(files).toHaveLength(1);const file=path.join(folder,files[0]!);expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(content);expect(statSync(file).mode&0o777).toBe(0o600);
 }finally{await app.close();}
});

it('can complete a setup with its full supported goal length',async()=>{
 const dir=home(),app=Fastify(),learning=new Learning(path.join(dir,'learning.json'));personalSetupRoutes(app,dir,goal=>{learning.setProfile({goal});});
 try{const goal='g'.repeat(500);const r=await app.inject({method:'POST',url:'/api/personal-setup',payload:{expectedRevision:0,patch:{goal,complete:true}}});expect(r.statusCode).toBe(200);expect(learning.get().profile.goal).toBe(goal);}finally{await app.close();}
});
