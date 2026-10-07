const EPOCH='shuacrew.content-epoch';
type StorageLike=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
/**
 * A fresh start erases what you made and keeps how you set things up. Setup survives: the look and theme, Shua's
 * character, voice and microphone, your layout, terminal and widget preferences, modes, connections. Content goes:
 * conversations, drafts, missions, timers, reports, what Shua said, briefs, lessons in progress, recent repos, caches.
 */
const SETUP=new Set(['shuacrew.companion','shuacrew.buddy.voice','shuacrew.buddy.see','shuacrew.buddy.desktop','shuacrew.microphone','shuacrew.live.voice','shuacrew.voiceConversation','shuacrew.voice-autopilot','shuacrew.voice.calibrated',
 'shuacrew.look','shuacrew.design','shuacrew.mode','shuacrew.modeSchedule','shuacrew.power','shuacrew.mix','shuacrew.scope','shuacrew.workspace','shuacrew.workspacePage','shuacrew.sidebar','shuacrew.sparkPanel','shuacrew.hubs.last',
 'shuacrew.hudPosition','shuacrew.keys','shuacrew.diffSplit','shuacrew.sessionsCollapsed','shuacrew.termHeight','shuacrew.toolCards','shuacrew.usage.period','shuacrew.widgets','shuacrew.weather','shuacrew.radio','shuacrew.studio.camera',
 'shuacrew.observability.v1','shuacrew.recs.dismissed','shuacrew.devConsole','shuacrew.learn.tab','shuacrew.learnTab','shuacrew.coachMode']);
const isSetup=(key:string)=>SETUP.has(key)||/^shuacrew\.(companion\.|look\.|design\.|side\.|terminal)/.test(key)||/appearance|theme|font|gateway|token|auth|credential|connection/i.test(key);
export function contentToArchive(storage:StorageLike):Record<string,string>{const result:Record<string,string>={};for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&/^(shuacrew|spark)\./.test(key)&&key!==EPOCH&&!isSetup(key))result[key]=storage.getItem(key)??'';}return result;}
export function clearContentForEpoch(storage:StorageLike,epoch:string){if(!epoch||storage.getItem(EPOCH)===epoch)return false;for(const key of Object.keys(contentToArchive(storage)))storage.removeItem(key);storage.setItem(EPOCH,epoch);return true;}
