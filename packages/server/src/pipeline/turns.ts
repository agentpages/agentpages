/** What `each` makes of every item, one after the other. */
export const inTurn = async <T, R>(items: readonly T[], each: (item: T) => Promise<R>): Promise<R[]> => {
  const made: R[] = [];
  await items.reduce<Promise<unknown>>((earlier, item) => earlier.then(async () => made.push(await each(item))), Promise.resolve());
  return made;
};
