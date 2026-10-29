import {clearContentForEpoch,contentToArchive} from './lib/fresh-content';
// Chose Shua, the lean app? Opening ShuaCrew lands there. Never the notch (/buddy), never a page it doesn't have.
const leanChosen=(()=>{try{return localStorage.getItem('shuacrew.app')==='shua'}catch{return false}})();
const toShua=leanChosen&&location.pathname==='/'&&!location.search;
async function boot(){
 const response=await fetch('/api/content-epoch');if(!response.ok)throw Error('Could not check workspace identity. Retry when the engine is connected.');
 const {epoch}=await response.json() as {epoch:string|null};
 if(epoch&&localStorage.getItem('shuacrew.content-epoch')!==epoch){
  const saved=await fetch('/api/content-epoch/archive',{method:'POST',headers:{'X-ShuaCrew':'1','Content-Type':'application/json'},body:JSON.stringify({epoch,content:contentToArchive(localStorage)})});
  if(!saved.ok)throw Error('Old browser content could not be backed up. Nothing was cleared. Retry when the engine is ready.');
  clearContentForEpoch(localStorage,epoch);
  for(const key of Object.keys(contentToArchive(sessionStorage)))sessionStorage.removeItem(key);
 }
 await import('./app');
}
if(toShua)location.replace('/shua.html'+location.hash);
else void boot().catch(e=>{const root=document.getElementById('root');if(root){root.textContent=(e as Error).message;const button=document.createElement('button');button.textContent='Retry';button.onclick=()=>location.reload();root.appendChild(button);}});
