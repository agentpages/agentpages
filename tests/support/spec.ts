import { readFileSync } from "node:fs";
import { isObject } from "./json.ts";

export interface Exchange {
  tag: string;
  name: string;
  params: string;
  result: string;
  section: string;
}

export interface ErrorRow {
  name: string;
  code: number;
  retryable: boolean;
  meaning: string;
}

interface Row {
  section: string;
  cells: string[];
}

export const spec: string = readFileSync(new URL("../../spec/agentpages.md", import.meta.url), "utf8");

const fenced = (language: string): string[] =>
  [...spec.matchAll(new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\`\`\``, "gu"))].map((match) => match[1] ?? "");

const parseJson = (text: string): unknown => JSON.parse(text);

/** Every `ts` block of the spec, in order. */
export const typeBlocks: string = fenced("ts").join("\n");

export const jsonExamples: unknown[] = fenced("json").map(parseJson);

const cellsOf = (line: string): string[] =>
  line
    .split(/(?<!\\)\|/u)
    .slice(1, -1)
    .map((cell) => cell.trim().replaceAll("`", "").replaceAll(String.raw`\|`, "|"));

const rowsOf = (section: string): Row[] =>
  section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => ({ section: section.split("\n", 1).join(""), cells: cellsOf(line) }));

const rows: Row[] = spec.split(/^#{2,3} /mu).flatMap(rowsOf);

const isTagged = (row: Row): boolean => /^\[[A-Z]+-\d+\]$/u.test(row.cells[0] ?? "");

const exchangeOf = ({ section, cells }: Row): Exchange => {
  const [tag = "", name = "", params = "", result = ""] = cells;
  return { tag, name, params, result, section };
};

const exchanges: Exchange[] = rows.filter(isTagged).map(exchangeOf);

export const methodRows: Exchange[] = exchanges.filter((row) => row.name.startsWith("agentpages/"));

export const toolRows: Exchange[] = exchanges.filter((row) => /^[a-z]+(?:_[a-z]+)+$/u.test(row.name));

const errorOf = ({ cells }: Row): ErrorRow => {
  const [name = "", code = "", retryable = "", meaning = ""] = cells;
  return { name, code: Number(code), retryable: retryable === "yes", meaning };
};

export const errorRows: ErrorRow[] = rows.filter((row) => /^-\d+$/u.test(row.cells[1] ?? "")).map(errorOf);

/** The words a sentence of the spec states, such as the `pdf` of "other than `pdf`". */
export const textIn = (sentence: RegExp): string => {
  const text = sentence.exec(spec)?.[1];
  if (text === undefined) throw new Error(`The spec no longer says ${sentence.source}`);
  return text;
};

/** The number a sentence of the spec states, such as the 50 of "At most 50 diagnostics". */
export const numberIn = (sentence: RegExp): number => Number(textIn(sentence));

/** The spec's example of what a Store advertises, keyed by extension identifier. */
export const advertised: Record<string, unknown> = jsonExamples.filter(isObject).find((example) => !("method" in example)) ?? {};

/** The capability object of that example. */
export const capabilityExample: unknown = Object.values(advertised)[0];

const TYPES: Record<string, string> = { string: "string", number: "number", boolean: "boolean" };

const typeOfField = ([key, value]: [string, unknown], optional: RegExp): string =>
  `${key}${optional.test(key) ? "?" : ""}: ${typeOfExample(value, /^$/u)}`;

/** The type of a JSON example. Section 3: every feature of a capability may be absent. */
export function typeOfExample(value: unknown, optional = /^(?:state|identity|files|render)$/u): string {
  return isObject(value)
    ? `{ ${Object.entries(value)
        .map((field) => typeOfField(field, optional))
        .join("; ")} }`
    : (TYPES[typeof value] ?? "never");
}
