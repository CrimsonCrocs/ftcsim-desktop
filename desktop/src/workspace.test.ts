import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DesktopWorkspace } from "./workspace";
import { createHash } from "node:crypto";

test("desktop saves are atomic, preserve external edits, and reject conflicting or escaping paths",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"ftc-desktop-files-"));
  const workspace=new DesktopWorkspace(root,resolve(root,"other-projects"));
  try{
    await writeFile(resolve(root,"ftcsim.project.json"),'{"name":"Test"}');
    await writeFile(resolve(root,"Auto.java"),"first");
    const snapshot=await workspace.snapshot();
    await workspace.save(snapshot.id,{"Auto.java":"second","ftcsim.project.json":'{"name":"Test"}'});
    expect(await readFile(resolve(root,"Auto.java"),"utf8")).toBe("second");
    await writeFile(resolve(root,"Auto.java"),"external");
    await workspace.save(snapshot.id,{"Auto.java":"second","ftcsim.project.json":'{"name":"Test"}'});
    expect(await readFile(resolve(root,"Auto.java"),"utf8")).toBe("external");
    await expect(workspace.save(snapshot.id,{"Auto.java":"conflict"})).rejects.toThrow("changed on disk");
    await expect(workspace.save(snapshot.id,{"../escape.java":"bad"})).rejects.toThrow("Invalid project path");
    await workspace.snapshot(false);
    await expect(workspace.save(snapshot.id,{"Auto.java":"conflict"})).rejects.toThrow("changed on disk");
    await symlink(resolve(root,"Auto.java"), resolve(root,"Link.java"));
    await expect(workspace.save(snapshot.id,{"Link.java":"overwrite"})).rejects.toThrow("symbolic links");
    expect(await readFile(resolve(root,"Auto.java"),"utf8")).toBe("external");
  }finally{await rm(root,{recursive:true,force:true});}
});

test("MCP edits require the current source hash and one exact patch match",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"ftc-desktop-mcp-edit-"));
  const workspace=new DesktopWorkspace(root,root),hash=(s:string)=>createHash("sha256").update(s).digest("hex");
  try{
    await writeFile(resolve(root,"Auto.java"),"power=0.4;");
    await expect(workspace.edit("Auto.java",hash("stale"),{content:"bad"})).rejects.toThrow("changed");
    await expect(workspace.edit("../escape",null,{content:"bad"})).rejects.toThrow("Invalid project path");
    const result=await workspace.edit("Auto.java",hash("power=0.4;"),{search:"0.4",replacement:"0.41"});
    expect(result.sha256).toBe(hash("power=0.41;"));
    await expect(workspace.edit("Auto.java",result.sha256,{search:"missing",replacement:"bad"})).rejects.toThrow("exactly once");
    expect(await readFile(resolve(root,"Auto.java"),"utf8")).toBe("power=0.41;");
    await workspace.edit("New.java",null,{content:"new"});
    await expect(workspace.edit("New.java",null,{content:"overwrite"})).rejects.toThrow("changed");
  }finally{await rm(root,{recursive:true,force:true});}
});
