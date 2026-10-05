import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
export const SetupProfileSchema=z.object({version:z.literal(1),revision:z.number().int().nonnegative(),step:z.number().int().min(0).max(5),incomePath:z.enum(['products','services','both']),weeklyHours:z.number().finite().min(0).max(168).nullable(),goal:z.string().max(500),completedAt:z.number().nullable()}).strict();
export type SetupProfile=z.infer<typeof SetupProfileSchema>;
const Patch=SetupProfileSchema.omit({version:true,revision:true,completedAt:true}).partial().extend({complete:z.boolean().optional()}).strict();
export type SetupPatch=z.infer<typeof Patch>;
export class SetupConflict extends Error { constructor(){super('Setup changed in another window. Reload saved settings before trying again.');} }
export function atomicPrivateWrite(file:string,value:unknown){
 mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=`${file}.${randomUUID()}.tmp`;
 try {writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});renameSync(temp,file);} finally {if(existsSync(temp)) unlinkSync(temp);}
}
export class PersonalSetup {
 constructor(private file:string,private write=atomicPrivateWrite){}
 get():SetupProfile {
  if(!existsSync(this.file))return {version:1,revision:0,step:0,incomePath:'both',weeklyHours:null,goal:'',completedAt:null};
  try{return SetupProfileSchema.parse(JSON.parse(readFileSync(this.file,'utf8')));}catch{throw Error('Saved setup could not be read. Its file has been preserved; restore a valid backup before saving.');}
 }
 save(expectedRevision:number,raw:SetupPatch,onComplete?:(goal:string)=>void):SetupProfile {
  const patch=Patch.parse(raw),prior=this.get();
  if(expectedRevision!==prior.revision)throw new SetupConflict();
  const {complete,...fields}=patch;
  const next=SetupProfileSchema.parse({...prior,...fields,revision:prior.revision+1,completedAt:complete===undefined?prior.completedAt:complete?Date.now():null});
  if(complete)onComplete?.(next.goal);
  this.write(this.file,next);return next;
 }
}
