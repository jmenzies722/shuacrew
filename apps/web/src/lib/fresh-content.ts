const EPOCH='shuacrew.content-epoch';
type StorageLike=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export function contentToArchive(storage:StorageLike):Record<string,string>{const result:Record<string,string>={};for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&/^(shuacrew|spark)\./.test(key)&&key!==EPOCH&&!/appearance|theme|font|gateway|token|auth|credential|connection/i.test(key))result[key]=storage.getItem(key)??'';}return result;}
export function clearContentForEpoch(storage:StorageLike,epoch:string){if(!epoch||storage.getItem(EPOCH)===epoch)return false;for(const key of Object.keys(contentToArchive(storage)))storage.removeItem(key);storage.setItem(EPOCH,epoch);return true;}
