import {test,expect} from "bun:test";
import {packSnapshot,unpackSnapshot} from "./trial-replay";
import type {GameSnapshot} from "../../packages/ftc-sim-core/src/game-simulation";

test("compressed checkpoints preserve every physics byte and game state",()=>{
  const base=Uint8Array.from({length:4099},(_,i)=>i%251),original=new Uint8Array(base);
  for(const size of [17,4099,4111]){
    const physics=new Uint8Array(size);physics.set(base.subarray(0,Math.min(size,base.length)));physics[3]^=37;physics[size-1]^=19;
    const snapshot={world:{physics},rules:{scores:{red:28}},phase:"auto"} as GameSnapshot;
    expect(unpackSnapshot(packSnapshot(snapshot))).toEqual(snapshot);
  }
  expect(base).toEqual(original);
});
