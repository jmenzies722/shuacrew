import {expect,it} from 'vitest';import {clearContentForEpoch} from './fresh-content';
it('clears old content once while retaining appearance and connection settings',()=>{
 const map=new Map([['shuacrew.buddy','old conversation'],['shuacrew.activeLesson','old lesson'],['shuacrew.appearance','obsidian'],['shuacrew.gateway-token','secret'],['unrelated','keep']]);
 const storage={get length(){return map.size;},key:(i:number)=>[...map.keys()][i]??null,getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,v),removeItem:(k:string)=>void map.delete(k)};
 expect(clearContentForEpoch(storage,'fresh-1')).toBe(true);expect(map.has('shuacrew.buddy')).toBe(false);expect(map.get('shuacrew.appearance')).toBe('obsidian');expect(map.get('shuacrew.gateway-token')).toBe('secret');map.set('shuacrew.buddy','new');expect(clearContentForEpoch(storage,'fresh-1')).toBe(false);expect(map.get('shuacrew.buddy')).toBe('new');
});

it('a fresh start keeps your setup and Shua\'s character, and erases what you made',()=>{
 const keep=['shuacrew.companion','shuacrew.companion.name','shuacrew.look','shuacrew.side.width','shuacrew.terminalFont','shuacrew.buddy.voice','shuacrew.microphone','shuacrew.widgets','shuacrew.theme'];
 const erase=['shuacrew.buddy','shuacrew.companionDraft','shuacrew.spark.missions','shuacrew.timers','shuacrew.completion-reports','shuacrew.spark.log','shuacrew.morning','shuacrew.widgets.note','shuacrew.recentRepos','shuacrew.voice.trace','shuacrew.learn.research'];
 const map=new Map([...keep,...erase].map(k=>[k,'v'] as [string,string]));
 const storage={get length(){return map.size;},key:(i:number)=>[...map.keys()][i]??null,getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,v),removeItem:(k:string)=>void map.delete(k)};
 clearContentForEpoch(storage,'fresh-2');
 for(const k of keep)expect(map.has(k),k).toBe(true);
 for(const k of erase)expect(map.has(k),k).toBe(false);
});
