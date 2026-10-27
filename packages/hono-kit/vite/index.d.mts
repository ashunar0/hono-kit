import type { Plugin } from "vite";

/** Writes src/routes.gen.ts before dev and build, and again while dev runs when src/routes changes */
export declare const honoKit: () => Plugin;
