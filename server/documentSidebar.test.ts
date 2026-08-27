import { describe, expect, it } from "vitest";
import { getDocumentsSidebarToggleLabel } from "../client/src/lib/documentSidebar";

describe("Documents sidebar controls", () => {
  it("uses an explicit state-aware accessible label", () => {
    expect(getDocumentsSidebarToggleLabel(false)).toBe("Collapse Documents sidebar");
    expect(getDocumentsSidebarToggleLabel(true)).toBe("Expand Documents sidebar");
  });
});
