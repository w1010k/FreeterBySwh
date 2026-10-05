/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// For CSS
declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

// MDXEditor's stylesheet, a package export that ships no type declaration
// (the '*.css' pattern above does not cover package subpaths).
declare module '@mdxeditor/editor/style.css';

// For SCSS
declare module '*.scss' {
  const classes: { [key: string]: string };
  export default classes;
}
