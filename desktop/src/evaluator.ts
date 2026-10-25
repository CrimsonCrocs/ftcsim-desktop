import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hashRepositoryFiles } from "../../tools/gradle/gradle-adapter";
import { openRobotConfiguration, resolveRuntimeMotorDescriptors } from "../../src/lib/robot-configuration";
import { createBiobuzzWorldOptions } from "../../src/lib/biobuzz-world-field";
import { GameSimulation } from "../../packages/ftc-sim-core/src/game-simulation";
import { toRunnerWorldSensorFrame } from "../../src/lib/world-sensor-runner-frame";
import { enqueueActuatorFrame } from "../../src/components/studio/game-simulation-replay";
import type { LoadArtifact, OpModeClientMessage, ProgramSource, WorldRobotSensorFrame } from "@ftc-studio/opmode-protocol";
import { DesktopSessions } from "./sessions";
import { DesktopWorkspace } from "./workspace";
import { actuatorSignature, equalSensors, packSnapshot, unpackSnapshot, ReplayMismatch, type TrialTick, type TrialTrace } from "./trial-replay";

type Prepared = { id:string; artifact:LoadArtifact; configurationDigest:string; sourceDigest:string };
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");

/** Deterministic accelerated trials. The fixed 5 ms physics step and rules are unchanged. */
export class AutonomousEvaluator {
  private prepared?:Prepared;
  private tail:Promise<unknown>=Promise.resolve();
  private sequence=0;
  private assets=new Map<string,Uint8Array>();
  private world?:{key:string;game:GameSimulation;initial:Uint8Array};
  private trace?:TrialTrace;
  constructor(private readonly root:string,private readonly workspace:DesktopWorkspace,private readonly sessions:DesktopSessions){}
  dispose():void{this.world?.game.dispose();this.world=undefined;this.trace=undefined;}
  evaluate(options:{seed?:number;entryClass?:string;replay?:boolean}={}) {
    const result=this.tail.then(async()=>{
      try{return await this.run(options);}
      catch(error){
        if(!(error instanceof ReplayMismatch))throw error;
        return {...await this.run({...options,replay:false}),replayFallback:error.message};
      }
    });
    this.tail=result.catch(()=>undefined);return result;
  }
  build(){
    const result=this.tail.then(async()=>{const prepared=await this.prepare();return {compileKind:prepared.compileKind,compileMs:prepared.compileMs,sourceDigest:prepared.sourceDigest,opModes:this.prepared!.artifact.opModes};});
    this.tail=result.catch(()=>undefined);return result;
  }
  private async prepare(){
    const compileStart=performance.now();
    const snapshot=await this.workspace.snapshot(false);
    const manifest=snapshot.files.find(f=>f.path==="ftcsim.project.json")?.text;
    if(!manifest)throw new Error("Project has no robot configuration");
    const document=openRobotConfiguration(manifest);
    if(document.diagnostics.length)throw new Error(document.diagnostics.map(d=>d.message).join("\n"));
    const sourcePaths=new Set(this.prepared?.artifact.hotReload?.sourcePaths??[]);
    const configurationDigest=hash(snapshot.id+snapshot.files.filter(f=>!sourcePaths.has(f.path)).map(f=>`${f.path}:${f.base64}`).join("\n"));
    const sourceDigest=hash(snapshot.files.map(f=>`${f.path}:${f.base64}`).join("\n"));
    const hardware={motors:resolveRuntimeMotorDescriptors(document.configuration),servos:document.resolved.physical.servos.map(s=>s.name),
      sensors:document.resolved.physical.sensors.map(s=>({name:s.name,kind:s.kind})),cameras:document.resolved.physical.cameras.map(c=>({name:c.name})),configurationHash:document.resolved.configurationHash};
    let compileKind="unchanged";
    if(!this.prepared||this.prepared.configurationDigest!==configurationDigest){
      if(this.prepared)await this.sessions.close(this.prepared.id,true);
      const opened=await this.sessions.open({});
      const files=snapshot.files.map(f=>({path:f.path,bytes:Uint8Array.from(Buffer.from(f.base64,"base64"))}));
      let artifact:LoadArtifact;
      try {
        artifact=await this.sessions.build(opened.sessionId,{protocolVersion:3,requestId:this.next(),command:"build",hardware,
          repositorySnapshot:{format:"ftc-repository-snapshot-v1",sha256:hashRepositoryFiles(files),files:snapshot.files.map(f=>({path:f.path,encoding:"base64",content:f.base64}))}});
      } catch(error) { await this.sessions.close(opened.sessionId,true); throw error; }
      const editable=new Set(artifact.hotReload?.sourcePaths??[]);
      this.prepared={id:opened.sessionId,artifact,configurationDigest:hash(snapshot.id+snapshot.files.filter(f=>!editable.has(f.path)).map(f=>`${f.path}:${f.base64}`).join("\n")),sourceDigest};
      compileKind="gradle";
    }else if(this.prepared.sourceDigest!==sourceDigest){
      const sources:ProgramSource[]=[];
      for(const path of sourcePaths){const file=snapshot.files.find(f=>f.path===path);if(file?.text===undefined)throw new Error("Source set changed. Rebuild the project.");sources.push({path,content:file.text});}
      await this.command({command:"reload-sources",sources});
      this.prepared.sourceDigest=sourceDigest;compileKind="warm-compiler";
    }
    const compileMs=Math.round(performance.now()-compileStart);
    return {document,compileMs,compileKind,sourceDigest};
  }
  private async run(options:{seed?:number;entryClass?:string;replay?:boolean}){
    const seed=options.seed??20261024;
    if(!Number.isSafeInteger(seed))throw new Error("Trial seed must be an integer");
    const {document,compileMs,compileKind,sourceDigest}=await this.prepare();
    const entryClass=options.entryClass??this.prepared!.artifact.opModes.find(m=>m.kind==="autonomous")?.className;
    if(!entryClass)throw new Error("Project has no enabled autonomous OpMode");
    const start=performance.now();
    const worldKey=hash(`${this.prepared!.configurationDigest}:${seed}`);
    if(!this.world||this.world.key!==worldKey||options.replay===false){
      this.world?.game.dispose();this.world=undefined;
      const field=await createBiobuzzWorldOptions({seed,alliance:"red",startPosition:"near",robotConfiguration:document.resolved.physical},async url=>{
        let bytes=this.assets.get(url);if(!bytes){bytes=new Uint8Array(await readFile(resolve(this.root,"public",url.replace(/^\//,""))));this.assets.set(url,bytes);}return bytes;
      });
      const game=await GameSimulation.create(field);
      // Canonicalize after real sensor capture/latency warmup. Restoring an
      // uninitialized broad phase can change the first camera occlusion query.
      game.initialize();
      this.world={key:worldKey,game,initial:packSnapshot(game.snapshot())};
    }else this.world.game.restore(unpackSnapshot(this.world.initial));
    const game=this.world.game;
    const traceKey=hash(`${worldKey}:${entryClass}`);
    const cached=options.replay!==false&&this.trace?.key===traceKey?this.trace:undefined;
    let replaying=Boolean(cached),reusedTicks=0,physicsTicks=0;
    const ticks:TrialTick[]=[],checkpoints=new Map<number,Uint8Array>();let checkpointBytes=0;
    const collected=new Set<string>();let peakPayload=0;let stoppedNeutral=false;let stopped=false;
    const samples:Array<Record<string,unknown>>=[];
    try{
      await this.command({command:"reset"});
      if(game.phase!=="init")game.initialize();
      const initSensors=toRunnerWorldSensorFrame(game.world.sensorFrame("red-1"));
      if(cached&&!equalSensors(initSensors,cached.initSensors))replaying=false;
      await this.command({command:"init",entryClass,sensors:initSensors});
      game.start();await this.command({command:"start"});
      for(let sequence=0;sequence<1500;sequence++){
        if(sequence%250===0){
          const bytes=replaying?cached!.checkpoints.get(sequence):packSnapshot(game.snapshot());
          if(bytes&&checkpointBytes+bytes.byteLength<=192*1024*1024){checkpoints.set(sequence,bytes);checkpointBytes+=bytes.byteLength;}
        }
        const old=replaying?cached!.ticks[sequence]:undefined;
        if(!old){replaying=false;game.step(4);physicsTicks+=4;}
        const sensors=old?.sensors??toRunnerWorldSensorFrame(game.world.sensorFrame("red-1"));
        const motors=Object.fromEntries(Object.entries(sensors.motors).map(([name,motor])=>[name,{
          positionTicks:motor.positionTicks,velocityTicksPerSecond:motor.velocityTicksPerSecond,currentAmps:motor.currentAmps,enabled:motor.enabled,
        }]));
        const reply=await this.command({command:"tick",sequence,deltaMillis:20,gamepad1:{},gamepad2:{},motors,sensors});
        if(!reply.frame)throw new Error("Runtime tick produced no frame");
        if(reply.frame.cameraFrameRequests?.length)throw new Error("This OpMode requests camera pixels. Use the interactive simulator for its image pipeline.");
        const signature=actuatorSignature(reply.frame);
        let tick:TrialTick;
        if(old&&old.signature===signature){
          reusedTicks++;tick={...old,frame:reply.frame};
        }else{
          if(old){
            const index=[...cached!.checkpoints.keys()].filter(i=>i<=sequence).sort((a,b)=>b-a)[0];
            if(index===undefined)throw new ReplayMismatch("No bounded checkpoint before the changed command");
            game.restore(unpackSnapshot(cached!.checkpoints.get(index)!));
            for(let i=index;i<=sequence;i++){
              game.step(4);physicsTicks+=4;
              if(i<sequence)enqueueActuatorFrame(game.world,cached!.ticks[i]!.frame,"red-1",game.phase,i);
            }
            if(!equalSensors(toRunnerWorldSensorFrame(game.world.sensorFrame("red-1")),sensors))throw new ReplayMismatch("Checkpoint replay changed sensor feedback; ran a fresh full trial");
            replaying=false;
          }
          enqueueActuatorFrame(game.world,reply.frame,"red-1",game.phase,sequence);
          const observation=game.world.observe();
          const payload=observation.elements.filter(e=>e.controlledBy==="red-1").map(e=>e.id);
          const flight=observation.elements.filter(e=>e.kind==="pollen"&&!e.controlledBy&&collected.has(e.id)&&e.position.y>.10).map(e=>({id:e.id,position:e.position,velocity:e.linearVelocity}));
          const robot=observation.robots.find(r=>r.id==="red-1")!;
          tick={sensors,frame:reply.frame,signature,payload,...(flight.length?{flight:{time:game.matchTimeMs/1000,elements:flight}}:{}),
            ...(sequence%50===0||sequence===1499?{sample:{time:game.matchTimeMs/1000,tips:game.rules.tips.red,position:robot.position,heading:sensors.orientation.yawRadians,payload:robot.payload,
              hives:observation.hives.map(h=>({id:h.id,angleRadians:2*Math.atan2(h.rotation.x,h.rotation.w),angularVelocity:h.angularVelocity.x})),
              elements:observation.elements.map(e=>({id:e.id,position:e.position,controlledBy:e.controlledBy,cells:game.rules.elements[e.id]?.cellMemberships??[]})),
            }}:{})};
        }
        ticks.push(tick);peakPayload=Math.max(peakPayload,tick.payload.length);
        for(const id of tick.payload)collected.add(id);
        if(tick.sample)samples.push({...tick.sample,telemetry:reply.frame.telemetry});
      }
      if(replaying){
        const end=cached!.checkpoints.get(1500);
        if(!end)throw new ReplayMismatch("No final checkpoint available");
        game.restore(unpackSnapshot(end));
      }
      const final=packSnapshot(game.snapshot());checkpoints.set(1500,final);checkpointBytes+=final.byteLength;
      const stop=await this.command({command:"stop"});
      stopped=true;
      stoppedNeutral=Boolean(stop.frame)&&Object.values(stop.frame!.motors).every(m=>m.power===0&&(m.velocitySetpointTicksPerSecond==null||m.velocitySetpointTicksPerSecond===0));
      const own=game.rules.robots["red-1"];
      const nectar=[...collected].filter(id=>id.startsWith("nectar"));
      const parked=Boolean(own?.loadingZoneOverlap);
      const payloadChanges=ticks.flatMap((tick,index)=>index===0||JSON.stringify(tick.payload)!==JSON.stringify(ticks[index-1]!.payload)
        ?[{time:(index+1)*20/1000,payload:tick.payload}]:[]);
      this.trace={key:traceKey,initSensors,ticks,checkpoints};
      return {seed,sourceDigest,entryClass,compileKind,compileMs,wallMs:Math.round(performance.now()-start),
        reusedPrefixSeconds:reusedTicks*.02,physicsTicksExecuted:physicsTicks,checkpointBytes,
        simulatedSeconds:game.matchTimeMs/1000,tips:game.rules.tips.red,score:game.rules.scores.red,parked,stoppedNeutral,peakPayload,collected:[...collected],collectedNectar:nectar,
        valid:stoppedNeutral&&nectar.length===0&&peakPayload<=4&&game.matchTimeMs<=30000,scoreBreakdown:game.rules.scoreBreakdown.red,samples,payloadChanges,flightPaths:ticks.flatMap(t=>t.flight?[t.flight]:[])};
    }finally{
      try{if(!stopped)await this.command({command:"stop"});}
      catch{if(this.prepared)await this.sessions.close(this.prepared.id,true);this.prepared=undefined;}
    }
  }
  private next(){return `trial-${++this.sequence}`;}
  private async command(body:Record<string,unknown>){
    if(!this.prepared)throw new Error("No compiled trial program");
    const reply=await this.sessions.command(this.prepared.id,{protocolVersion:3,requestId:this.next(),...body} as OpModeClientMessage);
    if(reply.type!=="response")throw new Error("Unexpected trial response");
    if(reply.status==="error")throw new Error(`${reply.error.code}: ${reply.error.message}`);
    if(reply.status!=="ok")throw new Error("Unexpected asynchronous build response");
    return reply;
  }
}
