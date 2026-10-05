import {expect,it} from 'vitest';import {clearContentForEpoch} from './fresh-content';
it('clears old content once while retaining appearance and connection settings',()=>{
 const map=new Map([['shuacrew.buddy','old conversation'],['shuacrew.activeLesson','old lesson'],['shuacrew.appearance','obsidian'],['shuacrew.gateway-token','secret'],['unrelated','keep']]);
 const storage={get length(){return map.size;},key:(i:number)=>[...map.keys()][i]??null,getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>void map.set(k,v),removeItem:(k:string)=>void map.delete(k)};
 expect(clearContentForEpoch(storage,'fresh-1')).toBe(true);expect(map.has('shuacrew.buddy')).toBe(false);expect(map.get('shuacrew.appearance')).toBe('obsidian');expect(map.get('shuacrew.gateway-token')).toBe('secret');map.set('shuacrew.buddy','new');expect(clearContentForEpoch(storage,'fresh-1')).toBe(false);expect(map.get('shuacrew.buddy')).toBe('new');
});
