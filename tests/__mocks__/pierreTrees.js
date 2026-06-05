/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// @pierre/trees core entry is only used for type-only imports in app code; the
// real package is ESM-only and cannot load under Jest. Stub it out.
module.exports = {};
