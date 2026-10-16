import { describe, expect, it } from "vitest";
import { defaultData, parseData } from "../src/store";

describe("saved data", () => {
  it("starts new players on Must fix to continue", () => {
    expect(defaultData("physical").settings.errorMode).toBe("block");
    expect(defaultData("touch").settings.errorMode).toBe("block");
  });

  it("keeps the error setting existing players already have", () => {
    for (const errorMode of ["backspace", "skip", "block"] as const) {
      const saved = defaultData("physical");
      saved.settings.errorMode = errorMode;
      expect(parseData(JSON.stringify(saved)).settings.errorMode).toBe(errorMode);
    }
    // The first saved format already stored it.
    const v1 = { version: 1, settings: { activeProfile: "physical", round: { kind: "words", count: 25 }, errorMode: "backspace" }, profiles: {} };
    expect(parseData(JSON.stringify(v1)).settings.errorMode).toBe("backspace");
  });
});
