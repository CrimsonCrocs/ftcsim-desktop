import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";

export type DesktopFile = { path: string; base64: string; text?: string };
const ignored = new Set([".git", ".gradle", "build", "node_modules", "dist", ".DS_Store"]);
const digest = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");

export class DesktopWorkspace {
  private directories = new Map<string, string>();
  private saved = new Map<string, Map<string, string>>();
  constructor(private directory: string, private readonly projectsDirectory: string) {}

  async open(directory: string): Promise<void> {
    const resolved = await realpath(resolve(directory));
    const manifest = JSON.parse(await readFile(resolve(resolved, "ftcsim.project.json"), "utf8"));
    if (!manifest || typeof manifest !== "object") throw new Error("Select an FTC Simulator project folder");
    this.directory = resolved;
  }
  get path(): string { return this.directory; }
  get id(): string {
    const h = digest(this.directory);
    return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
  }
  async edit(path:string,expectedSha256:string|null,change:{content:string}|{search:string;replacement:string}){
    const target=safePath(this.directory,path);
    await rejectSymlinks(this.directory,path);
    let current:string|undefined;
    try{current=await readFile(target,"utf8");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    if((current===undefined?null:digest(current))!==expectedSha256)throw new Error(`${path} changed. Read it again before editing.`);
    let content:string;
    if("content" in change)content=change.content;
    else{
      if(!change.search||current===undefined)throw new Error("Patch needs an existing file and a nonempty search");
      const index=current.indexOf(change.search);
      if(index<0||current.indexOf(change.search,index+change.search.length)>=0)throw new Error("Patch search must match exactly once");
      content=current.slice(0,index)+change.replacement+current.slice(index+change.search.length);
    }
    if(Buffer.byteLength(content)>16*1024*1024)throw new Error("Source file exceeds 16 MB");
    await mkdir(dirname(target),{recursive:true});
    const temporary=`${target}.desktop-tmp-${crypto.randomUUID()}`;
    await writeFile(temporary,content);await rename(temporary,target);
    return {path,sha256:digest(content),bytes:Buffer.byteLength(content)};
  }
  async snapshot(trackEditor = true) {
    const files: DesktopFile[] = [];
    let bytes = 0;
    const walk = async (directory: string): Promise<void> => {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        if (ignored.has(item.name) || item.name.includes(".desktop-tmp-")) continue;
        const path = resolve(directory, item.name);
        if (item.isDirectory()) await walk(path);
        else if (item.isFile()) {
          const data = await readFile(path); bytes += data.length;
          if (files.length >= 512 || bytes > 32 * 1024 * 1024) throw new Error("Project exceeds the supported 512-file / 32 MB source snapshot");
          const text = data.includes(0) ? undefined : data.toString("utf8");
          files.push({ path: relative(this.directory, path).split(sep).join("/"), base64: data.toString("base64"), ...(text !== undefined ? { text } : {}) });
        }
      }
    };
    await walk(this.directory);
    files.sort((a,b) => a.path.localeCompare(b.path));
    const manifest = JSON.parse(files.find(f => f.path === "ftcsim.project.json")?.text ?? "{}");
    const name = typeof manifest.name === "string" ? manifest.name : basename(this.directory);
    this.directories.set(this.id, this.directory);
    if(trackEditor)this.saved.set(this.id, new Map(files.filter(f => f.text !== undefined).map(f => [f.path, digest(f.text!)])));
    return { id: this.id, name, directory: this.directory, files, revision: digest(files.map(f => `${f.path}:${digest(f.base64)}`).join("\n")) };
  }

  async save(id: string, files: Record<string, string>): Promise<void> {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("Invalid project id");
    let directory = this.directories.get(id);
    if (!directory) {
      directory = resolve(this.projectsDirectory, id); await mkdir(directory, { recursive: true });
      this.directories.set(id, directory);
    }
    const previous = this.saved.get(id) ?? new Map<string, string>();
    const next = new Map(previous);
    for (const [path, content] of Object.entries(files)) {
      if (typeof content !== "string" || Buffer.byteLength(content) > 16 * 1024 * 1024) throw new Error("Invalid source file");
      const target = safePath(directory, path);
      await rejectSymlinks(directory, path);
      const hash = digest(content);
      let current: string | undefined;
      try { current = digest(await readFile(target)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (current === hash) { next.set(path, hash); continue; }
      if (hash === previous.get(path)) continue; // Preserve an external edit to an unchanged editor buffer.
      if (current !== undefined && previous.has(path) && current !== previous.get(path)) throw new Error(`${path} changed on disk. Reload the project before editing it again.`);
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.desktop-tmp-${crypto.randomUUID()}`;
      await writeFile(temporary, content); await rename(temporary, target); next.set(path, hash);
    }
    for (const [path, oldHash] of previous) if (!Object.hasOwn(files, path)) {
      const target = safePath(directory, path);
      await rejectSymlinks(directory, path);
      try {
        if (digest(await readFile(target)) !== oldHash) throw new Error(`${path} changed on disk; it was preserved.`);
        await unlink(target); next.delete(path);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    this.saved.set(id, next);
  }
}

async function rejectSymlinks(root: string, path: string): Promise<void> {
  let target = root;
  for (const part of path.split("/")) {
    target = resolve(target, part);
    try {
      if ((await lstat(target)).isSymbolicLink()) throw new Error("Source paths cannot contain symbolic links");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

function safePath(root: string, path: string): string {
  if (!path || path.includes("\\") || path.includes("\0") || path.split("/").some(p => !p || p === "." || p === ".." || ignored.has(p))) throw new Error("Invalid project path");
  const target = resolve(root, path);
  if (!target.startsWith(root + sep)) throw new Error("Source path leaves the project");
  return target;
}
