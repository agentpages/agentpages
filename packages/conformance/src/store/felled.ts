import type { Op } from "@agentpages/protocol";
import { parentsOf, sweptBy } from "./grove.js";
import { type Check, met, pageId } from "./kit.js";
import { TREE } from "./runs.js";
import { COMMIT, STATE_LIST, type Surface } from "./surface.js";

/** An `opId` no run uses, for each commit after a run. */
const [CLEARING, PLANTING, FELLING] = [99, 98, 97];

const TREE_LIST = { scope: "page", collection: TREE };

interface Felled {
  /** The ids of the changes, in their order. */
  changed: string[];
  check: Check;
}

/**
 * What deleting every root of the tree changes: every document of the tree, each root followed by its descendants.
 * So every parent is there, no document is its own ancestor, and the Store knows the children of each.
 */
const felled = async (surface: Surface, opId: number): Promise<Felled> => {
  const { documents } = await surface.ok(STATE_LIST, TREE_LIST);
  const parents = parentsOf(documents);
  const roots = documents.map((document) => document.id).filter((id) => parents.get(id) === null);
  const ops = roots.map((id): Op => ({ op: "delete", collection: TREE, id }));
  const swept = sweptBy(parents, { ops, ruled: () => true });
  const made = await surface.ok(COMMIT, { scope: "page", opId: pageId(opId), ops });
  const changed = made.commit.changes.map((change) => change.id);
  const check = {
    got: [new Set(changed), changed, await surface.ok(STATE_LIST, TREE_LIST)],
    want: [new Set(documents.map((document) => document.id)), roots.flatMap((id, index) => [id].concat(swept.slice(index, index + 1).flat())), { documents: [], seq: made.commit.seq }],
  };
  return { changed, check };
};

/** The tree a run leaves, cleared through the tools of its owner. */
export const cleared = async (surface: Surface): Promise<Check> => (await felled(surface, CLEARING)).check;

const link = (id: string, parent: string | null): Op => ({ op: "put", collection: TREE, id, data: { parent, index: "1" } });

/** A root with a chain under it, whose ids are not in the order of the chain. */
const CHAIN = [link("c", null), link("d", "c"), link("b", "d"), link("a", "b")];

/** A tree that is known, cleared like any other: its root is followed by the chain, a parent before its child. */
export const regrown = async (surface: Surface): Promise<Check> => {
  await surface.ok(COMMIT, { scope: "page", opId: pageId(PLANTING), ops: CHAIN });
  const { changed, check } = await felled(surface, FELLING);
  return { got: [changed, check], want: [["c", "d", "b", "a"], met(check)] };
};
