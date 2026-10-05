import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { PersonalSetup } from './personal-setup.js';
const file = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'shua-setup-')), 'setup.json');
it('defaults without a write and persists a versioned profile privately', () => {
 const f=file(), s=new PersonalSetup(f);
 expect(s.get()).toMatchObject({version:1,revision:0,incomePath:'both',weeklyHours:null,completedAt:null}); expect(existsSync(f)).toBe(false);
 const saved=s.save(0,{goal:'Build useful tools',weeklyHours:8,step:2});
 expect(new PersonalSetup(f).get()).toEqual(saved); expect(statSync(f).mode & 0o777).toBe(0o600);
});
it('rejects stale writers including another store instance', () => {
 const f=file(), a=new PersonalSetup(f), b=new PersonalSetup(f); a.save(0,{goal:'First'});
 expect(()=>b.save(0,{goal:'Lost update'})).toThrow(/changed/i); expect(b.get().goal).toBe('First');
});
it('rejects invalid values without altering the file', () => {
 const f=file(),s=new PersonalSetup(f);s.save(0,{goal:'Saved'});const before=readFileSync(f,'utf8');
 for(const patch of [{weeklyHours:-1},{weeklyHours:169},{weeklyHours:NaN},{goal:'x'.repeat(501)},{completedAt:42},{version:2}]) expect(()=>s.save(1,patch as never)).toThrow();
 expect(readFileSync(f,'utf8')).toBe(before);
});
it('preserves corrupt and unsupported-version files', () => {
 for(const text of ['{broken','{"version":99}']) {const f=file();writeFileSync(f,text);const s=new PersonalSetup(f);expect(()=>s.get()).toThrow(/setup/i);expect(()=>s.save(0,{goal:'Overwrite'})).toThrow();expect(readFileSync(f,'utf8')).toBe(text);}
});
it('does not update in-memory state when persistence fails', () => {
 const f=file(),s=new PersonalSetup(f);s.save(0,{goal:'Original'});
 const failing=new PersonalSetup(f,()=>{throw Error('disk full');});expect(()=>failing.save(1,{goal:'Lost'})).toThrow('disk full');expect(s.get().goal).toBe('Original');
});
it('completion time is server assigned and reopening preserves settings', () => {
 const s=new PersonalSetup(file());const saved=s.save(0,{complete:true,goal:'Goal'});expect(saved.completedAt).toBeGreaterThan(0);
 expect(s.save(1,{step:1,complete:false})).toMatchObject({goal:'Goal',completedAt:null,revision:2});
});
it('checks revision before touching the learning profile on completion',()=>{
 const s=new PersonalSetup(file());s.save(0,{goal:'Current'});let syncs=0;
 expect(()=>s.save(0,{complete:true,goal:'Stale'},()=>{syncs++;})).toThrow(/changed/);expect(syncs).toBe(0);
 expect(()=>s.save(1,{complete:true},()=>{throw Error('learning offline');})).toThrow('learning offline');expect(s.get().completedAt).toBeNull();expect(s.get().revision).toBe(1);
});
