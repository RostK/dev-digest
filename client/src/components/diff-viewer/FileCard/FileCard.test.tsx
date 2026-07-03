/**
 * FileCard — file-level scroll anchor (SPEC-04 Review Focus deep-link).
 *
 * The Diff tab needs a stable id to scroll to even when the focus line isn't a
 * highlighted finding line (or the file is collapsed). Asserts the root
 * container carries `id="diff-file-{path}"`, resolvable via
 * `document.getElementById` (the mechanism DiffTab's scroll effect uses).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/lib/rate.ts",
  additions: 4,
  deletions: 1,
  patch: "@@ -1,1 +1,4 @@\n context\n+add1\n+add2\n+add3",
};

function renderCard(file: PrFile = FILE) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <FileCard file={file} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard", () => {
  it("renders a stable file-level anchor id resolvable via getElementById", () => {
    renderCard();
    const el = document.getElementById(`diff-file-${FILE.path}`);
    expect(el).not.toBeNull();
    expect(el).toHaveTextContent(FILE.path);
  });
});
