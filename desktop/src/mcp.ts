import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// The key stays inside this process. stdout carries MCP messages only.
async function request(path:string,body:Record<string,unknown>={}):Promise<Record<string,unknown>>{
  const connection=JSON.parse(await readFile(resolve(homedir(),"Library/Application Support/FTC Simulator Desktop/connection.json"),"utf8")) as {port:number;token:string};
  if(!Number.isInteger(connection.port)||connection.port<1||connection.port>65535||typeof connection.token!=="string"||connection.token.length<24)throw new Error("Open FTC Simulator Desktop to create a local connection");
  const response=await fetch(`http://127.0.0.1:${connection.port}/desktop${path}`,{method:"POST",redirect:"error",headers:{"content-type":"application/json",authorization:`Bearer ${connection.token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(245_000)});
  const result=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"The local simulator operation failed");
  return result;
}
const output=(value:Record<string,unknown>):CallToolResult=>({content:[{type:"text",text:JSON.stringify(value,null,2)}],structuredContent:value});
async function respond(work:()=>Promise<Record<string,unknown>>):Promise<CallToolResult>{
  try{return output(await work());}catch(error){return {isError:true,content:[{type:"text",text:error instanceof Error?error.message:String(error)}]};}
}
const readonly={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const localWrite={readOnlyHint:false,destructiveHint:false,openWorldHint:false};
const server=new McpServer({name:"ftcsim-desktop",version:"0.1.0"},{maxToolInputElements:1024});
type File={path:string;text?:string;base64:string};
async function workspace(){return await request("/workspace",{trackEditor:false}) as {id:string;name:string;directory:string;revision:string;files:File[]};}

server.registerTool("simulator_status",{description:"Read the live editor state, compiler diagnostics, Run log, simulation time, telemetry, and current motor commands.",annotations:readonly},()=>respond(()=>request("/automation/request",{action:"status"})));
server.registerTool("project_files",{description:"List files in the current local FTC project. Returns the project revision without binary file contents.",annotations:readonly},()=>respond(async()=>{const w=await workspace();return {...w,files:w.files.map(f=>({path:f.path,text:f.text!==undefined,bytes:Buffer.from(f.base64,"base64").byteLength}))};}));
server.registerTool("read_file",{description:"Read a project text file and its SHA-256. Use that hash for a checked disk edit.",inputSchema:{path:z.string().min(1).max(4096)},annotations:readonly},args=>respond(async()=>{
  const file=(await workspace()).files.find(f=>f.path===args.path);
  if(!file||file.text===undefined)throw new Error("Project text file was not found");
  return {path:file.path,content:file.text,sha256:createHash("sha256").update(file.text).digest("hex")};
}));
const expectedSha256=z.string().regex(/^[a-f0-9]{64}$/).nullable();
server.registerTool("write_file",{description:"Write a complete UTF-8 project file atomically. Supply its last SHA-256, or null to create a new file. Concurrent edits are rejected. Call editor_control reload to display disk edits.",inputSchema:{path:z.string().min(1).max(4096),content:z.string().max(16*1024*1024),expectedSha256},annotations:localWrite},args=>respond(()=>request("/workspace/edit",args)));
server.registerTool("patch_file",{description:"Replace one exact occurrence in a project file on disk. A SHA-256 check protects concurrent edits. Use editor_patch instead when testing live Hot Reload.",inputSchema:{path:z.string().min(1).max(4096),search:z.string().min(1),replacement:z.string(),expectedSha256},annotations:localWrite},args=>respond(()=>request("/workspace/edit",args)));
server.registerTool("editor_patch",{description:"Apply one exact replacement through the actual editor and autosave pipeline. This triggers the same Hot Reload as typing. Use simulator_status to check save/compiler/restart results.",inputSchema:{path:z.string().min(1).max(4096),search:z.string().min(1),replacement:z.string()},annotations:localWrite},args=>respond(()=>request("/automation/request",{action:"edit",args})));
server.registerTool("editor_control",{description:"Run, stop, build, reload, show, hide, or quit the actual app editor. Run reuses its loaded build. Build runs the full Gradle build. Read simulator_status after the action to check the final state.",inputSchema:{action:z.enum(["run","stop","build","reload","show","hide","quit"])},annotations:localWrite},args=>respond(()=>request("/automation/request",args)));
server.registerTool("build_project",{description:"Compile the current disk sources using the evaluator's warm compiler. The first build and build-configuration edits use Gradle. Returns real OpMode discovery and compiler timing without running physics.",annotations:localWrite},()=>respond(()=>request("/build")));
server.registerTool("evaluate_autonomous",{description:"Run 30 simulated seconds with real Java and fixed 5 ms physics. Red/Near, idle other robots. Unchanged actuator prefixes can reuse deterministic physics. Set full=true for a fresh reference trial. Returns score, tips, park, capacity, STOP checks, timing, and trialId.",inputSchema:{seed:z.number().int().safe().optional(),entryClass:z.string().optional(),full:z.boolean().optional()},annotations:localWrite},args=>respond(async()=>{
  const {full,...options}=args;
  const {samples,flightPaths,payloadChanges,...result}=await request("/evaluate",{...options,...(full?{replay:false}:{})});
  return {...result,sampleCount:Array.isArray(samples)?samples.length:0};
}));
server.registerTool("get_trial",{description:"View a completed autonomous result, recorded path, collected elements, and one-second Java telemetry samples with actual hive angles, element positions and cell occupancy. Set includeFlightPaths to inspect pollen flight at 20 ms intervals. The app keeps its last 12 trials in memory. Omit trialId for the newest result.",inputSchema:{trialId:z.string().optional(),includeSamples:z.boolean().optional(),includeFlightPaths:z.boolean().optional()},annotations:readonly},args=>respond(async()=>{
  const result=await request("/trials/get",{trialId:args.trialId});
  if(!args.includeFlightPaths)delete result.flightPaths;
  if(args.includeSamples===false)delete result.samples;
  return result;
}));
server.registerTool("simulator_view",{description:"Return a PNG of the app's current simulator/editor view using its native WebKit snapshot API. Requires no mouse, keyboard, browser driver, or computer-use tool.",annotations:readonly},async()=>{
  try{
    const result=await request("/automation/request",{action:"snapshot"});
    if(typeof result.base64!=="string")throw new Error("The app returned no view");
    return {content:[{type:"image" as const,data:result.base64,mimeType:"image/png"}]};
  }catch(error){return {isError:true,content:[{type:"text" as const,text:error instanceof Error?error.message:String(error)}]};}
});
await server.connect(new StdioServerTransport());
