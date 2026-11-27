import { type Answer, type Feature, METHOD_NOT_FOUND, METHODS, TOOLS } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import { agent, type Cases, LIST, viewer, withPage } from "./kit.js";
import { asking } from "./surface.js";

/** What a Store answers a tool or a method it does not know. */
const UNKNOWN: Answer = { kind: "unknown-method", code: METHOD_NOT_FOUND };

const toolsThatRequire = (feature: Feature): string[] =>
  Object.entries(TOOLS)
    .filter(([, { requires }]) => requires.includes(feature))
    .map(([tool]) => tool);

const methodsOf = (feature: Feature): string[] =>
  Object.entries(METHODS)
    .filter(([, route]) => route.feature === feature)
    .map(([method]) => method);

type Ask = (name: string) => Promise<Answer>;

/** What each of `names` is answered, by its name. */
const answersBy = async (names: string[], ask: Ask): Promise<Record<string, Answer>> =>
  Object.fromEntries(await Promise.all(names.map(async (name): Promise<[string, Answer]> => [name, await ask(name)])));

/** What agent 1, who has no page, is answered by each tool that requires `feature`, and by `pages_list`. */
const toolAnswers = (driver: Driver, feature: Feature): Promise<Record<string, Answer>> =>
  answersBy([...toolsThatRequire(feature), LIST.name], (tool) => driver.call({ tool, input: {}, subject: agent(1) }));

/** What the owner of page 1 is answered, as a viewer of the page, by each method of `feature`. */
const methodAnswers = async (driver: Driver, feature: Feature): Promise<Record<string, Answer>> => {
  const { published } = await withPage(driver);
  return answersBy(methodsOf(feature), (method) => asking(driver, viewer(1, published.url))(method, {}));
};

/** What a Store that does not advertise `state` answers where another has its state. */
export const WITHOUT_STATE_CASES: Cases = {
  "[EXT-3] a Store without state answers every tool that requires state as a tool it does not know, and the others as ever": async (driver) => ({
    got: await toolAnswers(driver, "state"),
    want: { state_get: UNKNOWN, state_list: UNKNOWN, state_commit: UNKNOWN, state_commits: UNKNOWN, pages_list: { kind: "result", result: { pages: [] } } },
  }),

  "[EXT-3] a Store without state answers every state method of a view as a method it does not know": async (driver) => ({
    got: await methodAnswers(driver, "state"),
    want: { "agentpages/state/get": UNKNOWN, "agentpages/state/list": UNKNOWN, "agentpages/state/commit": UNKNOWN, "agentpages/state/commits": UNKNOWN },
  }),
};

/** What a Store that does not advertise `identity` answers where another says who the viewer is. */
export const WITHOUT_IDENTITY_CASES: Cases = {
  "[EXT-3] a Store without identity answers every identity method of a view as a method it does not know": async (driver) => ({
    got: await methodAnswers(driver, "identity"),
    want: { "agentpages/identity/get": UNKNOWN },
  }),
};

/** What a Store that does not advertise `files` answers where another has its files. */
export const WITHOUT_FILES_CASES: Cases = {
  "[EXT-3] [TOOLS-3] files tools and methods are unknown": async (driver) => ({
    got: [await toolAnswers(driver, "files"), await methodAnswers(driver, "files")],
    want: [
      { files_put: UNKNOWN, files_get: UNKNOWN, files_list: UNKNOWN, files_delete: UNKNOWN, pages_export: UNKNOWN, pages_list: { kind: "result", result: { pages: [] } } },
      { "agentpages/files/put": UNKNOWN, "agentpages/files/get": UNKNOWN, "agentpages/files/list": UNKNOWN, "agentpages/files/delete": UNKNOWN },
    ],
  }),
};
