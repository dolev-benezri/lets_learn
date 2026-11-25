// The share image's file (web/share-image.js) in WebKit: a PNG of the model's size, in the course's light colours, light on a dark page too.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, visit, launch } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const LIGHT_BG = ['#E6EEFB', '#F9E6EF', '#E2F1EC', '#F9EFE1', '#EFE9FA', '#E2F1F5', '#FAE7E6', '#EBF2E2'];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 3);

// in the page: make the file from a sample week, then read it back as an image and sample pixels
const make = (page) =>
  page.evaluate(async () => {
    const { shareImageFile, shareModel, FONTS } = await import('./share-image.js');
    const L = (course, name, type, group, day, start, end, color, changed = false) => ({ course, name, type, group, day, start, end, color, changed });
    const input = {
      name: 'נועה', semester: 'א', label: 'הצעה 2 מתוך 5', link: true, range: { from: 8, to: 19, days: 6 },
      lessons: [
        L('a', 'מכניקת מוצקים', 'הרצאה', '273011204', 1, '08:30', '11:00', 0),
        L('b', 'משוואות דיפרנציאליות', 'תרגול', '273011205/1', 2, '10:00', '13:00', 1, true),
        L('c', 'תרמודינמיקה', 'הרצאה', '273011206', 3, '08:30', '11:00', 2),
        L('d', 'שרטוט הנדסי ממוחשב', 'מעבדה', '273011207', 4, '14:00', '17:00', 3),
        L('e', 'חשמל למהנדסי מכונות', 'הרצאה', '273011208', 5, '14:00', '16:30', 4),
        L('f', 'אנגלית מתקדמים ב׳', 'שיעור', null, 6, '08:30', '10:00', 5)
      ],
      ghosts: [{ course: 'b', name: 'משוואות דיפרנציאליות', day: 4, start: '10:00', end: '11:30', color: 1 }]
    };
    await Promise.all(Object.values(FONTS).map((f) => document.fonts.load(f, 'אב 09:00')));
    const file = shareImageFile(input);
    const c = document.createElement('canvas').getContext('2d');
    const { BOLD } = await import('./share-image.js');
    const model = shareModel(input, (s, r) => ((c.font = FONTS[r]), c.measureText(s).width + (BOLD[r] ?? 0)));
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    const cv = document.createElement('canvas');
    [cv.width, cv.height] = [img.naturalWidth, img.naturalHeight];
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
    const first = model.items.find((i) => i.kind === 'lesson' && !i.changed);
    return {
      name: file.name, type: file.type, size: file.size, w: img.naturalWidth, h: img.naturalHeight, modelH: model.height,
      color: first.color, lesson: px(first.x + 6, first.y + first.h - 6), page: px(10, 10)
    };
  });

for (const scheme of ['light', 'dark'])
  test(`${scheme} page: a PNG named afeka-schedule.png, 1080 wide, the model's height, in the light course colours`, async (t) => {
    const page = await visit(browser, t, 'phone', DONE, '#edit', scheme);
    const r = await make(page);
    assert.equal(r.name, 'afeka-schedule.png');
    assert.equal(r.type, 'image/png');
    assert.ok(r.size > 20000, `size ${r.size}`);
    assert.equal(r.w, 1080);
    assert.equal(r.h, Math.ceil(r.modelH));
    assert.ok(near(r.lesson, hex(LIGHT_BG[r.color])), `lesson ${r.lesson} vs ${LIGHT_BG[r.color]}`);
    assert.ok(near(r.page, hex('#E9EDF1')), `page ${r.page}`);
  });
