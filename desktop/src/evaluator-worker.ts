import { resolve } from "node:path";
import { AutonomousEvaluator } from "./evaluator";
import { DesktopSessions } from "./sessions";
import { DesktopWorkspace } from "./workspace";
import { DesktopBuildError } from "./sessions";

type Input={id:number;directory:string;operation?:"evaluate"|"build";options:Parameters<AutonomousEvaluator["evaluate"]>[0]};
const endpoint=globalThis as unknown as {onmessage:(event:MessageEvent<Input>)=>void;postMessage(message:unknown):void};
const root=resolve(process.env.FTC_DESKTOP_RESOURCE_ROOT??process.cwd());
let directory:string|undefined,sessions:DesktopSessions|undefined,evaluator:AutonomousEvaluator|undefined;
let tail:Promise<unknown>=Promise.resolve();
endpoint.onmessage=event=>{
  const input=event.data;
  const task=tail.then(async()=>{
    try{
      if(directory!==input.directory){
        await sessions?.dispose();evaluator?.dispose();
        directory=input.directory;sessions=new DesktopSessions(root);
        evaluator=new AutonomousEvaluator(root,new DesktopWorkspace(directory,resolve(root,"desktop/.cache/projects")),sessions);
      }
      endpoint.postMessage({id:input.id,result:await (input.operation==="build"?evaluator!.build():evaluator!.evaluate(input.options))});
    }catch(error){endpoint.postMessage({id:input.id,error:error instanceof DesktopBuildError?[error.message,...error.diagnostics.map(d=>d.message)].join("\n"):error instanceof Error?error.message:String(error)});}
  });
  tail=task.catch(()=>undefined);
};
