import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { homedir } from "node:os";
import { resolve } from "node:path";

// A small protocol client for shell-only agent hosts and reproducible examples.
const resources=resolve(homedir(),"Applications/FTC Simulator Desktop.app/Contents/Resources");
const client=new Client({name:"ftcsim-desktop-cli",version:"0.1.0"});
await client.connect(new StdioClientTransport({command:resolve(resources,"bin/bun"),args:[resolve(resources,"desktop/mcp.js")],stderr:"inherit"}));
try{
  const tool=process.argv[2];
  if(!tool)console.log(JSON.stringify(await client.listTools(),null,2));
  else{
    const result=await client.callTool({name:tool,arguments:JSON.parse(process.argv[3]??"{}")},undefined,{timeout:250_000});
    for(const content of result.content as Array<{type:string;text?:string;data?:string}>){
      if(content.type==="text")console.log(content.text);
      else if(content.type==="image"&&content.data){
        const path=process.argv[4];if(!path)throw new Error("Pass an output .png path as the fourth argument to save the view");
        await Bun.write(path,Buffer.from(content.data,"base64"));console.log(JSON.stringify({image:path}));
      }
    }
    if(result.isError)process.exitCode=1;
  }
}finally{await client.close();}
