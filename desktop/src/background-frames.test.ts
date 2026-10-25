import {test, expect} from "bun:test";
import {createBackgroundFrameClock} from "./background-frames";

function setup() {
  let id=0, hidden=false, visibility=()=>{};
  const frames=new Map<number,FrameRequestCallback>(), timers=new Map<number,()=>void>();
  const clock=createBackgroundFrameClock({
    request(callback){frames.set(++id,callback);return id;},cancel(id){frames.delete(id);},
    schedule(callback){timers.set(++id,callback);return id;},clear(id){timers.delete(id);},
    now:()=>1234,hidden:()=>hidden,onVisibilityChange(callback){visibility=callback;return()=>{visibility=()=>{};};},
  });
  return {clock,frames,timers,hide(){hidden=true;visibility();},show(){hidden=false;visibility();}};
}

test("an outstanding visible frame advances after occlusion, exactly once",()=>{
  const host=setup(),times:number[]=[];
  host.clock.request(time=>times.push(time));expect(host.timers.size).toBe(0);
  const native=[...host.frames.values()][0]!;
  host.hide();expect(host.timers.size).toBe(1);
  [...host.timers.values()][0]!();native(1240);
  expect(times).toEqual([1234]);expect(host.frames.size).toBe(0);expect(host.timers.size).toBe(0);
  host.clock.dispose();
});

test("cancellation and disposal remove hidden callbacks",()=>{
  const host=setup(),calls:number[]=[];host.hide();
  const id=host.clock.request(time=>calls.push(time));
  const timer=[...host.timers.values()][0]!;host.clock.cancel(id);timer();
  expect(calls).toEqual([]);expect(host.frames.size+host.timers.size).toBe(0);
  host.clock.request(time=>calls.push(time));host.clock.dispose();
  expect(host.frames.size+host.timers.size).toBe(0);
});

test("foreground frames use the native display timestamp and clear the fallback",()=>{
  const host=setup(),times:number[]=[];host.hide();host.clock.request(time=>times.push(time));
  host.show();expect(host.timers.size).toBe(0);
  [...host.frames.values()][0]!(42);
  expect(times).toEqual([42]);expect(host.frames.size).toBe(0);host.clock.dispose();
});
