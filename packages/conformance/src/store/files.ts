import { type Empty, type FileInfo, type FilesGetResult, type FilesLimits, type FilesListResult, type FilesPutResult, METHOD_SCHEMAS, toBase64 } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import { actingAs, agent, anonymous, type Cases, type Check, DELETE, deleting, having, inPagesOfTwo, inTurn, LINK_READ, LINK_WRITE, ofLength, opId, page, PRIVATE, PUBLISH, SET_ACCESS, sharing, text, tick, timeOf, times, viewer } from "./kit.js";
import { onEach, opOf, type StateOp, type Surface, toolsOf, twoSides, viewOf } from "./surface.js";

const PUT: StateOp<FilesPutResult> = opOf("files/put", METHOD_SCHEMAS["agentpages/files/put"]);
const FILE_GET: StateOp<FilesGetResult> = opOf("files/get", METHOD_SCHEMAS["agentpages/files/get"]);
const FILE_LIST: StateOp<FilesListResult> = opOf("files/list", METHOD_SCHEMAS["agentpages/files/list"]);
const FILE_DELETE: StateOp<Empty> = opOf("files/delete", METHOD_SCHEMAS["agentpages/files/delete"]);

const TEXT = "text/plain";

interface Putting {
  opId: string;
  id: string;
  name: string;
  mimeType: string;
  blob: string;
}

/** The params that put the file `id`, whose bytes are the UTF-8 of `content`, under an `opId` of their own. */
const putting = (id: string, content: string = id): Putting => ({
  opId: opId(),
  id,
  name: `${id}.txt`,
  mimeType: TEXT,
  blob: toBase64(new TextEncoder().encode(content)),
});

/** The params that read the file `id`. */
const file = (id: string): { id: string } => ({ id });

/** The params that delete the file `id`, under an `opId` of their own. */
const removing = (id: string): { opId: string; id: string } => ({ opId: opId(), id });

const limitsOf = (driver: Driver): FilesLimits => Object.assign({}, driver.capability.files);

/** Every file a list returns. */
const filesOf = async (surface: Surface): Promise<FileInfo[]> => (await surface.ok(FILE_LIST, {})).files;

const idsOf = async (surface: Surface): Promise<string[]> => (await filesOf(surface)).map(({ id }) => id);

/** Puts a file for each id, in turn, and returns them. */
const putEach = async (surface: Surface, ids: readonly string[]): Promise<FileInfo[]> => {
  const files: FileInfo[] = [];
  await inTurn(ids, async (id) => files.push((await surface.ok(PUT, putting(id))).file));
  return files;
};

/** A surface, with the kind of actor the Store says acts through it. */
interface Filing extends Surface {
  kind: string;
}

type FilingCases = Record<string, (filing: Filing, driver: Driver) => Promise<Check>>;

const sides = async (driver: Driver): Promise<[Filing, Filing]> => {
  const [tools, view] = await twoSides(driver);
  return [
    { ...tools, kind: "agent" },
    { ...view, kind: "viewer" },
  ];
};

const ON_BOTH: FilingCases = {
  "[FILES-1] put returns the file with its decoded size, who put it and when": async (filing, driver) => {
    const first = await filing.ok(PUT, putting("a", "abc"));
    tick(driver);
    const later = await filing.ok(PUT, putting("b"));
    const { updatedAt, updatedBy } = first.file;
    return {
      got: [first, updatedBy.kind, later, timeOf(later.file.updatedAt) - timeOf(updatedAt)],
      want: [
        { file: { id: "a", name: "a.txt", mimeType: TEXT, size: 3, updatedAt, updatedBy } },
        filing.kind,
        { file: { id: "b", name: "b.txt", mimeType: TEXT, size: 1, updatedAt: later.file.updatedAt, updatedBy } },
        1000,
      ],
    };
  },

  "[FILES-2] get returns the blob that was put": async (filing) => {
    const put = await filing.ok(PUT, { ...putting("a"), blob: "AP8HgA==" });
    const other = await filing.ok(PUT, putting("b"));
    return {
      got: [put.file.size, await filing.ok(FILE_GET, file("a")), await filing.ok(FILE_GET, file("b"))],
      want: [4, { file: put.file, blob: "AP8HgA==" }, { file: other.file, blob: "Yg==" }],
    };
  },

  "[FILES-3] list pages through files two at a time": async (filing) => {
    const files = await putEach(filing, ["a", "b", "c", "d", "e"]);
    const pages = await inPagesOfTwo((paging) => filing.ok(FILE_LIST, paging));
    return {
      got: [pages.map((listed) => listed.files), pages.map((listed) => Object.keys(listed).length)],
      want: [[files.slice(0, 2), files.slice(2, 4), files.slice(4)], [2, 2, 1]],
    };
  },

  "[FILES-10] list orders by id": async (filing) => {
    await putEach(filing, ["b", "B", "a_1", "a-1", "10", "9"]);
    return { got: await idsOf(filing), want: ["10", "9", "B", "a-1", "a_1", "b"] };
  },

  "[FILES-6] put replaces name, type and bytes": async (filing, driver) => {
    const first = await filing.ok(PUT, putting("a", "abc"));
    tick(driver);
    const second = await filing.ok(PUT, { ...putting("a", "z"), name: "other.md", mimeType: "text/markdown" });
    const { updatedAt } = second.file;
    return {
      got: [first.file.size, second, timeOf(updatedAt) - timeOf(first.file.updatedAt), await filing.ok(FILE_GET, file("a")), await filesOf(filing)],
      want: [
        3,
        { file: { id: "a", name: "other.md", mimeType: "text/markdown", size: 1, updatedAt, updatedBy: first.file.updatedBy } },
        1000,
        { file: second.file, blob: "eg==" },
        [second.file],
      ],
    };
  },

  "[FILES-7] a file of maxFileBytes is stored, one byte more is LimitExceeded": async (filing, driver) => {
    const { maxFileBytes } = limitsOf(driver);
    const largest = putting("a", ofLength(maxFileBytes));
    const stored = await filing.ok(PUT, largest);
    return {
      got: [stored.file.size, await filing.fails(PUT, putting("b", ofLength(maxFileBytes + 1))), await filing.ok(FILE_GET, file("a")), await filesOf(filing)],
      want: [maxFileBytes, "LimitExceeded", { file: stored.file, blob: largest.blob }, [stored.file]],
    };
  },

  "[FILES-8] get of a missing file is NotFound": async (filing) => {
    const before = await filing.fails(FILE_GET, file("a"));
    await filing.ok(PUT, putting("b"));
    return { got: [before, await filing.fails(FILE_GET, file("a")), await idsOf(filing)], want: ["NotFound", "NotFound", ["b"]] };
  },

  "[FILES-4] [FILES-9] delete removes the file, and succeeds on a missing one": async (filing) => {
    const [, kept] = await putEach(filing, ["a", "b"]);
    const before = await idsOf(filing);
    const deleted = await filing.ok(FILE_DELETE, removing("a"));
    const after = [await filing.fails(FILE_GET, file("a")), await filesOf(filing)];
    return {
      got: [before, deleted, after, await filing.ok(FILE_DELETE, removing("a")), await filing.ok(FILE_DELETE, removing("never")), await filesOf(filing)],
      want: [["a", "b"], {}, ["NotFound", [kept]], {}, {}, [kept]],
    };
  },

  "[FILES-11] an empty file is stored": async (filing) => {
    const empty = { ...putting("a", ""), name: "../ré sumé\n", mimeType: "not a type" };
    const { file: stored } = await filing.ok(PUT, empty);
    return {
      got: [stored.size, stored.name, stored.mimeType, await filing.ok(FILE_GET, file("a")), await filesOf(filing)],
      want: [0, "../ré sumé\n", "not a type", { file: stored, blob: "" }, [stored]],
    };
  },

  "[COMMON-8] a blob that is not canonical base64 is InvalidParams": async (filing) => {
    const params = putting("a");
    const blobs = ["AB==", "AAB=", "A", "AAA", "AA=A", "QQ", "QUJD\n", "QUJ-", "====", 7];
    const refused = await Promise.all(blobs.map((blob) => filing.fails(PUT, having(params, ["blob", blob]))));
    const canonical = await filing.ok(PUT, having(params, ["blob", "AQI="]));
    return { got: [refused, canonical.file.size, await filesOf(filing)], want: [times(10, "InvalidParams"), 2, [canonical.file]] };
  },

  "[REL-2] a repeated put returns the first file after another put replaced it": async (filing, driver) => {
    const params = putting("a", "first");
    const first = await filing.ok(PUT, params);
    tick(driver);
    const second = await filing.ok(PUT, putting("a", "second!"));
    return {
      got: [await filing.ok(PUT, params), await filing.ok(PUT, params), await filesOf(filing), [first.file.size, second.file.size], timeOf(second.file.updatedAt) - timeOf(first.file.updatedAt)],
      want: [first, first, [second.file], [5, 7], 1000],
    };
  },

  "[REL-30] a repeated oversized put with a new opId is LimitExceeded, and with a used opId and other params InvalidParams": async (filing, driver) => {
    const [used, removed] = [putting("a"), removing("c")];
    const first = await filing.ok(PUT, used);
    await filing.ok(FILE_DELETE, removed);
    const tooLarge = putting("b", ofLength(limitsOf(driver).maxFileBytes + 1));
    return {
      got: [
        [await filing.fails(PUT, tooLarge), await filing.fails(PUT, tooLarge), await filing.fails(PUT, having(used, ["blob", tooLarge.blob]))],
        [
          await filing.fails(PUT, having(used, ["name", text(2)])),
          await filing.fails(FILE_DELETE, having(removed, ["id", used.id])),
          await filing.fails(FILE_DELETE, having(removed, ["opId", used.opId])),
        ],
        await filing.ok(PUT, used),
        await filesOf(filing),
      ],
      want: [times(3, "LimitExceeded"), times(3, "InvalidParams"), first, [first.file]],
    };
  },
};

/** What a caller gets who reads the file `a`, lists the files, puts the file `b` and deletes it. */
const outcomes = (surface: Surface): Promise<string[]> =>
  Promise.all([
    surface.outcome(FILE_GET, file("a")),
    surface.outcome(FILE_LIST, {}),
    surface.outcome(PUT, putting("b")),
    surface.outcome(FILE_DELETE, removing("b")),
  ]);

/** What a signed-in link holder and an anonymous one get on page `n` of agent 1, which has this access and the file `a`. */
const heldWith = async (driver: Driver, [n, access]: [number, string]): Promise<string[][]> => {
  const alice = actingAs(driver, agent(1));
  await alice.ok(PUBLISH, page(n, 0));
  const { url } = await alice.ok(SET_ACCESS, sharing(n, access));
  await toolsOf(driver, { by: 1, on: n }).ok(PUT, putting("a"));
  return Promise.all([viewer(2, url), anonymous(url)].map((visit) => outcomes(viewOf(driver, visit))));
};

const READ_ONLY = ["done", "done", "Forbidden", "Forbidden"];
const ALL_DONE = ["done", "done", "done", "done"];

/** What a Store that advertises `files` does with them, through the tools of an agent and the methods of a view. */
export const FILES_CASES: Cases = {
  ...onEach(ON_BOTH, sides),

  "[ACCESS-4] a link-read holder reads files and may not put": async (driver) => {
    const held = await Promise.all([PRIVATE, LINK_READ, LINK_WRITE].map((access, n) => heldWith(driver, [n, access])));
    return {
      got: [held, await outcomes(toolsOf(driver, { by: 2, on: 2 })), await idsOf(toolsOf(driver, { by: 1, on: 1 }))],
      want: [
        [
          [times(4, "Forbidden"), times(4, "Forbidden")],
          [READ_ONLY, READ_ONLY],
          [ALL_DONE, ALL_DONE],
        ],
        times(4, "Forbidden"),
        ["a"],
      ],
    };
  },

  "[PAGES-14] a deleted page's files are gone": async (driver) => {
    const alice = actingAs(driver, agent(1));
    await Promise.all([alice.ok(PUBLISH, page(1, 0)), alice.ok(PUBLISH, page(2, 0))]);
    const { url } = await alice.ok(SET_ACCESS, sharing(1, LINK_WRITE));
    const [one, two, shown] = [toolsOf(driver, { by: 1, on: 1 }), toolsOf(driver, { by: 1, on: 2 }), viewOf(driver, viewer(2, url))];
    await one.ok(PUT, putting("a", "one"));
    const kept = await two.ok(PUT, putting("a", "two"));
    const before = await shown.ok(FILE_GET, file("a"));
    await alice.ok(DELETE, deleting(1));
    return {
      got: [before.blob, await one.fails(FILE_GET, file("a")), await one.fails(FILE_LIST, {}), await shown.fails(FILE_GET, file("a")), await two.ok(FILE_GET, file("a")), await filesOf(two)],
      want: ["b25l", "NotFound", "NotFound", "NotFound", { file: kept.file, blob: "dHdv" }, [kept.file]],
    };
  },
};
