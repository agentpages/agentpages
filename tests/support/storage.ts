import { type MakeStorage, storageSuite } from "@agentpages/conformance";
import { whole } from "./suites.ts";

/** What `storageSuite` proves of a storage, by the requirement of the spec each test serves. */
const STORAGE_TITLES = [
  "[REL-6] what a transaction put is read back once it resolves",
  "[REL-7] the writes of a transaction are saved together, and none shows before",
  "[REL-7] a run reads only committed rows, never its own writes, which are saved in the order it made them",
  "[REL-7] a value is saved as it is when it is put, whatever happens to it afterwards",
  "[REL-7] a read returns a copy: a change of it changes nothing that is saved",
  "[REL-7] a key named __proto__ in a value is read back as it was put",
  "[REL-8] a transaction rejects with what its run threw, and the next run on its lock goes on",
  "[REL-8] a run that throws saves none of the writes that a run that returns saves",
  "[REL-2] a transaction resolves with what its run returned",
  "[COMMON-4] a scan returns the keys under its prefix in code point order, up to its limit",
  "[COMMON-4] a scan after a key returns only what comes beyond it, whether or not the key exists",
  "[COMMON-4] a reverse scan returns the keys from the last one down, and after a key only those below it",
  "[COMMON-4] a prefix covers the keys that go on from it with a space and with a tilde, in scan and deleteRange",
  "[PAGES-6] deleteRange removes exactly the keys under its prefix",
  "[REL-2] runs that share a lock key are serial, however their steps interleave",
  "[REL-2] a run waits for every run before it that holds one of its locks",
  "[REL-2] a run does not wait for runs that hold none of its locks",
];

/** Registers `storageSuite` for the storages that `make` makes. */
export const wholeStorageSuite = (of: string, make: MakeStorage): void => {
  whole({
    of,
    titles: STORAGE_TITLES,
    register: () => {
      storageSuite(make);
    },
  });
};
