export interface SetupProfile {version:1;revision:number;step:number;incomePath:'products'|'services'|'both';weeklyHours:number|null;goal:string;completedAt:number|null}
export type SetupPatch=Partial<Pick<SetupProfile,'step'|'incomePath'|'weeklyHours'|'goal'>> & {complete?:boolean};
export class SetupSaver {
 private pending:Promise<SetupProfile>|null=null;
 constructor(private post:(url:string,body:unknown)=>Promise<unknown>){}
 get busy(){return this.pending!==null;}
 save(profile:SetupProfile,patch:SetupPatch):Promise<SetupProfile>{
  if(this.pending)return this.pending;
  this.pending=(async()=>{
   return await this.post('/api/personal-setup',{expectedRevision:profile.revision,patch}) as SetupProfile;
  })().finally(()=>{this.pending=null;});return this.pending;
 }
}
export const SETUP_EVENT='shuacrew:welcome';
export const openSetup=()=>window.dispatchEvent(new Event(SETUP_EVENT));
