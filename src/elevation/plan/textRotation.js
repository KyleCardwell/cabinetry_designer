export function readableRotation(degrees) {
  const wrapped = ((degrees % 360) + 360) % 360;
  if (wrapped >= 270) return wrapped - 360;
  if (wrapped >= 90) return wrapped - 180;
  return wrapped;
}

export function readableFlip(degrees) {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped >= 90 && wrapped < 270 ? -1 : 1;
}
