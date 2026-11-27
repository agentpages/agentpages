import { type Cases, objectOfBytes } from "./kit.js";
import { BEYOND, chain, changedBy, family, grow, holding, idsIn, node, ofTrees, place, withoutTrees, ZERO } from "./nodes.js";
import { type ActingCases, COMMIT, committing, limitsOf, listing, onBoth, onlyIf, put, remove, revisionsOf, STATE_LIST, within } from "./surface.js";

const ON_BOTH: ActingCases = {
  "[COMMON-5] what is no tree node is decided after the limits and before the limits of a tree, and a broken tree after the conditions of the ops": async (acting, driver) => {
    const { maxOpsPerCommit, maxDocumentBytes, maxTreeDepth } = limitsOf(driver);
    const [first, second] = [node("a", null), node("b", null)];
    await grow([acting, driver], [...family("p", maxOpsPerCommit), ...chain("c", maxTreeDepth + 1)]);
    const tried = [
      [holding(first, place(null, ZERO)), put("c", objectOfBytes(maxDocumentBytes + 1))],
      [onlyIf(first, 1), holding(second, place(null, ZERO))],
      [remove("p"), holding(second, place(null, ZERO))],
      [remove("p")],
      [node("x", `c-${maxTreeDepth}`), holding(second, place(null, ZERO))],
      [node("x", `c-${maxTreeDepth}`)],
      [node("a", "none"), onlyIf(second, 1)],
      [node("a", "none"), second],
    ];
    const refused = await Promise.all(tried.map((ops) => acting.answers(COMMIT, committing(ops))));
    return {
      got: [refused, await revisionsOf(acting, [first, second])],
      want: [
        [
          [BEYOND, 1],
          ["InvalidParams", 1],
          ["InvalidParams", 1],
          [BEYOND, undefined],
          ["InvalidParams", 1],
          [BEYOND, 0],
          ["Conflict", 1],
          ["Conflict", 0],
        ],
        [1, 1],
      ],
    };
  },

  "[TREE-6] the limit on changes is decided before the limit on depth, a condition of an op before a broken tree, and the first op in order decides": async (acting, driver) => {
    const { maxOpsPerCommit, maxTreeDepth } = limitsOf(driver);
    await grow([acting, driver], [...chain("c", maxTreeDepth + 1), ...family("p", maxOpsPerCommit - 1)]);
    const [orphan, unmet, deep] = [node("o", "none"), onlyIf(node("s", null), 1), node("x", `c-${maxTreeDepth}`)];
    const before = await acting.ok(STATE_LIST, listing());
    const refused = [
      await acting.answers(COMMIT, committing([deep, remove("p")])),
      await acting.answers(COMMIT, committing([orphan, deep, unmet, node("y", "x")])),
      await acting.answers(COMMIT, committing([orphan, node("z", "none"), unmet, onlyIf(node("w", null), 1)])),
      await acting.answers(COMMIT, committing([node("s", null), orphan, node("z", "z")])),
    ];
    return {
      got: [refused, await acting.ok(STATE_LIST, listing()), (await changedBy(acting, [remove("p")])).length],
      want: [
        [
          [BEYOND, undefined],
          [BEYOND, 1],
          ["Conflict", 2],
          ["Conflict", 1],
        ],
        before,
        maxOpsPerCommit,
      ],
    };
  },

  "[TREE-8] a commit whose changes, descendants included, number more than maxOpsPerCommit is beyond the limit": async (acting, driver) => {
    const { maxOpsPerCommit } = limitsOf(driver);
    await grow([acting, driver], [...family("p", maxOpsPerCommit - 1), ...family("q", maxOpsPerCommit), node("r", null), node("s", "r"), ...family("t", maxOpsPerCommit - 3), ...family("u", maxOpsPerCommit - 1)]);
    await grow([acting, driver], [node("t", "s")]);
    const refused = [
      await acting.answers(COMMIT, committing([remove("p"), node("x", null)])),
      await acting.answers(COMMIT, committing([remove("p"), within("labels", put("x", {}))])),
      await acting.answers(COMMIT, committing([remove("q")])),
      await acting.answers(COMMIT, committing([remove("r"), node("x", null)])),
    ];
    const kept = await idsIn(acting, listing());
    const most = [
      await changedBy(acting, [remove("p"), remove("none")]),
      await changedBy(acting, [remove("r")]),
      await changedBy(acting, [node("u-0", null), remove("u")]),
    ];
    return {
      got: [refused, kept.length, most.map((changed) => changed.length), (await idsIn(acting, listing())).length],
      want: [
        [
          [BEYOND, undefined],
          [BEYOND, undefined],
          [BEYOND, undefined],
          [BEYOND, undefined],
        ],
        4 * maxOpsPerCommit + 1,
        [maxOpsPerCommit, maxOpsPerCommit, maxOpsPerCommit],
        maxOpsPerCommit + 2,
      ],
    };
  },

  "[TREE-9] a commit that would leave a tree document it places with more than maxTreeDepth ancestors is beyond the limit": async (acting, driver) => {
    const { maxTreeDepth } = limitsOf(driver);
    const [deepest, above] = [`c-${maxTreeDepth}`, `c-${maxTreeDepth - 1}`];
    await grow([acting, driver], [...chain("c", maxTreeDepth), node("m", null), node("n", "m")]);
    const atMost = await revisionsOf(acting, [node(deepest, above)]);
    const before = await acting.ok(STATE_LIST, listing());
    const refused = [
      await acting.answers(COMMIT, committing([node("x", deepest)])),
      await acting.answers(COMMIT, committing([node("r", null), node("m", deepest)])),
      await acting.answers(COMMIT, committing([node("x", above), node("y", "x")])),
      await acting.answers(COMMIT, committing([node("r", null), node("x", deepest), node("y", deepest)])),
    ];
    return {
      got: [atMost, refused, await acting.ok(STATE_LIST, listing()), await revisionsOf(acting, [node("m", above)])],
      want: [
        [1],
        [
          [BEYOND, 0],
          [BEYOND, 1],
          [BEYOND, 1],
          [BEYOND, 1],
        ],
        before,
        [2],
      ],
    };
  },

  "[TREE-9] other documents are not checked: the descendants of a moved document can be deeper, and so can a put that keeps its parent": async (acting, driver) => {
    const { maxTreeDepth } = limitsOf(driver);
    const [deepest, above] = [`c-${maxTreeDepth}`, `c-${maxTreeDepth - 1}`];
    await grow([acting, driver], [...chain("c", maxTreeDepth + 1), node("r", null)]);
    const moved = await revisionsOf(acting, [node("c-0", "r")]);
    const edited = await revisionsOf(acting, [put(deepest, place(above, "b")), put(above, place(`c-${maxTreeDepth - 2}`, "b"))]);
    const refused = [await acting.answers(COMMIT, committing([node("x", deepest)])), await acting.answers(COMMIT, committing([node("x", above)]))];
    return {
      got: [moved, edited, refused, await revisionsOf(acting, [node(deepest, "r")]), await acting.answers(COMMIT, committing([node(deepest, above)]))],
      want: [
        [2],
        [2, 2],
        [
          [BEYOND, 0],
          [BEYOND, 0],
        ],
        [3],
        [BEYOND, 0],
      ],
    };
  },

  "[TREE-9] a document placed as its own ancestor with more than maxTreeDepth documents between is beyond the limit, and with fewer a conflict": async (acting, driver) => {
    const { maxTreeDepth } = limitsOf(driver);
    const [deepest, above] = [`c-${maxTreeDepth}`, `c-${maxTreeDepth - 1}`];
    await grow([acting, driver], chain("c", maxTreeDepth));
    return {
      got: [
        await revisionsOf(acting, [put(above, place(`c-${maxTreeDepth - 2}`, "b")), node(deepest, above)]),
        await acting.answers(COMMIT, committing([node("c-0", deepest)])),
        await acting.answers(COMMIT, committing([node("c-0", above)])),
        await acting.answers(COMMIT, committing([node("x", "c-0"), node("c-0", above)])),
      ],
      want: [
        [2, 1],
        [BEYOND, 0],
        ["Conflict", 0],
        ["Conflict", 1],
      ],
    };
  },

  "[TYPES-12] a type version that leaves a tree out does not change it: its documents stay a tree": async (acting, driver) => {
    const [root, child] = [node("a", null), node("b", "a")];
    await acting.ok(COMMIT, committing([root, child, node("c", "b")]));
    await withoutTrees(driver, acting);
    return {
      got: [await acting.answers(COMMIT, committing([child])), await revisionsOf(acting, [within("labels", put("l", {}))]), await changedBy(acting, [remove("a")]), await idsIn(acting, listing())],
      want: [["InvalidParams", 0], [1], ["a", "b", "c"], []],
    };
  },
};

/** What a Store with trees does at its limits, and in which order it decides. */
export const BOUND_CASES: Cases = onBoth(ON_BOTH, ofTrees);
