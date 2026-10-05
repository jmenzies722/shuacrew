import Fastify from 'fastify';import {expect,it} from 'vitest';import {mkdtempSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {setupCheckRoutes} from './setup-check-routes.js';import {EventStore} from './store.js';import {Supervisor} from './runs.js';
it('reconciles an interrupted held setup run and exposes blocked connection checks',async()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'shua-check-route-')),store=new EventStore(':memory:'),supervisor=new Supervisor(store,new Map(),{workspace:home,roots:[]}),app=Fastify();
 const run=supervisor.launch({runtime:'codex',ask:'check',labels:['setup-check'],hold:true});store.append('run.status',{status:'running'},{run});
 setupCheckRoutes(app,{home,store,supervisor,runtimes:new Map()});
 try{expect(store.forRun(run).findLast(e=>e.kind==='run.status')?.body).toMatchObject({status:'cancelled'});const r=await app.inject({method:'POST',url:'/api/personal-setup/model-check',payload:{}});expect(r.json()).toMatchObject({state:'blocked',capability:'codex'});const fake=await app.inject({method:'POST',url:'/api/personal-setup/observation',payload:{capability:'codex',ok:true}});expect(fake.statusCode).toBe(400);}finally{await app.close();supervisor.shutdown();store.close();}
});
