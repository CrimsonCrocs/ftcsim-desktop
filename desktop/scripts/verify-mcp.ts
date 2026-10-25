import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Opt-in: exercises the installed app and edits one numeric literal reversibly.
const resources=resolve(homedir(),"Applications/FTC Simulator Desktop.app/Contents/Resources");
const out=resolve(process.argv[2]??"desktop/.cache/mcp-verification");await mkdir(out,{recursive:true});
const client=new Client({name:"ftcsim-desktop-verification",version:"0.1.0"});
await client.connect(new StdioClientTransport({command:resolve(resources,"bin/bun"),args:[resolve(resources,"desktop/mcp.js")],stderr:"inherit"}));
type Data=Record<string,any>;
async function call(name:string,args:Record<string,unknown>={}):Promise<Data>{
  const result=await client.callTool({name,arguments:args},undefined,{timeout:250_000});
  const text=(result.content as Array<{type:string;text?:string}>).filter(c=>c.type==="text").map(c=>c.text).join("\n");
  if(result.isError)throw new Error(text);
  return result.structuredContent??JSON.parse(text);
}
async function until(check:(s:Data)=>boolean,label:string,timeout=45_000):Promise<Data>{
  const started=performance.now();let status:Data={};
  while(performance.now()-started<timeout){status=await call("simulator_status");if(check(status))return status;await new Promise(r=>setTimeout(r,300));}
  throw new Error(`${label}: ${JSON.stringify(status)}`);
}
const path="TeamCode/src/main/java/org/firstinspires/ftc/teamcode/RedPollenAuto.kt";
const original=await call("read_file",{path});
const literal=original.content.match(/FLYWHEEL_FRACTION = (0\.\d+)/);
assert.ok(literal,"The selected project must expose its opening flywheel fraction");
const originalLiteral=literal[0];
const changedLiteral=`FLYWHEEL_FRACTION = ${(Number(literal[1])+.001).toFixed(3)}`;
const invalidLiteral="FLYWHEEL_FRACTION = invalid_literal";
const evidence:Data={};let edited=false;
try{
  const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==="simulator_view"));
  const conflict=await client.callTool({name:"patch_file",arguments:{path,search:originalLiteral,replacement:"bad",expectedSha256:"0".repeat(64)}});
  assert.equal(conflict.isError,true);assert.equal((await call("read_file",{path})).sha256,original.sha256);
  console.log(JSON.stringify({stage:"MCP connected",tools:tools.tools.length,conflictProtection:"PASS"}));
  await until(s=>s.fieldReady&&s.view.editorCharacters>0&&s.view.canvases.some((c:Data)=>c.width>100&&c.height>100)&&!s.view.busyRegions.includes("Loading field"),"Editor and field render while occluded");
  await call("editor_control",{action:"build"});
  await until(s=>s.buildState.status==="succeeded","UI build",120_000);
  const firstRun=performance.now();await call("editor_control",{action:"run"});
  await until(s=>s.opModeState==="running"&&s.simulationTimeMs>200,"Run advances physics");
  evidence.firstRunMs=Math.round(performance.now()-firstRun);
  console.log(JSON.stringify({stage:"UI running",...evidence}));
  const editedAt=performance.now();edited=true;
  const before=await call("simulator_status");const previousRestarts=before.runLog.filter((l:string)=>l.includes("Hot Reload restarted")).length;
  await call("editor_patch",{path,search:originalLiteral,replacement:changedLiteral});
  await call("editor_control",{action:"hide"});
  const hot=await until(s=>s.opModeState==="running"&&s.runLog.filter((l:string)=>l.includes("Hot Reload restarted")).length>previousRestarts,"Hot Reload");
  assert.equal(hot.documentVisible,false,"The restart must finish with the app hidden");
  const hidden=await until(s=>!s.documentVisible&&s.simulationTimeMs>hot.simulationTimeMs+400,"Hidden app physics advances");
  evidence.hiddenRun={fromMs:hot.simulationTimeMs,toMs:hidden.simulationTimeMs};
  evidence.editToRestartMs=Math.round(performance.now()-editedAt);evidence.hotReloadLog=hot.runLog.filter((l:string)=>l.includes("Hot Reload")).slice(-3);
  console.log(JSON.stringify({stage:"Hot Reload passed",editToRestartMs:evidence.editToRestartMs,log:evidence.hotReloadLog}));
  await call("editor_patch",{path,search:changedLiteral,replacement:invalidLiteral});
  const broken=await until(s=>s.opModeState==="stopped"&&s.buildState.title==="Hot Reload failed","Compile error stops runtime");
  assert.ok(Object.keys(broken.actuators?.motors??{}).length>0,"Compile failure must retain observable motor output");
  assert.ok(Object.values(broken.actuators?.motors??{}).every((m:any)=>m.power===0));
  evidence.compileFailure=broken.buildState;evidence.errorNeutral=true;
  const prior=broken.runLog.filter((l:string)=>l.includes("Hot Reload restarted")).length;
  await call("editor_patch",{path,search:invalidLiteral,replacement:originalLiteral});
  await until(s=>s.opModeState==="running"&&s.runLog.filter((l:string)=>l.includes("Hot Reload restarted")).length>prior,"Compile error recovery");
  edited=false;assert.equal((await call("read_file",{path})).sha256,original.sha256);
  await call("editor_control",{action:"stop"});
  const stopped=await until(s=>s.opModeState==="stopped","STOP");
  assert.ok(Object.keys(stopped.actuators?.motors??{}).length>0,"STOP must retain observable motor output");
  assert.ok(Object.values(stopped.actuators?.motors??{}).every((m:any)=>m.power===0));
  const builds=stopped.runLog.filter((line:string)=>line.includes("BUILD SUCCESSFUL")).length;
  const rewind=performance.now();await call("editor_control",{action:"rewind"});
  const rewound=await until(s=>s.fieldReady&&s.simulationTimeMs<2000,"Field rewind");
  assert.equal(rewound.buildState.status,"succeeded");
  assert.equal(rewound.runLog.filter((line:string)=>line.includes("BUILD SUCCESSFUL")).length,builds);
  assert.equal(rewound.rehearsalSeed,20261024);
  evidence.rewindMs=Math.round(performance.now()-rewind);
  const restart=performance.now();await call("editor_control",{action:"run"});
  await until(s=>s.opModeState==="running"&&s.simulationTimeMs>200,"Run without build");
  evidence.runWithoutBuildMs=Math.round(performance.now()-restart);
  await call("editor_control",{action:"stop"});
  await until(s=>s.opModeState==="stopped","Final STOP");
  await call("editor_control",{action:"rewind"});
  await until(s=>s.fieldReady&&s.simulationTimeMs<2000,"Final field rewind");
  await call("editor_control",{action:"show"});
  const chrome=await call("simulator_status");
  assert.equal(chrome.toolbar.evaluateEnabled,true);
  assert.ok(chrome.toolbar.visibleItems.includes("evaluate"));
  assert.ok(chrome.toolbar.projectPath.endsWith("/Red Pollen Auto"));
  await call("editor_control",{action:"evaluate"});
  const busy=await until(s=>s.toolbar.evaluateTitle==="Evaluating…","Native Evaluate busy state");
  assert.equal(busy.toolbar.evaluateEnabled,false);
  const duplicate=await client.callTool({name:"editor_control",arguments:{action:"evaluate"}});
  assert.equal(duplicate.isError,true,"A second Evaluate must not start while busy");
  const evaluated=await until(s=>s.toolbar.evaluateEnabled&&s.toolbar.evaluation.length>0,"Native Evaluate result",120_000);
  assert.equal(evaluated.toolbar.evaluation,"4 tips · Parked · 88 pts");
  evidence.nativeEvaluation=evaluated.toolbar;
  const trial=await call("get_trial",{includeFlightPaths:true});
  await Bun.write(resolve(out,"native-evaluation.json"),JSON.stringify(trial,null,2));
  await call("editor_control",{action:"resize",width:900,height:600});
  const compact=await call("simulator_status");
  assert.equal(compact.windowSize.width,900);assert.ok(compact.toolbar.visibleItems.includes("evaluate"));
  assert.ok(compact.toolbar.visibleItems.includes("evaluation-result"),"The result must fit at minimum width");
  const compactView=await client.callTool({name:"simulator_view",arguments:{}});
  const compactPng=(compactView.content as Array<{type:string;data?:string}>).find(c=>c.type==="image");assert.ok(compactPng?.data);
  await Bun.write(resolve(out,"simulator-compact.png"),Buffer.from(compactPng.data,"base64"));
  await call("editor_control",{action:"resize",...chrome.windowSize});
  const view=await client.callTool({name:"simulator_view",arguments:{}});
  assert.ok(!view.isError);
  const png=(view.content as Array<{type:string;data?:string}>).find(c=>c.type==="image");assert.ok(png?.data);
  await Bun.write(resolve(out,"simulator.png"),Buffer.from(png.data,"base64"));
  evidence.status="PASS";evidence.cases=["MCP discovery","checked source writes","real UI build/run","physics advances","hidden-window Hot Reload and physics","compile failure neutralizes motors","compile error recovery","field rewind retains build and seed","Run without build","STOP neutral","native Evaluate and duplicate protection","compact native toolbar","native whole-window view capture"];
  await Bun.write(resolve(out,"verification.json"),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}finally{
  if(edited){const current=await call("read_file",{path});await call("write_file",{path,content:original.content,expectedSha256:current.sha256}).catch(()=>undefined);}
  await call("editor_control",{action:"stop"}).catch(()=>undefined);
  await call("editor_control",{action:"show"}).catch(()=>undefined);
  await client.close();
}
