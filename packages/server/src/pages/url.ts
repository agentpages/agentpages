import { UUID_PATTERN } from "@agentpages/protocol";

const UUID_LENGTH = 36;

export interface Link {
  baseUrl: string;
  pageId: string;
  secret: string;
}

export const urlOf = ({ baseUrl, pageId, secret }: Link): string => `${baseUrl}${pageId}/${secret}`;

/** The page a `url` of this Store names, whether or not the page exists and the secret is current. */
export const pageIdIn = (url: string, baseUrl: string): string | undefined => {
  const pageId = url.slice(baseUrl.length, baseUrl.length + UUID_LENGTH);
  return url.startsWith(baseUrl) && UUID_PATTERN.test(pageId) ? pageId : undefined;
};
