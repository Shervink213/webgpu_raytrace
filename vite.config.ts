import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    base: "/webgpu_raytrace/",
    plugins: [
        rawPlugin({
            fileRegex: /\.wgsl$/,
        }),
    ],
});
