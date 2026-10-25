import { mkdir, readFile, readdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const root=resolve(import.meta.dirname,"../..");
const source=resolve(root,"desktop/build/FTC Simulator Desktop.app");
const target=resolve(homedir(),"Applications/FTC Simulator Desktop.app");
const backups=resolve(homedir(),"Library/Application Support/FTC Simulator Desktop/App Backups");
await readFile(resolve(source,"Contents/Info.plist"));
await mkdir(resolve(homedir(),"Applications"),{recursive:true});
await mkdir(backups,{recursive:true});
// Keep reversible backups outside Launch Services' application inventory.
for(const name of await readdir(resolve(homedir(),"Applications")))if(/^\.FTC Simulator Desktop\.previous-\d+\.app$/.test(name)){
  const old=resolve(homedir(),"Applications",name);
  if((await readFile(resolve(old,"Contents/Info.plist"),"utf8")).includes("org.crimsoncrocs.ftc-simulator-desktop"))await rename(old,resolve(backups,name+"-backup"));
}
let backup:string|undefined;
try{
  const existing=await readFile(resolve(target,"Contents/Info.plist"),"utf8");
  if(!existing.includes("org.crimsoncrocs.ftc-simulator-desktop"))throw new Error("Another application already uses this name; it was left untouched.");
  backup=resolve(backups,`FTC Simulator Desktop-${Date.now()}.bundle-backup`);
  await rename(target,backup);
}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
const result=spawnSync("/bin/cp",["-cR",source,target],{stdio:"inherit"});
if(result.status!==0)throw new Error(`Desktop installation failed; the previous application is preserved at ${backup??"its original path"}.`);
console.log(JSON.stringify({status:"INSTALLED",path:target}));
