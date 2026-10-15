// A new route (including StrictMode's second mount) waits for the previous leave.
let leaving = Promise.resolve();

export function trackLeave(promise) {
  leaving = Promise.resolve(promise);
}

export function afterLeave() {
  return leaving;
}
