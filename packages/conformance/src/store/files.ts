import { type Empty, type FileInfo, type FilesGetResult, type FilesLimits, type FilesListResult, type FilesPutResult, METHOD_SCHEMAS, toBase64 } from "@agentpages/protocol";
import type { Driver } from "../contract.js";
import { actingAs, agent, anonymous, type Cases, type Check, DELETE, deleting, having, inPagesOfTwo, inTurn, LINK_READ, LINK_WRITE, opId, page, PRIVATE, PUBLISH, SET_ACCESS, sharing, tick, timeOf, times, viewer } from "./kit.js";
import { onEach, opOf, type StateOp, type Surface, toolsOf, twoSides, viewOf } from "./surface.js";

const PUT: StateOp<FilesPutResult> = opOf("files/put", METHOD_SCHEMAS["agentpages/files/put"]);
const FILE_GET: StateOp<FilesGetResult> = opOf("files/get", METHOD_SCHEMAS["agentpages/files/get"]);
const FILE_LIST: StateOp<FilesListResult> = opOf("files/list", METHOD_SCHEMAS["agentpages/files/list"]);
const FILE_DELETE: StateOp<Empty> = opOf("files/delete", METHOD_SCHEMAS["agentpages/files/delete"]);

const BINARY = "application/octet-stream";

interface Putting {
  opId: string;
  id: string;
  name: string;
  mimeType: string;
  blob: string;
}

/** The params that put these bytes as the file `id`, under an `opId` of their own. */
const putting = (id: string, bytes: readonly number[]): Putting => ({
  opId: opId(),
  id,
  name: `${id}.bin`,
  mimeType: BINARY,
  blob: toBase64(Uint8Array.from(bytes)),
});

/** The params that read or name the file `id`. */
const file = (id: string): { id: string } => ({ id });

/** The params that delete the file `id`, under an `opId` of their own. */
const removing = (id: string): { opId: string; id: string } => ({ opId: opId(), id });

/** As many bytes as `count`, of every value. */
const ofSize = (count: number): number[] => Array.from({ length: count }, (_, at) => at % 256);

const limitsOf = (driver: Driver): FilesLimits => Object.assign({}, driver.capability.files);

/** The files a list returns, all of them. */
const filesOf = async (surface: Surface): Promise<FileInfo[]> => (await surface.ok(FILE_LIST, {})).files;

/** Puts one file of one byte for each id, in turn, and returns them. */
const putEach = async (surface: Surface, ids: readonly string[]): Promise<FileInfo[]> => {
  const files: FileInfo[] = [];
  await inTurn(ids, async (id) => files.push((await surface.ok(PUT, putting(id, [1]))).file));
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
    const first = await filing.ok(PUT, putting("a", [0, 255, 7]));
    tick(driver);
    const later = await filing.ok(PUT, putting("b", [1]));
    const { updatedAt, updatedBy } = first.file;
    return {
      got: [first, updatedBy.kind, later.file.updatedBy, timeOf(later.file.updatedAt) - timeOf(updatedAt)],
      want: [{ file: { id: "a", name: "a.bin", mimeType: BINARY, size: 3, updatedAt, updatedBy } }, filing.kind, updatedBy, 1000],
    };
  },

  "[FILES-2] get returns the blob that was put": async (filing) => {
    const params = putting("a", [0, 255, 7, 128]);
    const put = await filing.ok(PUT, params);
    await filing.ok(PUT, putting("b", [9]));
    return { got: await filing.ok(FILE_GET, file("a")), want: { file: put.file, blob: params.blob } };
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
    return { got: (await filesOf(filing)).map(({ id }) => id), want: ["10", "9", "B", "a-1", "a_1", "b"] };
  },

  "[FILES-6] put replaces name, type and bytes": async (filing, driver) => {
    const first = await filing.ok(PUT, putting("a", [1, 2, 3]));
    tick(driver);
    const other = { ...putting("a", [9]), name: "other.txt", mimeType: "text/plain" };
    const second = await filing.ok(PUT, other);
    const { updatedAt } = second.file;
    return {
      got: [second, timeOf(updatedAt) - timeOf(first.file.updatedAt), await filing.ok(FILE_GET, file("a")), await filesOf(filing)],
      want: [
        { file: { id: "a", name: "other.txt", mimeType: "text/plain", size: 1, updatedAt, updatedBy: first.file.updatedBy } },
        1000,
        { file: second.file, blob: other.blob },
        [second.file],
      ],
    };
  },

  "[FILES-7] a file of maxFileBytes is stored, one byte more is LimitExceeded": async (filing, driver) => {
    const { maxFileBytes } = limitsOf(driver);
    const largest = putting("a", ofSize(maxFileBytes));
    const stored = await filing.ok(PUT, largest);
    return {
      got: [stored.file.size, await filing.fails(PUT, putting("b", ofSize(maxFileBytes + 1))), (await filing.ok(FILE_GET, file("a"))).blob === largest.blob, await filesOf(filing)],
      want: [maxFileBytes, "LimitExceeded", true, [stored.file]],
    };
  },

  "[FILES-8] get of a missing file is NotFound": async (filing) => {
    const before = await filing.fails(FILE_GET, file("a"));
    await filing.ok(PUT, putting("b", [1]));
    return { got: [before, await filing.fails(FILE_GET, file("a"))], want: ["NotFound", "NotFound"] };
  },

  "[FILES-4] [FILES-9] delete removes the file, and succeeds on a missing one": async (filing) => {
    const [, kept] = await putEach(filing, ["a", "b"]);
    const deleted = await filing.ok(FILE_DELETE, removing("a"));
    const after = [await filing.fails(FILE_GET, file("a")), await filesOf(filing)];
    return {
      got: [deleted, after, await filing.ok(FILE_DELETE, removing("a")), await filing.ok(FILE_DELETE, removing("never")), await filesOf(filing)],
      want: [{}, ["NotFound", [kept]], {}, {}, [kept]],
    };
  },

  "[FILES-11] an empty file is stored": async (filing) => {
    const empty = { ...putting("a", []), name: "../ré sumé\n", mimeType: "not a type" };
    const { file: stored } = await filing.ok(PUT, empty);
    return {
      got: [stored.size, stored.name, stored.mimeType, await filing.ok(FILE_GET, file("a")), await filesOf(filing)],
      want: [0, empty.name, "not a type", { file: stored, blob: "" }, [stored]],
    };
  },

  "[COMMON-8] a blob that is not canonical base64 is InvalidParams": async (filing) => {
    const blobs = ["AB==", "AAB=", "A", "AAA", "AA=A", "QQ", "QUJD\n", "QUJ-", "====", 7];
    const refused = await Promise.all(blobs.map((blob) => filing.fails(PUT, having(putting("a", []), ["blob", blob]))));
    const canonical = await filing.ok(PUT, having(putting("b", []), ["blob", "AQ=="]));
    return { got: [refused, canonical.file.size, await filesOf(filing)], want: [times(10, "InvalidParams"), 1, [canonical.file]] };
  },

  "[REL-2] a repeated put returns the first file after another put replaced it": async (filing, driver) => {
    const params = putting("a", [1]);
    const first = await filing.ok(PUT, params);
    tick(driver);
    const second = await filing.ok(PUT, putting("a", [2, 3]));
    return {
      got: [await filing.ok(PUT, params), await filing.ok(PUT, params), (await filing.ok(FILE_GET, file("a"))).file, await filesOf(filing)],
      want: [first, first, second.file, [second.file]],
    };
  },

  "[REL-30] a repeated oversized put with a new opId is LimitExceeded, and with a used opId and other params InvalidParams": async (filing, driver) => {
    const [used, removed] = [putting("a", [1]), removing("c")];
    const first = await filing.ok(PUT, used);
    await filing.ok(FILE_DELETE, removed);
    const tooLarge = putting("b", ofSize(limitsOf(driver).maxFileBytes + 1));
    return {
      got: [
        [await filing.fails(PUT, tooLarge), await filing.fails(PUT, tooLarge), await filing.fails(PUT, { ...tooLarge, opId: used.opId })],
        [await filing.fails(PUT, { ...used, name: "other" }), await filing.fails(FILE_DELETE, { ...removed, id: "a" }), await filing.fails(FILE_DELETE, { ...removed, opId: used.opId })],
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
    surface.outcome(PUT, putting("b", [1])),
    surface.outcome(FILE_DELETE, removing("b")),
  ]);

/** What a signed-in link holder and an anonymous one get on page `n` of agent 1, which has this access and the file `a`. */
const heldWith = async (driver: Driver, [n, access]: [number, string]): Promise<string[][]> => {
  const alice = actingAs(driver, agent(1));
  await alice.ok(PUBLISH, page(n, 0));
  const { url } = await alice.ok(SET_ACCESS, sharing(n, access));
  await toolsOf(driver, { by: 1, on: n }).ok(PUT, putting("a", [1]));
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
      got: [held, await outcomes(toolsOf(driver, { by: 2, on: 2 })), (await filesOf(toolsOf(driver, { by: 1, on: 1 }))).map(({ id }) => id)],
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
    const [first, second] = [putting("a", [1]), putting("a", [2, 3])];
    await one.ok(PUT, first);
    const kept = await two.ok(PUT, second);
    const before = await shown.ok(FILE_GET, file("a"));
    await alice.ok(DELETE, deleting(1));
    return {
      got: [before.blob, await one.fails(FILE_GET, file("a")), await one.fails(FILE_LIST, {}), await shown.fails(FILE_GET, file("a")), await two.ok(FILE_GET, file("a")), await filesOf(two)],
      want: [first.blob, "NotFound", "NotFound", "NotFound", { file: kept.file, blob: second.blob }, [kept.file]],
    };
  },
};
