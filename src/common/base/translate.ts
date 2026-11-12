/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Caps on one `translate-texts` IPC call. The Webpage widget collects at most this much text per round and runs more
// rounds for longer pages; main rejects a call over any cap.
export const translateMaxItems = 500;
export const translateMaxChars = 50000;
// The widget leaves a longer single text untranslated, so one text always fits in one request to the service.
export const translateMaxTextChars = 4000;
