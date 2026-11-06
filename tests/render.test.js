import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPiece, pieceDimensions } from "../src/render.js";
import { defaults } from "../src/model.js";

test("gallery fills the same portrait canvas without stretching for every source aspect ratio", () => {
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
      assert.deepEqual([canvas.width, canvas.height], [1080, 1350]);
      const [source, sx, sy, sw, sh, dx, dy, dw, dh] = draws[0];
      assert.equal(source, image);
      assert.deepEqual([dx, dy, dw, dh], [0, 0, 1080, 1350]);
      assert.ok(
        sx >= 0 &&
          sy >= 0 &&
          sx + sw <= width + 0.001 &&
          sy + sh <= height + 0.001,
      );
      assert.ok(
        Math.abs(dw / sw - dh / sh) < 0.00001,
        "Equal scale on both axes",
      );
      assert.equal(fills.length, 0, "No colored padding is drawn");
      const [, x, y, w, h] = draws[1];
      assert.ok(x >= 0 && y >= 0 && x + w <= 1080 && y + h <= 1350);
      assert.equal(w / h, 2, "Logo is not stretched");
      const preview = pieceDimensions(state, 1, 1350);
      assert.ok(preview.width === 1080 && preview.height === 1350);
      assert.deepEqual(pieceDimensions(state, 0), {
        width: 1080,
        height: 1350,
      });
    }
  }
});
