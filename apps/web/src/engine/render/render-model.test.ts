import { describe, expect, it } from "vitest";
import { buildRenderModel } from "./render-model";

describe("render model", () => {
  it("splits nodes into container and leaf layers", () => {
    const model = buildRenderModel(
      [{ id: "container", container: true }, { id: "leaf", container: false }],
      [{ id: "edge" }],
      (node) => node.container
    );

    expect(model.containerNodes.map((node) => node.id)).toEqual(["container"]);
    expect(model.leafNodes.map((node) => node.id)).toEqual(["leaf"]);
    expect(model.edges).toEqual([{ id: "edge" }]);
  });
});
