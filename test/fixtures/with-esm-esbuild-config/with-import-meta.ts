describe("suite", () => {
  it("passes when esm is supported", () => {
    if (typeof import.meta.url !== "string") {
      throw new Error("import.meta.url is not a string");
    }
  });
});
