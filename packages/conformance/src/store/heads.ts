import { type Heads, HOST_OPERATION_SCHEMAS } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import { anonymous, type Cases, DELETE, deleting, LINK_READ, page, pageId, PRIVATE, PUBLISH, SET_ACCESS, sharing, times, viewer, type Visit } from "./kit.js";
import { COMMIT, committing, mine, type StateOp, toolsOf, viewOf } from "./surface.js";
import { collected, hostOf, REPLY, replying, RESOLVE, resolving, saying, scene, START } from "./threads.js";

const HEADS: StateOp<Heads> = { name: "pages_heads", result: HOST_OPERATION_SCHEMAS.pages_heads.result };

/** Where a page stands, as its host learns it for a viewer. */
const headsFor = (driver: Driver, visit: Visit): Promise<Heads> => hostOf(driver, visit).ok(HEADS, {});

export const HEADS_CASES: Cases = {
  "[HOST-7] the version moves with a publish, comments by 1 with every start, reply and resolve, also of a resolved thread, and neither with anything else": async (driver) => {
    const { alice, url, owner, bob } = await scene(driver);
    const [first, reply] = [saying(1), saying(2)];
    const answering = { ...reply, threadId: first.opId };
    const second = await alice.ok(PUBLISH, page(2, 0));
    const steps = [
      (): Promise<unknown> => bob.outcome(START, first),
      (): Promise<unknown> => owner.outcome(REPLY, answering),
      (): Promise<unknown> => bob.outcome(RESOLVE, resolving(first.opId)),
      (): Promise<unknown> => owner.outcome(RESOLVE, resolving(first.opId)),
      (): Promise<unknown> => owner.outcome(REPLY, answering),
      (): Promise<unknown> => owner.outcome(REPLY, replying(reply.opId, 3)),
      (): Promise<unknown> => hostOf(driver, viewer(1, second.url)).outcome(START, saying(4)),
      async (): Promise<unknown> => (await alice.ok(SET_ACCESS, sharing(1, LINK_READ))).access,
      async (): Promise<unknown> => (await alice.ok(PUBLISH, page(1, 1))).version,
    ];
    const before = await headsFor(driver, anonymous(url));
    const moved = await collected(steps, async (step) => [await step(), (await headsFor(driver, anonymous(url))).comments]);
    return {
      got: [before, moved, await headsFor(driver, viewer(2, url)), await headsFor(driver, viewer(1, second.url))],
      want: [
        { version: 1, seq: 0, comments: 0 },
        [["done", 1], ["done", 2], ["done", 3], ["done", 4], ["done", 4], ["NotFound", 4], ["done", 4], ["link-read", 4], [2, 4]],
        { version: 2, seq: 0, viewerSeq: 0, comments: 4 },
        { version: 1, seq: 0, viewerSeq: 0, comments: 1 },
      ],
    };
  },

  "[HOST-7] pages_heads of a link that ended is forbidden, and of a page that was deleted or never was, not found": async (driver) => {
    const { alice, url } = await scene(driver);
    const failing = (visit: Visit): Promise<string> => hostOf(driver, visit).fails(HEADS, {});
    await alice.ok(SET_ACCESS, sharing(1, PRIVATE));
    const ended = [await failing(anonymous(url)), await failing(viewer(2, url)), await failing(anonymous(url.replace(pageId(1), pageId(2))))];
    const owned = await headsFor(driver, viewer(1, url));
    await alice.ok(DELETE, deleting(1));
    return {
      got: [ended, owned, await failing(anonymous(url)), await failing(viewer(1, url))],
      want: [["Forbidden", "Forbidden", "NotFound"], { version: 1, seq: 0, viewerSeq: 0, comments: 0 }, ...times(2, "NotFound")],
    };
  },
};

/** What `pages_heads` says of the state of a page, in a Store that has state. */
export const HEADS_IN_STATE_CASES: Cases = {
  "[HOST-7] seq moves with a commit to the page scope, and viewerSeq with a commit to the viewer's own scope, and with no other": async (driver) => {
    const { url } = await scene(driver);
    const [bob, carol] = [viewer(2, url), viewer(3, url)];
    const seen = (): Promise<Heads[]> => collected([anonymous(url), bob, carol], (visit) => headsFor(driver, visit));
    const before = await seen();
    await toolsOf(driver, { by: 1, on: 1 }).ok(COMMIT, committing([]));
    const afterPage = await seen();
    await collected([bob, bob, carol], (visit) => viewOf(driver, visit).ok(COMMIT, mine(committing([]))));
    const [nobody, signedIn] = [{ version: 1, seq: 0, comments: 0 }, { version: 1, seq: 0, viewerSeq: 0, comments: 0 }];
    return {
      got: [before, afterPage, await seen()],
      want: [
        [nobody, signedIn, signedIn],
        [{ ...nobody, seq: 1 }, { ...signedIn, seq: 1 }, { ...signedIn, seq: 1 }],
        [{ ...nobody, seq: 1 }, { ...signedIn, seq: 1, viewerSeq: 2 }, { ...signedIn, seq: 1, viewerSeq: 1 }],
      ],
    };
  },
};
