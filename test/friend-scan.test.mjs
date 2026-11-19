import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { scanCanvases, pageCanvas, pictureCanvas, fitScale, MAX_PIXELS } from '../web/friend-scan.js';

// A stand-in for a canvas: the pixels are a plain RGBA array, `width = 0` frees it the way a real canvas lets go of its memory.
function fakeCanvas(w = 400, h = 200) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const rect = (x, y, rw, rh, [r, g, b]) => {
    for (let j = y; j < y + rh; j++)
      for (let i = x; i < x + rw; i++) data.set([r, g, b, 255], (j * w + i) * 4);
  };
  return { width: w, height: h, data, rect, getContext: () => ({ getImageData: () => ({ data }) }) };
}
const live = (all) => all.filter((c) => c.width > 0).length;

const courses = {
  30127: {
    name: 'חוזק חומרים 1',
    groups: [
      { id: 'B1', type: 'סופי-הרצאה+תרגול', meetings: [{ day: 1, start: '08:00', end: '09:50' }, { day: 4, start: '08:00', end: '08:50' }] },
      { id: 'B4', type: 'סופי-הרצאה+תרגול', meetings: [{ day: 1, start: '10:00', end: '11:50' }, { day: 3, start: '08:00', end: '08:50' }] }
    ]
  }
};
const TABLE_PAGE = '1 30127 חוזק חומרים 1 סופי-הרצאה+תרגול ד"ר אלמוני 3.50 3.00 ראשון, 10:00-11:50 שלישי, 08:00-08:50';

test('scanCanvases draws one page at a time and frees it before the next is drawn', async () => {
  const made = [],
    log = [];
  const draw = (i) => async () => {
    assert.equal(live(made), 0, `page ${i}: the pages before it are freed`);
    log.push(`draw ${i}`);
    const c = fakeCanvas();
    made.push(c);
    return c;
  };
  const tesseract = {
    createWorker: async () => ({
      recognize: async (c) => {
        assert.equal(live(made), 1, 'only the page being read is alive');
        assert.equal(c, made.at(-1));
        log.push(`read ${made.length - 1}`);
        return { data: { text: '', blocks: [] } };
      },
      terminate: async () => log.push('end')
    })
  };
  const seen = [];
  await scanCanvases([draw(0), draw(1), draw(2)], courses, (i, n) => seen.push([i, n]), tesseract);
  assert.deepEqual(log, ['draw 0', 'read 0', 'draw 1', 'read 1', 'draw 2', 'read 2', 'end']);
  assert.equal(live(made), 0, 'the last page is freed too');
  assert.deepEqual(seen.at(0), [0, 3]);
  assert.deepEqual(seen.at(-1), [2, 3]);
});

test('scanCanvases frees the page and ends the worker when reading it fails', async () => {
  const c = fakeCanvas();
  let ended = 0;
  const tesseract = {
    createWorker: async () => ({
      recognize: async () => {
        throw new Error('ocr failed');
      },
      terminate: async () => ended++
    })
  };
  await assert.rejects(scanCanvases([async () => c], courses, () => {}, tesseract), /ocr failed/);
  assert.equal(c.width, 0);
  assert.equal(ended, 1);
});

test('scanCanvases frees the canvases it was given when the worker cannot start', async () => {
  const mine = [fakeCanvas(), fakeCanvas()];
  const tesseract = {
    createWorker: async () => {
      throw new Error('no worker');
    }
  };
  await assert.rejects(scanCanvases(mine, courses, () => {}, tesseract), /no worker/);
  assert.deepEqual(mine.map((c) => c.width), [0, 0]);
});

test('scanCanvases frees the canvases a failure kept it from reading', async () => {
  const mine = [fakeCanvas(), fakeCanvas()];
  const tesseract = {
    createWorker: async () => ({
      recognize: async () => {
        throw new Error('ocr failed');
      },
      terminate: async () => {}
    })
  };
  await assert.rejects(scanCanvases(mine, courses, () => {}, tesseract), /ocr failed/);
  assert.deepEqual(mine.map((c) => c.width), [0, 0], 'the second one was never read, and is freed all the same');
});

test('scanCanvases stops drawing pages when one fails', async () => {
  let drawn = 0;
  const tesseract = {
    createWorker: async () => ({ recognize: async () => ({ data: { text: '', blocks: [] } }), terminate: async () => {} })
  };
  const bad = async () => {
    throw new Error('page failed');
  };
  const next = async () => {
    drawn++;
    return fakeCanvas();
  };
  await assert.rejects(scanCanvases([bad, next], courses, () => {}, tesseract), /page failed/);
  assert.equal(drawn, 0);
});

test('scanCanvases still takes finished canvases (a photo) and frees them after the read', async () => {
  const c = fakeCanvas();
  const tesseract = {
    createWorker: async () => ({ recognize: async () => ({ data: { text: '', blocks: [] } }), terminate: async () => {} })
  };
  await scanCanvases([c], courses, () => {}, tesseract);
  assert.equal(c.width, 0);
});

// a weekly grid: 4 day headers and one block in the rightmost column (ראשון), 08:00-09:50 when the first row is 8:00
const gridCanvas = () => {
  const c = fakeCanvas(400, 200);
  for (const x of [20, 120, 220, 320]) c.rect(x, 30, 80, 24, [205, 140, 190]);
  c.rect(320, 55, 80, 44, [0, 90, 230]);
  return c;
};

test('the merge still prefers a table over a grid, whatever the order of the pages', async () => {
  const run = async (order) => {
    const pages = { grid: gridCanvas(), table: fakeCanvas() };
    const tesseract = {
      createWorker: async () => ({
        // the table page reads as text; the grid page has none, and each of its blocks is read from a crop
        recognize: async (c, opts) => ({
          data: { text: opts.rectangle ? 'חוזק חומרים 1' : c === pages.table ? TABLE_PAGE : '', blocks: [] }
        }),
        terminate: async () => {}
      })
    };
    return (await scanCanvases(order.map((k) => async () => pages[k]), courses, () => {}, tesseract)).result.found;
  };
  assert.deepEqual(await run(['grid']), ['B1'], 'the grid alone gives the group of its hours');
  assert.deepEqual(await run(['grid', 'table']), ['B4'], 'the table page, read second, wins over the grid page read first');
  assert.deepEqual(await run(['table', 'grid']), ['B4']);
});

// pageCanvas / fitScale: the size of one page's canvas
const stubDocument = globalThis.document;
const drawn = [];
globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: (...a) => drawn.push(a) }) }) };
after(() => {
  globalThis.document = stubDocument;
});
// a page of w x h points: asks for a viewport at a scale and renders onto the canvas it is given
const docOf = (w, h) => ({
  getPage: async () => ({
    getViewport: ({ scale }) => ({ width: w * scale, height: h * scale }),
    render: () => ({ promise: Promise.resolve() })
  })
});

test('a page is drawn 2,880 wide, as before, when that is under the pixel cap (a 16:9 slide, an A4 page)', async () => {
  const slide = await pageCanvas(docOf(960, 540), 1, 2880);
  assert.deepEqual([slide.width, slide.height], [2880, 1620]);
  const a4 = await pageCanvas(docOf(595, 842), 1, 2880);
  assert.deepEqual([a4.width, a4.height], [2880, 4076]);
  assert.ok(a4.width * a4.height <= MAX_PIXELS);
});

test('a page that would be over the pixel cap at 2,880 wide is drawn smaller, in its own shape', async () => {
  const tall = await pageCanvas(docOf(595, 3000), 1, 2880);
  assert.ok(tall.width * tall.height <= MAX_PIXELS, `${tall.width}x${tall.height}`);
  assert.ok(tall.width * tall.height > MAX_PIXELS * 0.99, 'and not much smaller than it has to be');
  assert.ok(Math.abs(tall.height / tall.width - 3000 / 595) < 0.01);
});

test('the cap holds on the whole pixels, also for an extreme shape', async () => {
  for (const [w, h] of [[1, 1010], [595, 3000], [3, 2000], [1000, 1]]) {
    const c = await pageCanvas(docOf(w, h), 1, 2880);
    assert.ok(c.width * c.height <= MAX_PIXELS, `${w}x${h} became ${c.width}x${c.height}`);
  }
  const p = pictureCanvas('thin', 1, 1010);
  assert.ok(p.width * p.height <= MAX_PIXELS, `${p.width}x${p.height}`);
});

test('fitScale: the wanted scale up to the cap, then the scale that makes the cap', () => {
  assert.equal(fitScale(1045, 800, 2.7), 2.7);
  assert.equal(fitScale(1000, 1000, 3), 3);
  const s = fitScale(8000, 6000, 1); // a 48-megapixel photo is drawn smaller than it is
  assert.ok(s < 1 && 8000 * s * 6000 * s <= MAX_PIXELS * 1.0001);
  assert.ok(fitScale(2480, 3508, 3) * 2480 * fitScale(2480, 3508, 3) * 3508 <= MAX_PIXELS * 1.0001, 'an A4 scan at 300 dpi');
});

test('pictureCanvas gives the pixels back when drawing the picture fails', () => {
  let made;
  const real = globalThis.document;
  globalThis.document = {
    createElement: () => (made = { getContext: () => ({ drawImage: () => { throw new Error('too big'); } }) })
  };
  try {
    assert.throws(() => pictureCanvas('x', 1000, 1000), /too big/);
    assert.equal(made.width, 0);
  } finally {
    globalThis.document = real;
  }
});

test('pictureCanvas: a screenshot is upscaled as before; a big scan or photo is drawn smaller, whole, in its own shape', () => {
  const shot = pictureCanvas('shot', 1045, 800);
  assert.deepEqual([shot.width, shot.height], [2880, 2205], 'a 1045-wide screenshot is drawn 2,880 wide');
  const scan = pictureCanvas('scan', 4000, 5600), // 22 million pixels at its own size
    photo = pictureCanvas('photo', 8000, 6000); // 48 million
  for (const c of [scan, photo]) assert.ok(c.width * c.height <= MAX_PIXELS, `${c.width}x${c.height}`);
  assert.ok(Math.abs(scan.width / scan.height - 4000 / 5600) < 0.001);
  assert.deepEqual(drawn.at(-2), ['scan', 0, 0, scan.width, scan.height], 'the whole picture goes on the canvas');
  assert.deepEqual(drawn.at(-1), ['photo', 0, 0, photo.width, photo.height]);
});
