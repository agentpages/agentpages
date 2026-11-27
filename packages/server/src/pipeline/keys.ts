/** As many digits as the largest count has, so that keys sort as the numbers do. */
const COUNT_WIDTH = 16;

/** Any text as one part of a key. */
export const segment = (text: string): string => encodeURIComponent(text);

export const counted = (count: number): string => String(count).padStart(COUNT_WIDTH, "0");
