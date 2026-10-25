import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { JavaHost } from "../src/java-host";
import { spawnSync } from "node:child_process";

const hostClasses=resolve(import.meta.dirname,"../.cache/host");
await mkdir(hostClasses,{recursive:true});
const hostCompile=spawnSync("javac",["--release","17","-d",hostClasses,resolve(import.meta.dirname,"../java/DesktopHost.java")],{stdio:"inherit"});
if(hostCompile.status!==0)throw new Error("Could not compile the desktop test host with JDK 17");
process.env.FTC_DESKTOP_HOST_CLASSES=hostClasses;

// Run as a standalone Bun program: the macOS Bun test runner loses subprocess pipes.
// Upstream: https://github.com/oven-sh/bun/issues/46326.
const directory=await mkdtemp(resolve(tmpdir(),"ftc-desktop-host-"));
const source=resolve(directory,"org/firstinspires/ftc/sim/PersistentOpModeRunnerCli.java");
await mkdir(resolve(directory,"org/firstinspires/ftc/sim"),{recursive:true});
const compiler=new JavaHost(),runtime=new JavaHost();
const code=(extra:string,value:string)=>`package org.firstinspires.ftc.sim;import java.io.*;public class PersistentOpModeRunnerCli{static int count=0;${extra}public static void runForDesktop(String[] args,InputStream input,OutputStream output)throws Exception{BufferedReader r=new BufferedReader(new InputStreamReader(input));PrintStream out=new PrintStream(output,true);String line;while((line=r.readLine())!=null){out.println(${value}+":"+(++count));}}}`;
const times:number[]=[];
try{
  await writeFile(source,code("","35"));
  assert.equal((await compiler.request("COMPILE",[directory,"--release","8","-d",directory,source])).exitCode,0);
  for(let i=0;i<2;i++){
    assert.equal((await runtime.request("OPEN",[directory])).exitCode,0);
    assert.equal((await runtime.request("FRAME",["tick"])).stdout,"35:1");
    assert.equal((await runtime.request("DISPOSE",[])).exitCode,0);
  }
  for(const value of [45,46,47]){
    await writeFile(source,code(`static int added=${value};`,"added"));
    const started=performance.now();
    assert.equal((await compiler.request("COMPILE",[directory,"--release","8","-d",directory,source])).exitCode,0);
    await runtime.request("OPEN",[directory]);
    assert.equal((await runtime.request("FRAME",["tick"])).stdout,`${value}:1`);
    times.push(Math.round(performance.now()-started));
    await runtime.request("DISPOSE",[]);
  }
  await writeFile(source,"public syntax error");
  const broken=await compiler.request("COMPILE",[directory,"--release","8","-d",directory,source]);
  assert.equal(broken.exitCode,1);assert.match(broken.stderr,/error:/);
  await writeFile(source,code("","55"));
  assert.equal((await compiler.request("COMPILE",[directory,"--release","8","-d",directory,source])).exitCode,0);
  await runtime.request("OPEN",[directory]);
  assert.equal((await runtime.request("FRAME",["tick"])).stdout,"55:1");
  await runtime.request("DISPOSE",[]);
  const sleeper=resolve(directory,"Sleeper.java");
  await writeFile(sleeper,'public class Sleeper{public static void main(String[] a)throws Exception{Thread.sleep(2000);System.out.print("late");}}');
  assert.equal((await compiler.request("COMPILE",[directory,"--release","8","-d",directory,sleeper])).exitCode,0);
  await assert.rejects(runtime.request("INVOKE",[directory,"Sleeper"],80),/deadline/);
  assert.equal(runtime.closed,true);
  await assert.rejects(runtime.request("INVOKE",[directory,"Sleeper"]),/closed/);
  console.log(JSON.stringify({status:"PASS",cases:["real compilation","static-state isolation","structural field additions","compile error recovery","deadline kills stalled host","late-result rejection"],editToRuntimeMs:times}));
}finally{compiler.close();runtime.close();await rm(directory,{recursive:true,force:true});}
