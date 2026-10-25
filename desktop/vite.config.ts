import { defineConfig } from "vite";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
export default defineConfig({
  root: resolve(root,"desktop"), publicDir: false,
  plugins: [{name:"desktop-local-contracts",enforce:"pre",resolveId(source){
    if(source.endsWith("/temporary-account-menu"))return resolve(root,"desktop/compat/local-account-menu.tsx");
  }}],
  resolve: {alias: [
    {find:"@/lib/opmode-session",replacement:resolve(root,"desktop/src/client-session.ts")},
    {find:"next/navigation",replacement:resolve(root,"desktop/compat/navigation.ts")},
    {find:"next/dynamic",replacement:resolve(root,"desktop/compat/dynamic.tsx")},
    {find:"next/link",replacement:resolve(root,"desktop/compat/link.tsx")},
    {find:"next/image",replacement:resolve(root,"desktop/compat/image.tsx")},
    {find:"buffer",replacement:resolve(root,"node_modules/.bun/node_modules/buffer/index.js")},
    {find:"@",replacement:resolve(root,"src")},
    {find:"@ftc-studio/sim-core",replacement:resolve(root,"packages/ftc-sim-core/src/index.ts")},
    {find:"@ftc-studio/opmode-protocol",replacement:resolve(root,"packages/opmode-protocol/src/index.ts")},
  ],dedupe:["react","react-dom","three"]},
  define:{"process.env.NODE_ENV":JSON.stringify("production")},
  build:{outDir:"dist",target:"es2022",chunkSizeWarningLimit:2500},
});
