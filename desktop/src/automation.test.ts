import { test, expect } from "bun:test";
import { EditorAutomation } from "./automation";

test("editor automation delivers each command once and forwards real failures",async()=>{
  const automation=new EditorAutomation();
  expect(()=>automation.request("arbitrary-script")).toThrow("Unknown editor action");
  const done=automation.request("status"),command=automation.poll()!;
  expect(command.action).toBe("status");expect(automation.poll()).toBeNull();
  automation.complete(command.id,{running:true});
  expect(await done).toEqual({running:true});
  const failed=automation.request("edit"),edit=automation.poll()!;
  automation.complete(edit.id,null,"Source conflict");
  await expect(failed).rejects.toThrow("Source conflict");
});
