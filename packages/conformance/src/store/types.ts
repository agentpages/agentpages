import {
  actingAs,
  agent,
  type Cases,
  collection,
  GET,
  guards,
  having,
  markup,
  ofBytes,
  opens,
  page,
  PUBLISH,
  reading,
  readingType,
  text,
  tick,
  timeOf,
  times,
  type,
  TYPE_GET,
  TYPE_LIST,
  TYPE_PUBLISH,
  typed,
  viewer,
} from "./kit.js";

/** The params that publish a version of type 1 with these collections. */
const declaring = (baseVersion: number, collections: unknown): unknown => having(type(1, baseVersion), ["collections", collections]);

/** A schema whose JSON has exactly `bytes` UTF-8 bytes. */
const schemaOfBytes = (bytes: number): unknown => {
  const empty = new TextEncoder().encode(JSON.stringify({ description: "" })).length;
  return { description: ofBytes(bytes - empty) };
};

const tree = { ...collection({}), tree: true };

const flat = collection({});

export const TYPES_CASES: Cases = {
  "[TYPES-1] types_publish creates a type and returns its TypeInfo": async (driver) => {
    const collections = { slides: { schema: { type: "object", required: ["title"] }, tree: true }, notes: { schema: {} } };
    const exports = { pptx: { title: text(2), mimeType: text(3), extension: text(4) } };
    const deck = await actingAs(driver, agent(1)).ok(TYPE_PUBLISH, { ...type(1, 0), instructions: text(5), collections, exports });
    return {
      got: deck,
      want: {
        typeId: "type-1",
        version: 1,
        title: "Text 1",
        description: "Text 1",
        instructions: "Text 5",
        collections: { slides: { schema: { type: "object", required: ["title"] }, tree: true }, notes: { schema: {} } },
        exports: { pptx: { title: "Text 2", mimeType: "Text 3", extension: "Text 4" } },
        updatedAt: deck.updatedAt,
      },
    };
  },

  "[TYPES-2] types_get returns the TypeInfo and exactly the content that was published": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const first = await alice.ok(TYPE_PUBLISH, having(type(1, 0), ["content", { html: markup(2), ...guards(2) }]));
    tick(driver);
    const second = await alice.ok(TYPE_PUBLISH, having(type(1, 1), ["title", text(3)]));
    return {
      got: [
        await alice.ok(TYPE_GET, having(readingType(1), ["version", 1])),
        await alice.ok(TYPE_GET, readingType(1)),
        await alice.fails(TYPE_GET, having(readingType(1), ["version", 3])),
        await alice.fails(TYPE_GET, readingType(2)),
        timeOf(second.updatedAt) - timeOf(first.updatedAt),
        second.title,
      ],
      want: [
        { ...first, content: { html: markup(2), ...guards(2) } },
        { ...second, content: { html: "<!doctype html><title>1</title>" } },
        "NotFound",
        "NotFound",
        1000,
        text(3),
      ],
    };
  },

  "[TYPES-3] types_list returns the TypeInfo of the current version of every type": async (driver) => {
    const [alice, bob] = [actingAs(driver, agent(1)), actingAs(driver, agent(2))];
    await alice.ok(TYPE_PUBLISH, type(2, 0));
    const second = await alice.ok(TYPE_PUBLISH, type(2, 1));
    const first = await bob.ok(TYPE_PUBLISH, type(1, 0));
    return {
      got: [await alice.ok(TYPE_LIST, {}), await bob.ok(TYPE_LIST, {}), second.version],
      want: [{ types: [first, second] }, { types: [first, second] }, 2],
    };
  },

  "[TYPES-4] types_publish succeeds only from the current version, and a published version never changes": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const early = await alice.fails(TYPE_PUBLISH, type(1, 1));
    const first = await alice.ok(TYPE_PUBLISH, type(1, 0));
    const before = await alice.ok(TYPE_GET, readingType(1));
    const stale = [await alice.fails(TYPE_PUBLISH, type(1, 0)), await alice.fails(TYPE_PUBLISH, type(1, 2))];
    const second = await alice.ok(TYPE_PUBLISH, { ...type(1, 1), title: text(2), content: { html: markup(2) } });
    return {
      got: [[early, ...stale], [first.version, second.version, second.title], await alice.ok(TYPE_GET, having(readingType(1), ["version", 1]))],
      want: [times(3, "Conflict"), [1, 2, text(2)], { ...before, title: text(1), content: { html: markup(1) } }],
    };
  },

  "[TYPES-5] only its owner publishes a version of a type, and every MCP principal reads it and publishes pages of it": async (driver) => {
    const [alice, bob] = [actingAs(driver, agent(1)), actingAs(driver, agent(2))];
    const deck = await alice.ok(TYPE_PUBLISH, type(1, 0));
    return {
      got: [
        await bob.fails(TYPE_PUBLISH, type(1, 1)),
        await bob.ok(TYPE_GET, readingType(1)),
        await bob.ok(TYPE_LIST, {}),
        (await bob.ok(PUBLISH, having(page(1, 0), ["content", typed(1, 1)]))).version,
        (await bob.ok(GET, reading(1))).content,
        (await alice.ok(TYPE_PUBLISH, type(1, 1))).version,
      ],
      want: ["Forbidden", { ...deck, content: { html: markup(1) } }, { types: [deck] }, 1, typed(1, 1), 2],
    };
  },

  "[TYPES-6] types_list orders by typeId, ascending by code point": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const ids = ["b", "B", "a_1", "a-1", "10", "9"];
    await Promise.all(ids.map((id) => alice.ok(TYPE_PUBLISH, having(type(1, 0), ["typeId", id]))));
    const { types } = await alice.ok(TYPE_LIST, {});
    return { got: types.map((listed) => listed.typeId), want: ["10", "9", "B", "a-1", "a_1", "b"] };
  },

  "[TYPES-7] a typed page renders the html, csp and permissions of its type version": async (driver) => {
    const alice = actingAs(driver, agent(1));
    await alice.ok(TYPE_PUBLISH, having(type(1, 0), ["content", { html: markup(2), ...guards(3) }]));
    const { url } = await alice.ok(PUBLISH, having(page(1, 0), ["content", typed(1, 1)]));
    return {
      got: [(await opens(driver, viewer(1, url))).view, (await alice.ok(GET, reading(1))).content],
      want: [
        { html: markup(2), ...guards(3) },
        { kind: "type", typeId: "type-1", typeVersion: 1 },
      ],
    };
  },

  "[TYPES-8] pages_publish with a type or a type version that does not exist is not found": async (driver) => {
    const alice = actingAs(driver, agent(1));
    await alice.ok(TYPE_PUBLISH, type(1, 0));
    const missing = [typed(2, 1), typed(1, 2), typed(1, 0)].map((content) => alice.fails(PUBLISH, having(page(1, 0), ["content", content])));
    const refused = await Promise.all(missing);
    await alice.ok(PUBLISH, having(page(1, 0), ["content", typed(1, 1)]));
    return { got: [refused, (await alice.ok(GET, reading(1))).content], want: [times(3, "NotFound"), typed(1, 1)] };
  },

  "[TYPES-10] a page moves to a newer type version only when a version of the page names it": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const first = await alice.ok(TYPE_PUBLISH, type(1, 0));
    const { url } = await alice.ok(PUBLISH, having(page(1, 0), ["content", typed(1, 1)]));
    const second = await alice.ok(TYPE_PUBLISH, having(type(1, 1), ["content", { html: markup(2) }]));
    const before = await opens(driver, viewer(1, url));
    await alice.ok(PUBLISH, having(page(1, 1), ["content", typed(1, 2)]));
    const after = await opens(driver, viewer(1, url));
    return {
      got: [before.view, before.type, after.view, after.type],
      want: [{ html: markup(1) }, first, { html: markup(2) }, second],
    };
  },

  "[TYPES-12] a collection is a tree in every version of a type or in none": async (driver) => {
    const alice = actingAs(driver, agent(1));
    await alice.ok(TYPE_PUBLISH, declaring(0, { outline: tree, notes: flat }));
    const noLongerTree = await alice.fails(TYPE_PUBLISH, declaring(1, { outline: flat, notes: flat }));
    const nowTree = await alice.fails(TYPE_PUBLISH, declaring(1, { outline: tree, notes: tree }));
    const second = await alice.ok(TYPE_PUBLISH, declaring(1, { notes: flat, tags: tree }));
    const declaredAgain = await alice.fails(TYPE_PUBLISH, declaring(2, { outline: flat }));
    const third = await alice.ok(TYPE_PUBLISH, declaring(2, { outline: tree, extra: flat }));
    return {
      got: [[noLongerTree, nowTree, declaredAgain], second.collections, third.collections, third.version],
      want: [
        times(3, "InvalidParams"),
        { notes: { schema: {} }, tags: { schema: {}, tree: true } },
        { outline: { schema: {}, tree: true }, extra: { schema: {} } },
        3,
      ],
    };
  },

  "[TYPES-13] a key of exports is an id other than pdf": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const format = { title: text(1), mimeType: text(2), extension: text(3) };
    const reserved = await alice.fails(TYPE_PUBLISH, having(type(1, 0), ["exports", { pdf: format }]));
    const notAnId = await alice.fails(TYPE_PUBLISH, having(type(1, 0), ["exports", { "not an id": format }]));
    const deck = await alice.ok(TYPE_PUBLISH, having(type(1, 0), ["exports", { "pdf-a_2": format }]));
    return {
      got: [reserved, notAnId, deck.exports],
      want: ["InvalidParams", "InvalidParams", { "pdf-a_2": { title: "Text 1", mimeType: "Text 2", extension: "Text 3" } }],
    };
  },

  "[TYPES-14] a schema that is not valid JSON Schema 2020-12, or refers to anything outside itself, is malformed": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const local = { $defs: { text: { type: "string" } }, properties: { title: { $ref: "#/$defs/text" } } };
    const broken = [{ type: 7 }, { $ref: "https://schemas.example/task.json" }, { minimum: {} }, { notAKeyword: 1 }];
    const refused = broken.map((schema) => alice.fails(TYPE_PUBLISH, declaring(0, { fine: collection(local), broken: collection(schema) })));
    const errors = await Promise.all(refused);
    const missing = await alice.fails(TYPE_GET, readingType(1));
    const deck = await alice.ok(TYPE_PUBLISH, declaring(0, { fine: collection(local) }));
    return {
      got: [errors, missing, deck.collections],
      want: [
        times(4, "InvalidParams"),
        "NotFound",
        { fine: { schema: { $defs: { text: { type: "string" } }, properties: { title: { $ref: "#/$defs/text" } } } } },
      ],
    };
  },

  "[TYPES-15] a schema larger than maxSchemaBytes, as UTF-8 JSON without whitespace, is beyond the limit": async (driver) => {
    const alice = actingAs(driver, agent(1));
    const { maxSchemaBytes } = driver.capability.limits;
    const largest = schemaOfBytes(maxSchemaBytes);
    const tooLarge = await alice.fails(TYPE_PUBLISH, declaring(0, { small: flat, tooLarge: collection(schemaOfBytes(maxSchemaBytes + 1)) }));
    const missing = await alice.fails(TYPE_GET, readingType(1));
    const deck = await alice.ok(TYPE_PUBLISH, declaring(0, { small: flat, largest: collection(largest) }));
    return {
      got: [tooLarge, missing, deck.collections],
      want: ["LimitExceeded", "NotFound", { small: { schema: {} }, largest: { schema: largest } }],
    };
  },
};
