// expect: hnk(no-module-scope-state) | let at module scope
// expect: hnk(no-module-scope-state) | new Map() at module scope
export let counter = 0;
export const cache = new Map();
