import { describe, expect, it } from "vitest";
import { getFitScale, getRenderScale } from "../client/src/lib/pdfViewerMath";

describe("PDF viewer scale calculations", () => {
  const page = { width: 600, height: 800 };

  it("fits a page completely inside its measured reader container", () => {
    expect(getFitScale("page", page, { width: 624, height: 520 })).toBeCloseTo(0.59, 2);
  });

  it("uses available width for narrow portrait readers", () => {
    expect(getFitScale("width", page, { width: 390, height: 500 })).toBeCloseTo(0.57, 2);
  });

  it("never produces horizontal document overflow from a manual zoom request", () => {
    const scale = getRenderScale("manual", 2, page, { width: 624, height: 520 });
    expect(scale).toBeCloseTo(0.96, 2);
  });

  it("permits a scale below the normal manual minimum when a very narrow reader requires it", () => {
    const scale = getRenderScale("manual", 1, page, { width: 160, height: 300 });
    expect(scale).toBeCloseTo(0.2, 2);
  });

  it("uses the available height efficiently on a large desktop reader", () => {
    const scale = getRenderScale("page", 1, page, { width: 1450, height: 800 });
    expect(scale).toBeCloseTo(0.94, 2);
  });
});
