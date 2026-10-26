import fs from "node:fs";
import path from "node:path";

export const fileOf = (context) => context.filename ?? context.getFilename();

/** 一番近い tsconfig.json のあるディレクトリ。アプリの根として使う */
export const projectCache = new Map();
export const projectOf = (file) => {
  let dir = path.dirname(file);
  while (true) {
    if (projectCache.has(dir)) return projectCache.get(dir);
    if (fs.existsSync(path.join(dir, "tsconfig.json"))) {
      const project = { root: dir };
      projectCache.set(dir, project);
      return project;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** アプリの根から見たパス（src/routes/notes/index.ts）。区切りは / */
export const relativeOf = (file, project) => path.relative(project.root, file).replace(/\\/g, "/");

/** テストのファイル（*.test.ts、*.typetest.ts、*.spec.ts） */
export const isTest = (rel) => /\.(test|typetest|spec)\.tsx?$/.test(rel);
