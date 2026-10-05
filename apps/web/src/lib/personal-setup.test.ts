import { expect,it } from 'vitest';
import { SetupSaver, type SetupProfile } from './personal-setup';
const profile:SetupProfile={version:1,revision:0,step:0,incomePath:'both',weeklyHours:null,goal:'Learn',completedAt:null};
it('waits for goal persistence before completing and keeps draft on failure',async()=>{
 let writes=0; const saver=new SetupSaver(async()=>{writes++;throw Error('offline');});
 await expect(saver.save(profile,{complete:true})).rejects.toThrow('offline');expect(writes).toBe(1);expect(profile.completedAt).toBeNull();expect(saver.busy).toBe(false);
});
it('deduplicates concurrent completion attempts and saves goal before completion',async()=>{
 const calls:string[]=[];let resolve!:()=>void;const wait=new Promise<void>(r=>resolve=r);
 const saver=new SetupSaver(async(url,body)=>{calls.push(url);await wait;return {...profile,revision:1,completedAt:123};});
 const first=saver.save(profile,{complete:true});const second=saver.save(profile,{complete:true});expect(calls).toEqual(['/api/personal-setup']);resolve();expect(await second).toEqual(await first);expect(calls).toEqual(['/api/personal-setup']);
});
it('saves incomplete progress without changing learning goal',async()=>{
 const calls:string[]=[];const saver=new SetupSaver(async(url,body)=>{calls.push(url);expect(body).toMatchObject({expectedRevision:0,patch:{step:2}});return {...profile,revision:1,step:2};});
 expect((await saver.save(profile,{step:2})).step).toBe(2);expect(calls).toEqual(['/api/personal-setup']);
});
