export function mergeObject<T extends object, U extends object>(
  a: T | {} = {},
  b: U | {} = {}
): T & U {
  return Object.entries(b).reduce(
    (acc, [key, value]) => {
      if (value !== undefined) {
        (acc as any)[key] = value;
      }
      return acc;
    },
    { ...a }
  ) as T & U;
}
