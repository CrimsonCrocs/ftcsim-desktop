type Command={id:string;action:string;args:Record<string,unknown>};
/** Only the local authenticated service can issue commands to its own editor. */
export class EditorAutomation {
  private waiting=new Map<string,{command:Command;delivered:boolean;resolve:(result:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  request(action:string,args:Record<string,unknown>={}):Promise<unknown>{
    if(!["status","run","stop","rewind","build","edit","reload","snapshot","show","hide","evaluate","resize","quit"].includes(action))throw new Error("Unknown editor action");
    if(this.waiting.size>=8)throw new Error("Editor command queue is full");
    const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.waiting.delete(id);reject(new Error("The editor did not respond. Open FTC Simulator Desktop and retry."));},action==="build"||action==="run"?240_000:15_000);
      this.waiting.set(id,{command:{id,action,args},delivered:false,resolve,reject,timer});
    });
  }
  poll():Command|null{
    for(const entry of this.waiting.values())if(!entry.delivered){entry.delivered=true;return entry.command;}
    return null;
  }
  complete(id:string,result:unknown,error?:string):void{
    const entry=this.waiting.get(id);if(!entry)return;
    clearTimeout(entry.timer);this.waiting.delete(id);
    if(error)entry.reject(new Error(error));else entry.resolve(result);
  }
}
