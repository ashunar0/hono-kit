// expect: hnk(no-clock-outside-app-entry) | src/jobs/clock.ts reads the clock (new Date())
export const now = () => new Date();
