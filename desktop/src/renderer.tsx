import { Buffer } from "buffer";
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudioShell } from "../../src/components/studio/studio-shell";
import { WelcomeScreen } from "../../src/components/welcome/welcome-screen";
import { LiveAuthBoundary } from "../../src/components/auth/temporary-live-auth-boundary";
import { ProjectCatalogProvider } from "../../src/lib/projects/catalog-context";
import { createBrowserGitEngine } from "../../src/lib/browser-git";
import { openCatalogDatabase, getRecord, putRecord, putProjectAndSession } from "../../src/lib/projects/idb";
import { PROJECT_CATALOG_DATABASE, type ProjectRecord, type ProjectSession } from "../../src/lib/projects/types";
import { desktopRequest, publishDesktopCompletions } from "./client-session";
import type { DesktopFile } from "./workspace";
import "../../src/app/globals.css";
import "./desktop.css";

(window as unknown as {Buffer:typeof Buffer}).Buffer = Buffer;
const desktop = {hotReload:true,publishCompletions:publishDesktopCompletions,saveFiles:async(projectId:string,files:Record<string,string>) => { await desktopRequest("/workspace/save",{projectId,files}); },
  registerAutomation:(control:(action:string,args:Record<string,unknown>)=>Promise<unknown>)=>{window.__ftcDesktopControl=control;return()=>{if(window.__ftcDesktopControl===control)delete window.__ftcDesktopControl;};},
  registerSaveBarrier:(save:()=>Promise<void>)=>{window.__ftcDesktopDrain=save;return()=>{if(window.__ftcDesktopDrain===save)delete window.__ftcDesktopDrain;};}};
type Workspace = {id:string;name:string;directory:string;files:DesktopFile[]};
type Evaluation = {tips:number;score:number;parked:boolean;valid:boolean;compileMs:number;wallMs:number;seed:number;reusedPrefixSeconds:number};

async function prepareWorkspace():Promise<Workspace> {
  const workspace = await desktopRequest<Workspace>("/workspace");
  const namespace = `ftc-desktop-${workspace.id}`;
  const git = createBrowserGitEngine({databaseName:namespace});
  const initial = Object.fromEntries(workspace.files.map(f => [f.path,Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))]));
  const state = await git.initialize(initial);
  for (const path of Object.keys(await git.readAllFiles())) if (!(path in initial)) await git.deleteFile(path);
  for(const file of workspace.files) if(file.text!==undefined && state.files[file.path]!==file.text) await git.writeFile(file.path,file.text);
  const db = await openCatalogDatabase(PROJECT_CATALOG_DATABASE);
  const existing = await getRecord<ProjectRecord>(db,"projects",workspace.id);
  if(!existing){
    const now=new Date().toISOString();
    const javaFile=workspace.files.find(f=>f.path.endsWith(".java")&&f.text?.includes("@Autonomous"));
    const javaPackage=javaFile?.text?.match(/package\s+([\w.]+)\s*;/)?.[1]??"org.firstinspires.ftc.teamcode";
    const className=javaFile?.text?.match(/public\s+(?:final\s+)?class\s+(\w+)/)?.[1];
    const project:ProjectRecord={schemaVersion:1,id:workspace.id,name:workspace.name,nameKey:workspace.name.toLowerCase(),javaPackage,storageNamespace:namespace,
      state:"ready",starter:"java",drivetrain:"mecanum",motorNamingPreset:"descriptive",sdkVersion:"11.1.0",kotlinVersion:"2.2.10",createdAt:now,updatedAt:now,lastOpenedAt:now,cloudSyncEnabled:false};
    const path=javaFile?.path??null;
    const session:ProjectSession={schemaVersion:1,projectId:workspace.id,openTabs:path?[path]:[],activeFile:path,selectedOpMode:className?`${javaPackage}.${className}`:null,
      robotConfiguration:{drivetrain:"mecanum",motorNamingPreset:"descriptive"},toolWindows:{project:true,simulator:true,rightTool:"simulator",bottom:true,bottomTab:"Run"},updatedAt:now};
    await putProjectAndSession(db,project,session);
  }else if(existing.cloudSyncEnabled || existing.ownerUserId)await putRecord(db,"projects",{...existing,ownerUserId:undefined,cloud:undefined,cloudSyncEnabled:false});
  db.close(); return workspace;
}

function DesktopApp(){
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[error,setError]=useState<string|null>(null);
  const [route,setRoute]=useState(window.location.pathname),[busy,setBusy]=useState(false),[evaluation,setEvaluation]=useState<Evaluation|null>(null);
  const evaluating = useRef(false);
  useEffect(()=>{let live=true;void prepareWorkspace().then(w=>{if(!live)return;setWorkspace(w);if(!window.location.pathname.startsWith("/studio/")){history.replaceState({},"",`/studio/${w.id}`);setRoute(`/studio/${w.id}`);}}).catch(e=>{if(live)setError(String(e));});const pop=()=>setRoute(window.location.pathname);window.addEventListener("popstate",pop);return()=>{live=false;window.removeEventListener("popstate",pop);};},[]);
  const evaluate=useCallback(async()=>{if(evaluating.current)return;evaluating.current=true;setBusy(true);setError(null);try{await window.__ftcDesktopDrain?.();setEvaluation(await desktopRequest<Evaluation>("/evaluate",{seed:20261024}));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{evaluating.current=false;setBusy(false);}},[]);
  useEffect(()=>{const run=()=>{void evaluate();};window.addEventListener("ftc-desktop-evaluate",run);return()=>window.removeEventListener("ftc-desktop-evaluate",run);},[evaluate]);
  if(!workspace)return <main className="desktop-start" role={error?"alert":"status"}>{error??"Opening local project…"}{error&&<button onClick={()=>window.location.reload()}>Retry</button>}</main>;
  const projectId=route.match(/^\/studio\/([^/]+)/)?.[1];
  return <LiveAuthBoundary expectedUserId={null}><ProjectCatalogProvider accountId={null}>
    <div className="desktop-frame"><div className="desktop-bar"><strong>FTC Simulator Desktop</strong><span className="desktop-path" title={workspace.directory}>{workspace.directory}</span>
      {evaluation&&<output aria-live="polite" title={`30 simulated seconds; seed ${evaluation.seed}; reused ${evaluation.reusedPrefixSeconds.toFixed(2)} unchanged seconds`}>{evaluation.valid?"":"Invalid trial · "}{evaluation.tips} tips · {evaluation.parked?"Parked":"Not parked"} · {evaluation.score} pts · {evaluation.compileMs.toFixed(0)} ms compile · {(evaluation.wallMs/1000).toFixed(2)} s trial</output>}
      <button onClick={()=>{void evaluate();}} disabled={busy}>{busy?"Evaluating…":"Evaluate 30 s"}</button></div>
      {error&&<div className="desktop-error" role="alert">{error}<button onClick={()=>setError(null)}>Dismiss</button></div>}
      <div className="desktop-content">{projectId?<StudioShell key={projectId} projectId={projectId} desktop={desktop}/>:<WelcomeScreen version="0.1.0"/>}</div>
    </div>
  </ProjectCatalogProvider></LiveAuthBoundary>;
}
createRoot(document.getElementById("root")!).render(<DesktopApp/>);
declare global {interface Window{__ftcDesktopDrain?:()=>Promise<void>;__ftcDesktopControl?:(action:string,args:Record<string,unknown>)=>Promise<unknown>}}
