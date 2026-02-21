# Index and TOC build (markdown_index)

**Scope:** How `book-agent index` builds `index.json` from a book folder (markdown + optional meta JSON), and how TOC/toc/search/read use it.

---

## 1. Pipeline summary

1. **Parse TOC table** from the markdown → list of `(title, toc_page)`.
2. **Layout model** from meta JSON (if present) → classifies meta entries (section vs margin vs running header).
3. **Offset** (optional): infer `pdf_to_toc_offset` from first matched TOC entry so `pdf_page = toc_page + offset`.
4. **Resolve each TOC entry:** get `pdf_page` from meta (if layout classifies as section) or from offset; find the matching `##` heading in the MD near that page → `md_start_line`; set `pdf_page` from the `{N}` page marker when present.
5. **Build tree** from section numbers (1 → depth 1, 1.1 → 2, …) and write `chapters` + `annotations`.

---

## 2. Two behaviors (general)

### 2.1 TOC table scoped to Contents section

- **What:** Only table rows between a `## Contents` (or `## Table of Contents`) heading and the next body heading (`## <span id="page-`, `## Preface`, `## Chapter`) are parsed as the TOC.
- **Why:** Books often have other tables (examples, algorithms) that look like `| title | page |`. Parsing every table as TOC produced hundreds of bogus entries and broke Sutton.
- **Generality:** If the markdown has **no** `## Contents` / `## Table of Contents`, the code falls back to the **whole file** (same as before). So books without a dedicated Contents section (e.g. Mackay, Bishop in some exports) are unchanged.

### 2.2 Full-document heading fallback

- **What:** When `pdf_page` is unknown (meta didn’t match, e.g. layout classified all entries as “margin”), the indexer still searches the **entire** markdown for a `##` heading that matches the TOC title and uses the `{N}` page marker above it for `pdf_page`.
- **Why:** Some PDFs (e.g. Sutton) have TOC/section titles in a column that the layout model labels as “margin”, so meta is never used and previously we got no nodes → empty `chapters`.
- **Generality:** When meta and offset already give a valid `pdf_page`, we still prefer the **page-local** search first; the full-doc search only runs when that fails or when `pdf_page` is missing. So books that already index correctly (Mackay, Bishop) keep the same behavior.

---

## 3. Requirements on the markdown

- **Page markers:** Lines matching `{N}----` (e.g. `{18}------------------------------------------------`) so the indexer can map line ranges to PDF pages. If absent, `pdf_page` can stay unset (TOC still works; pages show as `?`).
- **Headings:** Section titles appear as `## Title` or `## <span id="page-...">Title` so they can be matched to TOC titles (after normalizing and stripping section numbers).
- **TOC table:** For “Contents scoping” to apply, the file should have a `## Contents` (or `## Table of Contents`) section containing the main TOC table.

---

## 4. Testing after the change

Re-indexing and `book-agent toc` were checked for:

| Book        | Folder      | Result |
|------------|-------------|--------|
| Sutton     | 1d9eddab    | Was broken (empty chapters); now 19 top-level, 164 nodes, TOC correct. |
| Mackay     | 2a838b6a    | No `## Contents` → full-file TOC parse; 49 chapters, TOC unchanged. |
| Bishop     | ecef4396    | No `## Contents` → full-file; 56 top-level, 303 nodes, TOC correct. |
| Bishop (alt)| a81ead46   | No page markers in MD → `pdf_page` is `?`; 32 top-level, 275 nodes; TOC structure correct. |

So the change is **backward compatible** and **general**: it fixes Sutton (Contents + margin layout) and does not regress Mackay or Bishop.

### 2.3 Nesting from markdown heading level

- **What:** When we resolve a TOC entry to a line in the markdown, we read the **heading level** at that line (number of `#`: `##` → 2, `###` → 3, `####` → 4). That level is used as the node’s **depth** for building the tree. If the line is not a heading (e.g. page-marker fallback), we fall back to depth from the title (e.g. section numbers like 1.2 → 2).
- **Why:** Books like 7 Habits have no TOC table; we build TOC from meta. Without heading level, every entry would get depth 1 and the TOC would be flat. Using the actual `##` / `###` / `####` from the MD gives correct nesting (Part One → sections → subsections).
- **Generality:** When the TOC comes from a table (Sutton, Bishop), we still locate headings in the MD; those headings have a level, so we use it. So both table-sourced and meta-sourced TOCs now nest according to the document’s heading hierarchy.
