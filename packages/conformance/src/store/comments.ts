import type { Driver } from "../contract.js";
import { actingAs, agent, anonymous, type Cases, DELETE, deleting, GET, having, inPagesOfTwo, inTurn, LINK_READ, LINK_WRITE, LIST, page, pageId, PRIVATE, PUBLISH, reading, SET_ACCESS, sharing, text, tick, timeOf, times, viewer } from "./kit.js";
import { authorsOf, byAgent, collected, commentsOf, hostOf, idsOf, REPLY, replying, RESOLVE, resolving, saying, scene, START, THREADS } from "./threads.js";

/** `count` requests that succeeded, as `outcome` reports them. */
const done = (count: number): string[] => Array.from({ length: count }, () => "done");

/** What a viewer who holds the link of page `n`, which has this access, may do with its threads. */
const asHolder = async (driver: Driver, [n, access]: [number, string]): Promise<string[]> => {
  const alice = actingAs(driver, agent(1));
  await alice.ok(PUBLISH, page(n, 0));
  const { url } = await alice.ok(SET_ACCESS, sharing(n, access));
  const { id } = await hostOf(driver, viewer(1, url)).ok(START, saying(1));
  const holder = hostOf(driver, viewer(2, url));
  return [
    await holder.outcome(THREADS, {}),
    await holder.outcome(START, saying(2)),
    await holder.outcome(REPLY, replying(id, 3)),
    await holder.outcome(RESOLVE, resolving(id)),
  ];
};

/** Comments need no feature. The cases need a `maxThreadEntries` of at least 3. */
export const COMMENTS_CASES: Cases = {
  "[HOST-2] [HOST-5] comments_start returns a thread on the current version of the page, whose id and first entry's id are the opId": async (driver) => {
    const { alice, published, bob } = await scene(driver);
    const [quoted, plain] = [{ ...saying(1), quote: text(2) }, saying(3)];
    const first = await bob.ok(START, quoted);
    await alice.ok(PUBLISH, page(1, 1));
    const second = await bob.ok(START, plain);
    const [author] = authorsOf(first);
    const createdAt = published.updatedAt;
    return {
      got: [first, second],
      want: [
        { id: quoted.opId, pageId: pageId(1), version: 1, quote: text(2), status: "open", entries: [{ id: quoted.opId, author, body: text(1), createdAt }] },
        { id: plain.opId, pageId: pageId(1), version: 2, status: "open", entries: [{ id: plain.opId, author, body: text(3), createdAt }] },
      ],
    };
  },

  "[HOST-6] a host lists, answers and resolves threads for a viewer by the url they present, with the viewer as author": async (driver) => {
    const { url, published } = await scene(driver);
    const [bob, carol] = [hostOf(driver, { ...viewer(2, url), name: text(2) }), hostOf(driver, viewer(3, url))];
    const started = await bob.ok(START, saying(1));
    const [first, second] = [replying(started.id, 3), replying(started.id, 4)];
    await carol.ok(REPLY, first);
    await bob.ok(REPLY, second);
    const resolved = await carol.ok(RESOLVE, resolving(started.id));
    const [bobs, carols] = authorsOf(resolved).map((author) => Object.assign({}, author).id);
    const createdAt = published.updatedAt;
    const entries = [
      { id: started.id, author: { id: bobs, name: text(2) }, body: text(1), createdAt },
      { id: first.opId, author: { id: carols }, body: text(3), createdAt },
      { id: second.opId, author: { id: bobs, name: text(2) }, body: text(4), createdAt },
    ];
    return {
      got: [resolved, await carol.ok(THREADS, {}), new Set([bobs, carols]).size],
      want: [{ ...started, status: "resolved", entries }, { threads: [resolved] }, 2],
    };
  },

  "[COMMENTS-1] comments_list returns the threads of the page, in pages of its limit": async (driver) => {
    const { alice, owner, bob } = await scene(driver);
    const second = await alice.ok(PUBLISH, page(2, 0));
    const elsewhere = await hostOf(driver, viewer(1, second.url)).ok(START, saying(6));
    const [a, b, c, d, e] = await collected([1, 2, 3, 4, 5], (n) => bob.ok(START, saying(n)));
    const pages = await inPagesOfTwo((paging) => owner.ok(THREADS, paging));
    return {
      got: [pages.map(({ threads }) => threads), pages.map((listed) => Object.keys(listed).length), await bob.ok(THREADS, {}), await commentsOf(driver, { by: 1, on: 2 }).ok(THREADS, {})],
      want: [[[a, b], [c, d], [e]], [2, 2, 1], { threads: [a, b, c, d, e] }, { threads: [elsewhere] }],
    };
  },

  "[COMMENTS-2] comments_reply returns the thread with the entry it added": async (driver) => {
    const { owner, bob, published } = await scene(driver);
    const started = await bob.ok(START, saying(1));
    const reply = replying(started.id, 2);
    const answered = await owner.ok(REPLY, reply);
    return {
      got: [answered, await owner.ok(THREADS, {})],
      want: [{ ...started, entries: [...started.entries, byAgent(reply, published.updatedAt)] }, { threads: [answered] }],
    };
  },

  "[COMMENTS-3] comments_resolve returns the thread, resolved": async (driver) => {
    const { owner, bob } = await scene(driver);
    const started = await bob.ok(START, saying(1));
    const resolved = await owner.ok(RESOLVE, resolving(started.id));
    return { got: [resolved, await owner.ok(THREADS, {})], want: [{ ...started, status: "resolved" }, { threads: [resolved] }] };
  },

  "[COMMENTS-4] a thread has at least one entry, and its entries are ordered oldest first": async (driver) => {
    const { owner, bob, published } = await scene(driver);
    const started = await bob.ok(START, saying(3));
    const [last, middle] = [replying(started.id, 1), replying(started.id, 2)];
    tick(driver);
    await owner.ok(REPLY, middle);
    tick(driver);
    const { entries } = await bob.ok(REPLY, last);
    return {
      got: [started.entries.length, entries.map(({ body, createdAt }) => [body, timeOf(createdAt) - timeOf(published.updatedAt)])],
      want: [1, [[text(3), 0], [text(2), 1000], [text(1), 2000]]],
    };
  },

  "[COMMENTS-5] comments_list orders threads by the createdAt of their first entry, oldest first": async (driver) => {
    const { owner, bob } = await scene(driver);
    const [third, second, first] = [saying(3), saying(2), saying(1)];
    const started = await collected([first, second, third], (params) => {
      tick(driver);
      return bob.ok(START, params);
    });
    const answered = await owner.ok(REPLY, replying(first.opId, 4));
    return { got: await owner.ok(THREADS, {}), want: { threads: [answered, ...started.slice(1)] } };
  },

  "[COMMENTS-6] comments_resolve on a resolved thread succeeds": async (driver) => {
    const { owner, bob } = await scene(driver);
    const started = await bob.ok(START, saying(1));
    const resolved = [await bob.ok(RESOLVE, resolving(started.id)), await owner.ok(RESOLVE, resolving(started.id))];
    const want = { ...started, status: "resolved" };
    return { got: [resolved, await owner.ok(THREADS, {})], want: [[want, want], { threads: [want] }] };
  },

  "[COMMENTS-7] the id of an entry added by comments_reply is its opId": async (driver) => {
    const { owner, bob } = await scene(driver);
    const started = await bob.ok(START, saying(1));
    const [byOwner, byBob] = [replying(started.id, 2), replying(started.id, 3)];
    await owner.ok(REPLY, byOwner);
    const { entries } = await bob.ok(REPLY, byBob);
    return { got: entries.map((entry) => entry.id), want: [started.id, byOwner.opId, byBob.opId] };
  },

  "[COMMENTS-8] comments_reply adds one entry, and opens a resolved thread again": async (driver) => {
    const { owner, bob, published } = await scene(driver);
    const started = await bob.ok(START, saying(1));
    const resolved = await owner.ok(RESOLVE, resolving(started.id));
    const [first, second] = [replying(started.id, 2), replying(started.id, 3)];
    const reopened = await owner.ok(REPLY, first);
    const entries = [...started.entries, byAgent(first, published.updatedAt)];
    return {
      got: [resolved.status, reopened, await owner.ok(REPLY, second)],
      want: ["resolved", { ...started, entries }, { ...started, entries: [...entries, byAgent(second, published.updatedAt)] }],
    };
  },

  "[COMMENTS-9] a threadId the page does not have is not found, once the caller may change a thread": async (driver) => {
    const { alice, url, owner, bob } = await scene(driver);
    const second = await alice.ok(PUBLISH, page(2, 0));
    const { id } = await hostOf(driver, viewer(1, second.url)).ok(START, saying(1));
    return {
      got: [
        await owner.fails(REPLY, replying(id, 2)),
        await owner.fails(RESOLVE, resolving(id)),
        await bob.fails(REPLY, replying(id, 2)),
        await bob.fails(RESOLVE, resolving(id)),
        await hostOf(driver, anonymous(url)).fails(REPLY, replying(id, 2)),
        await commentsOf(driver, { by: 2, on: 1 }).fails(RESOLVE, resolving(id)),
        await owner.ok(THREADS, {}),
      ],
      want: [...times(4, "NotFound"), "Unauthenticated", "Forbidden", { threads: [] }],
    };
  },

  "[COMMENTS-10] a thread holds maxThreadEntries entries, and a reply beyond them is beyond the limit": async (driver) => {
    const { owner, bob } = await scene(driver);
    const { maxThreadEntries } = driver.capability.limits;
    const started = await bob.ok(START, saying(1));
    const replies = Array.from({ length: maxThreadEntries - 1 }, () => replying(started.id, 2));
    const within = await collected(replies, (reply) => owner.outcome(REPLY, reply));
    const beyond = [await owner.fails(REPLY, replying(started.id, 3)), await bob.fails(REPLY, replying(started.id, 3))];
    const { entries } = await bob.ok(RESOLVE, resolving(started.id));
    return {
      got: [within, beyond, entries.map((entry) => entry.id)],
      want: [done(maxThreadEntries - 1), times(2, "LimitExceeded"), [started.id, ...replies.map((reply) => reply.opId)]],
    };
  },

  "[COMMENTS-11] an anonymous viewer who starts, answers or resolves a thread is unauthenticated, and one who lists is not": async (driver) => {
    const { url, bob } = await scene(driver);
    const started = await bob.ok(START, saying(1));
    const nobody = hostOf(driver, anonymous(url));
    const refused = [await nobody.fails(START, saying(2)), await nobody.fails(REPLY, replying(started.id, 3)), await nobody.fails(RESOLVE, resolving(started.id))];
    return { got: [refused, await nobody.ok(THREADS, {})], want: [times(3, "Unauthenticated"), { threads: [started] }] };
  },

  "[COMMENTS-12] threads started at the same time are ordered by id, and a status lists only the threads of that status": async (driver) => {
    const { owner, bob } = await scene(driver);
    const [a, b, c] = [saying(1), saying(2), saying(3)];
    await collected([c, a, b], (params) => bob.ok(START, params));
    await collected([b, c], ({ opId }) => owner.ok(RESOLVE, resolving(opId)));
    const listed = (params: object): Promise<string[]> => owner.ok(THREADS, params).then(idsOf);
    const before = [await listed({}), await listed({ status: "open" }), await listed({ status: "resolved" })];
    await bob.ok(REPLY, replying(b.opId, 4));
    const first = await bob.ok(THREADS, { status: "open", limit: 1 });
    const rest = await bob.ok(THREADS, { status: "open", cursor: first.nextCursor });
    return {
      got: [before, idsOf(first), idsOf(rest), Object.keys(rest), await listed({ status: "resolved" })],
      want: [[[a.opId, b.opId, c.opId], [a.opId], [b.opId, c.opId]], [a.opId], [b.opId], ["threads"], [c.opId]],
    };
  },

  "[COMMENTS-13] an opId that is already a thread of the page, or an entry of the thread, is malformed, before the limit of entries": async (driver) => {
    const { url, bob } = await scene(driver);
    const { maxThreadEntries } = driver.capability.limits;
    const carol = hostOf(driver, viewer(3, url));
    const started = await bob.ok(START, saying(1));
    const replies = Array.from({ length: maxThreadEntries - 1 }, () => replying(started.id, 2));
    await inTurn(replies, (reply) => bob.ok(REPLY, reply));
    const ids = [started.id, ...replies.map((reply) => reply.opId)];
    const taken = await collected(ids, (id) => carol.fails(REPLY, having(replying(started.id, 3), ["opId", id])));
    const refused = [await carol.fails(START, having(saying(4), ["opId", started.id])), await carol.fails(REPLY, replying(started.id, 5))];
    const { threads } = await bob.ok(THREADS, {});
    return {
      got: [taken, refused, threads.map((thread) => thread.entries.map((entry) => entry.id))],
      want: [times(maxThreadEntries, "InvalidParams"), ["InvalidParams", "LimitExceeded"], [ids]],
    };
  },

  "[REL-29] two viewers start a thread with one opId: the second start is malformed, and a repeat of the first gets its thread": async (driver) => {
    const { url, owner, bob } = await scene(driver);
    const params = saying(1);
    const started = await bob.ok(START, params);
    const second = await hostOf(driver, viewer(3, url)).fails(START, params);
    const resolved = await owner.ok(RESOLVE, resolving(started.id));
    return {
      got: [second, await bob.ok(START, params), await owner.ok(THREADS, {})],
      want: ["InvalidParams", { ...resolved, status: "open" }, { threads: [resolved] }],
    };
  },

  "[ACCESS-4] a link holder lists threads when the link lets them read, and starts, answers and resolves them when it lets them write": async (driver) => ({
    got: await Promise.all([PRIVATE, LINK_READ, LINK_WRITE].map((access, n) => asHolder(driver, [n, access]))),
    want: [times(4, "Forbidden"), ["done", ...times(3, "Forbidden")], done(4)],
  }),

  "[ACCESS-2] another agent may not list, answer or resolve the threads of a page": async (driver) => {
    const { owner, bob } = await scene(driver);
    const started = await bob.ok(START, saying(1));
    const other = commentsOf(driver, { by: 2, on: 1 });
    const refused = [await other.fails(THREADS, {}), await other.fails(REPLY, replying(started.id, 2)), await other.fails(RESOLVE, resolving(started.id))];
    return { got: [refused, await owner.ok(THREADS, {})], want: [times(3, "Forbidden"), { threads: [started] }] };
  },

  "[PAGES-14] the threads of a deleted page are gone": async (driver) => {
    const { alice, owner, bob } = await scene(driver);
    const { id } = await bob.ok(START, saying(1));
    await alice.ok(DELETE, deleting(1));
    return {
      got: [await owner.fails(THREADS, {}), await bob.fails(THREADS, {}), await owner.fails(REPLY, replying(id, 2)), await bob.fails(RESOLVE, resolving(id)), await bob.fails(START, saying(3))],
      want: times(5, "NotFound"),
    };
  },

  "[PAGES-20] a comment leaves the updatedAt of its page": async (driver) => {
    const { alice, owner, bob, published } = await scene(driver);
    tick(driver);
    const started = await bob.ok(START, saying(1));
    await owner.ok(REPLY, replying(started.id, 2));
    const { entries } = await bob.ok(RESOLVE, resolving(started.id));
    const { pages } = await alice.ok(LIST, {});
    return {
      got: [entries.map(({ createdAt }) => timeOf(createdAt) - timeOf(published.updatedAt)), (await alice.ok(GET, reading(1))).updatedAt, pages.map((info) => info.updatedAt)],
      want: [[1000, 1000], published.updatedAt, [published.updatedAt]],
    };
  },
};
