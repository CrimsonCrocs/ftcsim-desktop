import { resolve } from "node:path";
import type { AutonomousEvaluator } from "./evaluator";
type Options = Parameters<AutonomousEvaluator["evaluate"]>[0];
type Result = Awaited<ReturnType<AutonomousEvaluator["evaluate"]>>;

/** Physics and snapshot compression run off the UI transport's event loop. */
export class DesktopEvaluatorClient {
  private worker?:Worker;
  private next=0;
  private pending=new Map<number,{resolve:(result:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(private readonly root:string){}
  get busy():boolean{return this.pending.size>0;}
  async evaluate(directory:string,options:Options):Promise<Result>{
    return this.request<Result>(directory,"evaluate",options);
  }
  async build(directory:string):Promise<Awaited<ReturnType<AutonomousEvaluator["build"]>>>{
    return this.request(directory,"build",{});
  }
  private async request<T>(directory:string,operation:"evaluate"|"build",options:Options):Promise<T>{
    if(!this.worker){
      const bundled=resolve(this.root,"desktop/evaluator-worker.js");
      const path=await Bun.file(bundled).exists()?bundled:resolve(this.root,"desktop/src/evaluator-worker.ts");
      this.worker=new Worker(path);
      this.worker.addEventListener("message",event=>{
        const message=event.data as {id:number;result?:unknown;error?:string};
        const pending=this.pending.get(message.id);if(!pending)return;
        this.pending.delete(message.id);clearTimeout(pending.timer);
        if(message.error)pending.reject(new Error(message.error));
        else if(message.result)pending.resolve(message.result);
        else pending.reject(new Error("Evaluation worker returned no result"));
      });
      this.worker.addEventListener("error",event=>this.fail(new Error(event.message||"Evaluation worker stopped")));
    }
    const id=++this.next;
    return new Promise<T>((resolveResult,reject)=>{
      const timer=setTimeout(()=>this.fail(new Error("Evaluation exceeded its four-minute deadline")),240_000);
      this.pending.set(id,{resolve:result=>resolveResult(result as T),reject,timer});
      this.worker!.postMessage({id,directory,operation,options});
    });
  }
  dispose():void{this.fail(new Error("Desktop evaluation stopped"));}
  private fail(error:Error){
    this.worker?.terminate();this.worker=undefined;
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}
    this.pending.clear();
  }
}
