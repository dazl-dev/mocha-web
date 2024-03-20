describe("suite", () => {
  it("passes when transpiled with typescript", () => {
    if (process.env["DEFINED_VIA_CONFIG"] !== "works") {
      throw new Error("should never happen");
    }
  });
});
