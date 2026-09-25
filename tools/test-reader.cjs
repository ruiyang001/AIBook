// Run with `node tools/test-reader.cjs`; no packages or browser required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bookDir = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(bookDir, file), 'utf8');
const context = vm.createContext({ window: { location: { hash: '' } } });
vm.runInContext(read('js/reader.js'), context);
const css = read('css/reader.css');
const totalPages = Number(read('index.html').match(/pages:\s*(\d+)/)[1]);
assert.equal(totalPages, 54, 'The original 54-page sequence must stay intact');

function artworkFor(page) {
  const htmlPath = path.join(bookDir, `pages/page${page}.html`);
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  const image = html.match(/<img\b[^>]*\bsrc="([^"]+)"/i);
  const rule = css.match(new RegExp(`\\.sj-book \\.p${page}\\s*\\{([^}]+)\\}`));
  const background = rule && rule[1].match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
  const source = image ? image[1] : background && background[1];
  if (!source) return null;
  const filename = path.basename(source.split('?')[0]);
  assert.ok(fs.existsSync(path.join(bookDir, 'pics', filename)), `Missing original ${filename}`);
  return path.parse(filename).name;
}

const expectedThumbnails = [];
for (let view = 1; view <= 28; view++) {
  const pages = view === 1 ? [1] : view === 28 ? [54] : [view * 2 - 2, view * 2 - 1];
  let illustration = pages.map(artworkFor).find(Boolean);
  if (!illustration) {
    assert.ok([2, 3, 26].includes(view), `Unexpected spread without artwork: ${pages}`);
    // Blank front matter / adult guidance uses the cover; blank end matter uses the final story art.
    illustration = view === 26 ? artworkFor(48) : artworkFor(1);
  }
  expectedThumbnails.push(illustration);
}
assert.deepEqual(Array.from(context.spreadThumbnails), expectedThumbnails);
assert.equal(expectedThumbnails[26], artworkFor(53), 'Inside back cover must use Page53');

function webpSize(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString('ascii', offset, offset + 4), start = offset + 8;
    if (kind === 'VP8 ') {
      assert.equal(buffer.subarray(start + 3, start + 6).toString('hex'), '9d012a');
      return [buffer.readUInt16LE(start + 6) & 0x3fff, buffer.readUInt16LE(start + 8) & 0x3fff];
    }
    if (kind === 'VP8X') return [buffer.readUIntLE(start + 4, 3) + 1, buffer.readUIntLE(start + 7, 3) + 1];
    if (kind === 'VP8L') {
      const bits = buffer.readUInt32LE(start + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    const length = buffer.readUInt32LE(offset + 4);
    offset = start + length + (length % 2);
  }
  assert.fail('WebP has no supported image header');
}

let totalBytes = 0;
for (const name of new Set(expectedThumbnails)) {
  const buffer = fs.readFileSync(path.join(bookDir, 'pics/thumbnails', `${name}.webp`));
  assert.ok(buffer.length < 20000, `${name} must remain a lightweight thumbnail`);
  assert.deepEqual(webpSize(buffer), [200, 300], `${name} must preserve the artwork aspect ratio`);
  totalBytes += buffer.length;
}

let currentPage = 1, sliderValue = 1, resetCount = 0, hiddenCount = 0;
const jumps = [], previews = [], handlers = {};
const book = { turn(method, page) {
  if (method === 'pages') return totalPages;
  assert.equal(method, 'page');
  if (page === undefined) return currentPage;
  jumps.push(page);
  currentPage = page;
  return this;
} };
assert.equal(context.numberOfViews(book), 28);
for (let page = 1; page <= totalPages; page++) {
  const expectedView = page === 1 ? 1 : Math.ceil((page + 1) / 2);
  assert.equal(context.getViewNumber(book, page), expectedView);
  const target = context.pageForView(expectedView);
  assert.ok(target === page || target + 1 === page, `Spread must contain page ${page}`);
}
assert.equal(context.pageForView(-2), 1);
assert.equal(context.pageForView(100), 54);
for (const [hash, page] of [['', 1], ['#page/1', 1], ['#page/11', 11], ['#page/53', 53],
  ['#page/54', 54], ['#page/0', 1], ['#page/999', 54], ['#page/nope', 1], ['#other', 1]]) {
  context.window.location.hash = hash;
  assert.equal(context.pageFromHash(), page, `Deep link ${hash}`);
}

context.document = { getElementById(id) {
  if (id === 'slider') return { getBoundingClientRect: () => ({ left: 100, width: 270 }) };
  assert.equal(id, 'slider-bar');
  return { addEventListener(type, handler, options) {
    if (type !== 'touchcancel') assert.equal(options.passive, false);
    handlers[type] = handler;
  } };
} };
context.$ = selector => {
  assert.equal(selector, '#slider');
  return { slider(method, value) {
    assert.equal(method, 'value');
    if (value !== undefined) sliderValue = value;
    return sliderValue;
  } };
};
context.setPreview = view => previews.push(view);
context.hidePreview = () => hiddenCount++;
context.updateNavigation = () => { resetCount++; sliderValue = context.getViewNumber(book); };
context.setupSliderTouch(book);

function touch(type, positions = []) {
  const event = { touches: positions.map(clientX => ({ clientX })), prevented: false,
    preventDefault() { this.prevented = true; } };
  handlers[type](event);
  return event;
}
for (let view = 1; view <= 28; view++) {
  assert.ok(touch('touchstart', [100 + (view - 1) * 10]).prevented);
  assert.equal(sliderValue, view);
  assert.equal(previews.at(-1), view);
  assert.ok(touch('touchend').prevented);
  assert.equal(jumps.at(-1), context.pageForView(view));
}
touch('touchstart', [-100]);
assert.equal(sliderValue, 1, 'Touch positions before the track clamp to the front cover');
assert.ok(touch('touchmove', [1000]).prevented);
assert.equal(sliderValue, 28, 'Touch positions beyond the track clamp to the back cover');
let jumpCount = jumps.length;
touch('touchcancel');
assert.equal(resetCount, 1);
assert.equal(sliderValue, context.getViewNumber(book));
touch('touchend');
assert.equal(jumps.length, jumpCount, 'Cancelled touches must not turn pages');

touch('touchstart', [200]);
touch('touchmove', [200, 210]);
assert.equal(resetCount, 2, 'A multi-touch move cancels and restores the current position');
touch('touchend');
assert.equal(jumps.length, jumpCount, 'Multi-touch cancellation must not turn pages');
assert.equal(touch('touchstart', [200, 210]).prevented, false);
touch('touchend');
assert.equal(jumps.length, jumpCount, 'A gesture beginning with two fingers is ignored');
const resetsBeforeSecondFinger = resetCount;
touch('touchstart', [200]);
touch('touchstart', [200, 210]);
assert.equal(resetCount, resetsBeforeSecondFinger + 1, 'A second finger cancels without requiring movement');
assert.equal(sliderValue, context.getViewNumber(book));
touch('touchend', [200]);
touch('touchend');
assert.equal(jumps.length, jumpCount, 'Lifting either finger after multi-touch cancellation must not turn pages');
assert.ok(hiddenCount >= 30, 'Finished/cancelled interactions hide the preview');
assert.equal(touch('touchmove', [220]).prevented, false, 'Inactive movement is ignored');

console.log(`Passed: 28 artwork-derived spread mappings, ${new Set(expectedThumbnails).size} thumbnails (${totalBytes} bytes),`);
console.log('54 page/view relationships, deep-link boundaries, and touch drag/commit/cancel/multi-touch behavior.');
