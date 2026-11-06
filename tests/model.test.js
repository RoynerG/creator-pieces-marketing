import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptionDefaults } from "../src/caption-model.js";
import {
  containRect,
  coverRect,
  normalizeFraming,
  normalizeSettings,
  safeFilename,
  validateProject,
  defaults,
} from "../src/model.js";

test("portrait framing keeps image geometry and reaches each edge without gaps", () => {
  for (const [iw, ih] of [
    [1600, 900],
    [900, 1600],
    [1080, 1350],
  ]) {
    for (const x of [0, 50, 100])
      for (const y of [0, 50, 100]) {
        const r = coverRect(iw, ih, 1080, 1350, { x, y });
        assert.ok(Math.abs(r.width / r.height - 1080 / 1350) < 1e-9);
        assert.ok(
          r.x >= 0 &&
            r.y >= 0 &&
            r.x + r.width <= iw + 1e-9 &&
            r.y + r.height <= ih + 1e-9,
        );
        if (x === 0) assert.equal(r.x, 0);
        if (x === 100) assert.equal(r.x + r.width, iw);
        if (y === 100) assert.equal(r.y + r.height, ih);
      }
  }
  assert.deepEqual(normalizeFraming({ x: -20, y: 200 }), { x: 0, y: 100 });
  assert.deepEqual(normalizeFraming({ x: "bad", y: Infinity }), {
    x: 50,
    y: 50,
  });
});

test("framing stays with each photo through portable project round trips", () => {
  const photos = [
    {
      name: "Sala",
      src: "data:image/png;base64,YQ==",
      framing: { x: 20, y: 80 },
    },
    {
      name: "Cocina",
      src: "data:image/png;base64,Yg==",
      framing: { x: 100, y: 0 },
    },
  ];
  const clean = validateProject(
    JSON.parse(
      JSON.stringify({
        version: 1,
        settings: defaults,
        photos: photos.toReversed(),
      }),
    ),
  );
  assert.deepEqual(clean.photos, photos.toReversed());
});

test("landscape photos remain complete inside a portrait piece", () => {
  const r = containRect(2000, 1000, 1080, 1350);
  assert.deepEqual(r, { x: 0, y: 405, width: 1080, height: 540 });
});
test("all photo proportions fit without clipping or stretching in cover and gallery", () => {
  for (const [w, h] of [
    [4000, 2000],
    [800, 2400],
    [1200, 1200],
  ]) {
    for (const [tw, th] of [
      [948, 695],
      [1080, 1350],
    ]) {
      const r = containRect(w, h, tw, th);
      assert.ok(r.x >= 0 && r.y >= 0);
      assert.ok(r.x + r.width <= tw);
      assert.ok(r.y + r.height <= th);
      assert.ok(Math.abs(r.width / r.height - w / h) < 0.00001);
    }
  }
});
test("project imports reject remote images and oversized carousels", () => {
  assert.throws(() =>
    validateProject({
      version: 1,
      settings: defaults,
      photos: [{ src: "https://example.com/photo.jpg" }],
    }),
  );
  assert.throws(() =>
    validateProject({
      version: 1,
      settings: defaults,
      photos: new Array(11).fill({}),
    }),
  );
  assert.throws(() =>
    validateProject({ version: 2, settings: defaults, photos: [] }),
  );
});
test("project sanitization bounds all render inputs", () => {
  const s = normalizeSettings({
    bedrooms: -2,
    bathrooms: 500,
    area: "NaN",
    navy: "bad",
    logoSize: 999,
    location: "a".repeat(300),
  });
  assert.equal(s.bedrooms, "0");
  assert.equal(s.bathrooms, "99");
  assert.equal(s.area, "");
  assert.equal(s.navy, defaults.navy);
  assert.equal(s.logoSize, 200);
  assert.equal(s.location.length, 60);
});
test("portable projects retain photos and colors", () => {
  const project = {
    version: 1,
    settings: { ...defaults, reference: "12238", accent: "#123456" },
    description: { ...descriptionDefaults },
    logo: null,
    photos: [{ name: "Sala", src: "data:image/png;base64,YQ==" }],
  };
  assert.deepEqual(
    validateProject(JSON.parse(JSON.stringify(project))),
    project,
  );
});
test("old projects open with full photos and ignore their previous zoom", () => {
  const project = validateProject({
    version: 1,
    settings: defaults,
    photos: [
      { src: "data:image/png;base64,YQ==", crop: { zoom: 3, x: 0, y: 0 } },
    ],
  });
  assert.equal("crop" in project.photos[0], false);
});
test("download names cannot contain path separators", () => {
  assert.equal(safeFilename("../Málaga / #12238"), "-Malaga-12238");
  assert.equal(safeFilename(""), "inmueble");
});
