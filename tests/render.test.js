import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPiece, pieceDimensions } from "../src/render.js";
import { defaults } from "../src/model.js";

test("gallery exports the whole photo edge to edge with logo inside every aspect ratio", () => {
  for (const [width, height] of [
    [1080, 810],
    [810, 1080],
    [1200, 1200],
    [3000, 500],
  ]) {
    for (const logoPosition of ["left", "right"]) {
      const image = { naturalWidth: width, naturalHeight: height };
      const logoImage = { naturalWidth: 240, naturalHeight: 120 };
      const state = {
        settings: { ...defaults, logoPosition },
        photos: [{ image }, { image }],
        logoImage,
      };
      const draws = [],
        fills = [];
      const ctx = {
        save() {},
        restore() {},
        setTransform() {},
        clearRect() {},
        drawImage(...args) {
          draws.push(args);
        },
        fillRect(...args) {
          fills.push(args);
        },
      };
      const canvas = { getContext: () => ctx };
      renderPiece(canvas, state, 1);
      assert.deepEqual([canvas.width, canvas.height], [width, height]);
      assert.deepEqual(draws[0], [image, 0, 0, width, height]);
      assert.equal(fills.length, 0, "No colored padding is drawn");
      const [, x, y, w, h] = draws[1];
      assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height);
      assert.equal(w / h, 2, "Logo is not stretched");
      const preview = pieceDimensions(state, 1, 1350);
      assert.ok(
        Math.abs(preview.width / preview.height - width / height) < 0.01,
      );
      assert.deepEqual(pieceDimensions(state, 0), {
        width: 1080,
        height: 1350,
      });
    }
  }
});
