export function absorberIndexes(children) {
  const indexes = children.flatMap((child, index) => child.size == null ? [index] : []);
  return indexes.length || !children.length ? indexes : [children.length - 1];
}

export function splitLine(children, length, { gaps = [], short = 'share', eps = 1e-6 } = {}) {
  if (!children.length) {
    return { sizes: [], starts: [], autoCount: 0, remainder: length, autoSize: null };
  }

  let remainder = length;
  let autoCount = 0;
  let lastTyped = -1;
  children.forEach((child, index) => {
    if (index < children.length - 1) remainder -= gaps[index] ?? 0;
    if (child.size == null) {
      autoCount += 1;
      remainder -= child.extra ?? 0;
    } else {
      remainder -= child.size;
      lastTyped = index;
    }
  });

  let sizes;
  let autoSize;
  if (short === 'lastTyped' && autoCount > 0 && remainder <= eps) {
    sizes = children.map((child, index) => child.size == null
      ? 0
      : child.size + (index === lastTyped ? remainder : 0));
    autoSize = 0;
  } else {
    const absorbers = absorberIndexes(children);
    autoSize = autoCount > 0
      ? remainder / autoCount
      : children[absorbers[0]].size + remainder;
    sizes = children.map((child, index) => child.size == null
      ? autoSize + (child.extra ?? 0)
      : index === absorbers[0] && autoCount === 0 ? autoSize : child.size);
  }

  const starts = [0];
  for (let index = 1; index < children.length; index += 1) {
    starts.push(starts[index - 1] + sizes[index - 1] + (gaps[index - 1] ?? 0));
  }
  return { sizes, starts, autoCount, remainder, autoSize };
}
