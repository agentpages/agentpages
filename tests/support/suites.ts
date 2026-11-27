import { describe, expect, test } from "vitest";

interface Registered {
  name: string;
  suite?: { tasks: { name: string }[] };
}

/** The titles of the tests registered beside `task`. */
export const titlesBeside = (task: Registered): string[] | undefined =>
  task.suite?.tasks.map((registered) => registered.name).filter((title) => title !== task.name);

export interface Suite {
  /** What the suite is run against. */
  of: string;
  register: () => void;
  /** The title of every test the suite has, in order. */
  titles: string[];
}

/** Registers a suite, and a test that it registered every test it has. */
export const whole = ({ of, register, titles }: Suite): void => {
  describe.each([of])("%s", () => {
    register();

    test("the suite registered every test it has", ({ task }) => {
      expect(titlesBeside(task)).toStrictEqual(titles);
    });
  });
};
