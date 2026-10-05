/** A dependent command sequence never advances past a failed or uncertain receipt. */
export async function* actionSequence<A, R extends {ok:boolean;message:string}>(actions: A[], execute: (action:A,index:number)=>Promise<R>, active:()=>boolean) {
  for(const [index, action] of actions.entries()) {
    if(!active())return;
    const result=await execute(action,index);
    if(!active())return;
    yield {action,index,result};
    if(!result.ok)return;
  }
}
