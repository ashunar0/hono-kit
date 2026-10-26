// expect: hnk(no-clock-outside-app-entry) | src/domains/r7/service.ts reads the clock (new Date()). The app reads it once
// expect: hnk(no-clock-outside-app-entry) | src/domains/r7/service.ts reads the clock (Date.now())
export const stamp = () => new Date();
export const ms = () => Date.now();

// 値からの変換は時計ではない
export const parse = (value: string) => new Date(value);
