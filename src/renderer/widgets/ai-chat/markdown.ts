/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Marked, Tokens } from 'marked';
import { isAllowedExternalUrl } from '@common/helpers/isAllowedExternalUrl';
import { escapeHtml } from '@common/helpers/escapeHtml';


/**
 * Agent answers are untrusted text shown inside the app page: raw HTML is shown as text,
 * links keep only http(s)/mailto (opened in the browser by the view), images show their alt text.
 */
const marked = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text),
    link({ href, tokens }: Tokens.Link) {
      const label = this.parser.parseInline(tokens);
      return isAllowedExternalUrl(href) ? `<a href="${escapeHtml(href)}" data-external>${label}</a>` : label;
    },
    image: ({ text }: Tokens.Image) => escapeHtml(text),
  },
});

/** The latest results by text, oldest dropped first. */
const cache = new Map<string, string>();
// ponytail: the size of a full conversation (MAX_ITEMS), so a remount after Memory Saver parses nothing again;
// it holds about twice the text of 500 answers. Lower it if long answers make that matter.
const CACHE_SIZE = 500;

export function renderMarkdown(text: string): string {
  let html = cache.get(text);
  if (html === undefined) {
    html = marked.parse(text, { async: false });
    if (cache.size >= CACHE_SIZE) {
      cache.delete(cache.keys().next().value as string);
    }
    cache.set(text, html);
  }
  return html;
}
