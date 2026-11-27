export const utf8Length = (text: string): number => new TextEncoder().encode(text).length;
