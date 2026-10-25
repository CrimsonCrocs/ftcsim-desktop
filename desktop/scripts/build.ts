import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, writeFile, stat, chmod, realpath } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { precompileShim } from "./precompile-shim";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const app=resolve(root,"desktop/build/FTC Simulator Desktop.app");
const contents=resolve(app,"Contents"),resources=resolve(contents,"Resources");
const started=performance.now();
const timings:Record<string,number>={};
const javaHome=process.env.FTC_DESKTOP_JDK??process.env.JAVA_HOME??spawnSync("/usr/libexec/java_home",["-v","17"],{encoding:"utf8"}).stdout?.trim();
const gradleHome=process.env.FTC_DESKTOP_GRADLE_HOME;
if(!javaHome)throw new Error("Set FTC_DESKTOP_JDK to a JDK 17 installation.");
if(!gradleHome)throw new Error("Set FTC_DESKTOP_GRADLE_HOME to an extracted Gradle 8.9 distribution.");
for(const path of [resolve(javaHome,"bin/java"),resolve(javaHome,"bin/javac"),resolve(gradleHome,"bin/gradle")])await stat(path);
function run(command:string,args:string[],cwd=root){
  const result=spawnSync(command,args,{cwd,stdio:"inherit"});
  if(result.status!==0)throw new Error(`${command} failed (${result.status})`);
}
async function clone(source:string,destination:string){
  await mkdir(dirname(destination),{recursive:true});
  let previous;
  try{previous=await stat(destination);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  if(previous){
    const current=await stat(source);
    if(current.isDirectory()){
      for(const name of await readdir(source))await clone(resolve(source,name),resolve(destination,name));
    }else if(current.size!==previous.size||Math.abs(current.mtimeMs-previous.mtimeMs)>1){
      const temporary=destination+".update-"+crypto.randomUUID();
      run("/bin/cp",["-cp",source,temporary]);await rename(temporary,destination);
    }
    return;
  }
  run("/bin/cp",["-cRp",source,destination]);
}
await mkdir(resolve(contents,"MacOS"),{recursive:true});
await mkdir(resolve(resources,"desktop"),{recursive:true});
let before=performance.now();
run(process.execPath,[resolve(root,"desktop/node_modules/vite/bin/vite.js"),"build","--config",resolve(root,"desktop/vite.config.ts")]);
timings.rendererMs=Math.round(performance.now()-before);
before=performance.now();
run("/usr/bin/xcrun",["clang","-fobjc-arc","-fblocks","-fno-modules","-O2","-mmacosx-version-min=14.0",resolve(root,"desktop/App.m"),"-o",resolve(contents,"MacOS/FTC Simulator Desktop"),"-framework","Cocoa","-framework","WebKit"]);
const nodeHeaders=process.env.FTC_DESKTOP_NODE_HEADERS??"/opt/homebrew/include/node";
await stat(resolve(nodeHeaders,"node_api.h"));
run("/usr/bin/xcrun",["clang","-dynamiclib","-undefined","dynamic_lookup","-DNAPI_VERSION=8","-O2","-mmacosx-version-min=14.0","-I",nodeHeaders,
  resolve(root,"desktop/work-policy.c"),"-o",resolve(resources,"desktop/scheduling.node")]);
timings.nativeMs=Math.round(performance.now()-before);
await mkdir(resolve(resources,"desktop/host"),{recursive:true});
run(resolve(javaHome,"bin/javac"),["--release","17","-d",resolve(resources,"desktop/host"),resolve(root,"desktop/java/DesktopHost.java")]);
run("/usr/bin/xcrun",["clang","-dynamiclib","-O2","-mmacosx-version-min=14.0","-I",resolve(javaHome,"include"),"-I",resolve(javaHome,"include/darwin"),
  resolve(root,"desktop/java/work-policy.c"),"-o",resolve(resources,"desktop/work-policy.dylib")]);
await precompileShim(javaHome,resolve(root,"runtime/java-sdk-shim/src/main/java"),resolve(resources,"desktop/precompiled-shim"));

// Preserve each original module's resource URL when bundling the existing local runner.
// This keeps SDK/adapters/debugger lookup identical inside the installed application.
for(const [entry,naming] of [["server.ts","backend.js"],["evaluator-worker.ts","evaluator-worker.js"],["mcp.ts","mcp.js"]]){
const built=await Bun.build({entrypoints:[resolve(root,"desktop/src",entry!)],outdir:resolve(resources,"desktop"),naming,target:"bun",minify:false,
  plugins:[{name:"desktop-resource-roots",setup(build){
  build.onResolve({filter:/^@ftc-studio\/sim-core$/},()=>({path:resolve(root,"packages/ftc-sim-core/src/index.ts")}));
  build.onLoad({filter:/\.[cm]?tsx?$/},async args=>{
    if(!args.path.startsWith(root+"/")||args.path.includes("/node_modules/"))return;
    const source=await readFile(args.path,"utf8");
    if(!source.includes("import.meta.url"))return;
    const path=relative(root,args.path);
    const declaration=`import {pathToFileURL as __ftcFileURL} from "node:url";const __ftcSourceURL=__ftcFileURL((process.env.FTC_DESKTOP_RESOURCE_ROOT??process.cwd())+"/"+${JSON.stringify(path)}).href;\n`;
    return {contents:declaration+source.replaceAll("import.meta.url","__ftcSourceURL"),loader:args.path.endsWith("tsx")?"tsx":"ts"};
  });}}]});
if(!built.success)throw new AggregateError(built.logs,"Desktop backend bundle failed");
}
await clone(resolve(root,"desktop/dist"),resolve(resources,"desktop/dist"));
for(const path of ["public","runtime/java-sdk-shim","runtime/java-library-adapters","runtime/java-debugger",
  "docs/sdk-surface-11.1.0.json",
  "services/java-runner/.runtime/ftc-sdk-11.1.0","services/java-runner/.runtime/android-sdk/platforms/android-30","services/java-runner/.runtime/kotlin-2.2.10"]){
  await clone(resolve(root,path),resolve(resources,path));
}
// Reuse the already-installed, licensed Android build tools. No SDK manager or license acceptance is run.
for(const path of ["build-tools/34.0.0","platforms/android-30","licenses"]){
  await clone(resolve(process.env.FTC_DESKTOP_ANDROID_SDK??resolve(process.env.HOME??"","Library/Android/sdk"),path),
    resolve(resources,"services/java-runner/.runtime/android-sdk",path));
}
await clone(await realpath(process.execPath),resolve(resources,"bin/bun"));
await chmod(resolve(resources,"bin/bun"),0o755);
await clone(await realpath(javaHome),resolve(resources,"toolchains/java"));
await clone(resolve(gradleHome),resolve(resources,"toolchains/gradle"));
await clone(resolve(root,"desktop/examples/Red Pollen Auto"),resolve(resources,"initial-project"));
await clone(resolve(root,"src/app/icon.png"),resolve(resources,"AppIcon.png"));
await clone(resolve(root,"desktop/CCC.md"),resolve(resources,"REFERENCE_NOTES.md"));
const plist={CFBundleName:"FTC Simulator Desktop",CFBundleDisplayName:"FTC Simulator Desktop",CFBundleIdentifier:"org.crimsoncrocs.ftc-simulator-desktop",
  CFBundleExecutable:"FTC Simulator Desktop",CFBundlePackageType:"APPL",CFBundleShortVersionString:"0.1.0",CFBundleVersion:"1",LSMinimumSystemVersion:"14.0",NSHighResolutionCapable:true,
  CFBundleIconFile:"AppIcon.png",NSAppTransportSecurity:{NSAllowsLocalNetworking:true},NSPrincipalClass:"NSApplication"};
await writeFile(resolve(contents,"Info.plist"),JSON.stringify(plist));
run("/usr/bin/plutil",["-convert","xml1",resolve(contents,"Info.plist")]);
run("/usr/bin/codesign",["--force","--sign","-",app]);
timings.totalMs=Math.round(performance.now()-started);
await writeFile(resolve(root,"desktop/build/build-timings.json"),JSON.stringify({app,timings},null,2));
console.log(JSON.stringify({status:"BUILT",app,timings}));
