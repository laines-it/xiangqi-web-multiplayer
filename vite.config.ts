import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/xiangqi-web-multiplayer/",
  plugins: [react()],
});
