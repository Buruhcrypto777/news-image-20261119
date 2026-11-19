// WORLD NEWS — Thursday, 19 November 2026.
// A one-page newspaper drawn from scratch: own 5x7 bitmap font, own
// grayscale framebuffer, own PNG encoder. Node 22 standard library only,
// no network, fully deterministic (the day's news is baked into the code).
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const W = 1024;
const H = 1024;
const PAPER = 247; // warm newsprint grey
const INK = 26; // near-black ink
const SOFT = 110; // secondary grey for rules and shading

// ---------------------------------------------------------------- font --
// Own 5x7 bitmap font. Each glyph is 7 rows of 5 bits, stored as numbers.
// Only the glyphs the paper needs: A-Z, 0-9, space and common punctuation.
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 6, 4, 0, 4],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0],
  "-": [0, 0, 0, 14, 0, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "/": [1, 2, 2, 4, 8, 8, 16],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "%": [25, 26, 2, 4, 8, 11, 19],
  "$": [4, 15, 20, 14, 5, 30, 4],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
};

// ---------------------------------------------------------- framebuffer --
const fb = Buffer.alloc(W * H, PAPER);

function px(x: number, y: number, c: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  fb[y * W + x] = c;
}

function rect(x: number, y: number, w: number, h: number, c: number): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) px(i, j, c);
  }
}

function hline(x0: number, x1: number, y: number, c: number, t = 1): void {
  for (let t0 = 0; t0 < t; t0++) {
    for (let x = x0; x <= x1; x++) px(x, y + t0, c);
  }
}

function vline(x: number, y0: number, y1: number, c: number, t = 1): void {
  for (let t0 = 0; t0 < t; t0++) {
    for (let y = y0; y <= y1; y++) px(x + t0, y, c);
  }
}

// Bresenham line.
function line(x0: number, y0: number, x1: number, y1: number, c: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

// Filled triangle (scanline fill between the two edges).
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const a = Math.ceil(Math.min(...xs));
      const b = Math.floor(Math.max(...xs));
      for (let x = a; x <= b; x++) px(x, y, c);
    }
  }
}

function circle(cx: number, cy: number, r: number, c: number, fill: boolean): void {
  if (fill) {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) px(cx + x, cy + y, c);
    }
    return;
  }
  let x = r;
  let y = 0;
  let err = 0;
  while (x >= y) {
    px(cx + x, cy + y, c);
    px(cx + y, cy + x, c);
    px(cx - y, cy + x, c);
    px(cx - x, cy + y, c);
    px(cx - x, cy - y, c);
    px(cx - y, cy - x, c);
    px(cx + y, cy - x, c);
    px(cx + x, cy - y, c);
    y += 1;
    err += 1 + 2 * y;
    if (2 * (err - x) + 1 > 0) {
      x -= 1;
      err += 1 - 2 * x;
    }
  }
}

// ----------------------------------------------------------------- text --
function charWidth(scale: number): number {
  return 6 * scale;
}

function textWidth(s: string, scale: number): number {
  return s.length * charWidth(scale) - scale; // no trailing gap
}

function drawChar(ch: string, x: number, y: number, scale: number, c: number): void {
  // The font is uppercase only; fold everything to caps at draw time.
  const g = FONT[ch.toUpperCase()] ?? FONT["?"];
  for (let row = 0; row < 7; row++) {
    const bits = g[row];
    for (let col = 0; col < 5; col++) {
      if ((bits >> (4 - col)) & 1) {
        rect(x + col * scale, y + row * scale, scale, scale, c);
      }
    }
  }
}

function drawText(s: string, x: number, y: number, scale: number, c: number): void {
  for (let i = 0; i < s.length; i++) {
    drawChar(s[i], x + i * charWidth(scale), y, scale, c);
  }
}

function drawTextCentered(s: string, cx: number, y: number, scale: number, c: number): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Greedy word wrap to a pixel width; returns the lines.
function wrap(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test, scale) <= maxW || cur === "") {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text in a box; returns the y just below the last line.
function drawPara(s: string, x: number, y: number, scale: number, maxW: number, lh: number, c: number): number {
  const lines = wrap(s, scale, maxW);
  for (let i = 0; i < lines.length; i++) {
    drawText(lines[i], x, y + i * lh, scale, c);
  }
  return y + lines.length * lh;
}

// ------------------------------------------------------------ PNG out --
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // no interlace
  const raw = Buffer.alloc(H * (W + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W + 1)] = 0; // filter: none
    fb.copy(raw, y * (W + 1) + 1, y * W, (y + 1) * W);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------- pictograms --
// Small drawn pictures, one per story, built from rectangles, lines and
// triangles only. Each takes the box (x, y, w, h) it may draw inside.

// 1. Courthouse: pediment, four columns, steps.
function picCourthouse(x: number, y: number, w: number, h: number): void {
  const cx = x + Math.floor(w / 2);
  tri(cx - 62, y + 42, cx + 62, y + 42, cx, y + 6, INK);
  circle(cx, y + 26, 7, PAPER, true);
  circle(cx, y + 26, 7, INK, false);
  rect(x + 8, y + 42, w - 16, 5, INK);
  for (let i = 0; i < 4; i++) {
    const colX = x + 22 + i * 42;
    rect(colX, y + 50, 12, 52, INK);
    rect(colX - 3, y + 47, 18, 4, INK);
    rect(colX - 3, y + 102, 18, 4, INK);
  }
  rect(x + 8, y + 110, w - 16, 5, INK);
  rect(x + 20, y + 118, w - 40, 4, SOFT);
  rect(x + 32, y + 124, w - 64, 4, SOFT);
}

// 2. Bridge over water, deck broken in the middle.
function picBridge(x: number, y: number, w: number, h: number): void {
  const deckY = y + 16;
  rect(x, deckY, 150, 5, INK);
  rect(x + w - 150, deckY, 150, 5, INK);
  // the fallen middle span, tilted into the water
  line(x + 152, deckY + 4, x + w - 152, deckY + 26, INK);
  line(x + 152, deckY + 8, x + w - 152, deckY + 30, INK);
  // towers
  rect(x + 96, y + 2, 8, 34, INK);
  rect(x + w - 104, y + 2, 8, 34, INK);
  line(x + 100, y + 2, x + 148, deckY, INK);
  line(x + w - 100, y + 2, x + w - 148, deckY, INK);
  // water
  for (let i = 0; i < 3; i++) {
    const wy = deckY + 30 + i * 8;
    for (let wx = x + 6; wx < x + w - 6; wx += 26) {
      hline(wx, wx + 14, wy, SOFT, 2);
    }
  }
}

// 3. Rising bars and an arrow: a record market debut.
function picChart(x: number, y: number, w: number, h: number): void {
  const baseY = y + h - 8;
  hline(x, x + w - 4, baseY, INK, 3);
  vline(x, y + 4, baseY, INK, 3);
  const bars = [14, 24, 20, 34, 44];
  for (let i = 0; i < bars.length; i++) {
    const bx = x + 44 + i * 78;
    rect(bx, baseY - bars[i], 40, bars[i], INK);
  }
  line(x + 44, baseY - 12, x + w - 30, y + 6, INK);
  line(x + w - 30, y + 6, x + w - 52, y + 8, INK);
  line(x + w - 30, y + 6, x + w - 32, y + 26, INK);
}

// 4. Three flags on poles.
function picFlags(x: number, y: number, w: number, h: number): void {
  const baseY = y + h - 6;
  const flag = (fx: number, fy: number, kind: number): void => {
    vline(fx, fy, baseY, INK, 3);
    rect(fx + 3, fy, 108, 24, INK);
    if (kind === 0) {
      // stripes
      for (let s = 0; s < 3; s++) rect(fx + 3, fy + 4 + s * 8, 108, 4, PAPER);
      rect(fx + 3, fy, 34, 14, INK);
    } else if (kind === 1) {
      // stars field: five dots
      const dots: Array<[number, number]> = [[14, 6], [30, 6], [46, 6], [22, 15], [38, 15]];
      for (const [dx, dy] of dots) rect(fx + 3 + dx, fy + dy, 4, 4, PAPER);
    } else {
      // disc
      circle(fx + 57, fy + 12, 8, PAPER, true);
    }
  };
  flag(x + 20, y + 6, 0);
  flag(x + 170, y + 2, 1);
  flag(x + 320, y + 6, 2);
}

// 5. City skyline at dusk with a palm.
function picCity(x: number, y: number, w: number, h: number): void {
  const groundY = y + h - 6;
  circle(x + w - 70, y + 14, 10, INK, true);
  const heights = [26, 40, 30, 46, 34, 22, 38];
  let bx = x + 8;
  for (let i = 0; i < heights.length; i++) {
    const bw = 46;
    rect(bx, groundY - heights[i], bw, heights[i], INK);
    for (let wy = groundY - heights[i] + 6; wy < groundY - 6; wy += 10) {
      for (let wx = bx + 6; wx < bx + bw - 6; wx += 12) {
        rect(wx, wy, 4, 4, PAPER);
      }
    }
    bx += bw + 8;
  }
  // palm, in the clear space right of the last building
  const px0 = x + w - 44;
  line(px0, groundY, px0 + 8, groundY - 30, INK);
  line(px0 + 8, groundY - 30, px0 - 8, groundY - 38, INK);
  line(px0 + 8, groundY - 30, px0 + 24, groundY - 38, INK);
  line(px0 + 8, groundY - 30, px0 + 2, groundY - 44, INK);
  line(px0 + 8, groundY - 30, px0 + 16, groundY - 44, INK);
  hline(x, x + w - 4, groundY, INK, 3);
}

// -------------------------------------------------------------- content --
// The day's news, as reported on Thursday 19 November 2026. All caps,
// plain ASCII only (the font has no lowercase).

const LEAD_KICKER = "THE HAGUE - INTERNATIONAL JUSTICE";
const LEAD_HEAD = "WORLD COURT TO RULE ON ROHINGYA GENOCIDE TODAY";
const LEAD_BODY =
  "The International Court of Justice delivers its verdict today in The Gambia's case against " +
  "Myanmar over the 2017 crackdown on the Rohingya. The court has never before found a state " +
  "guilty of genocide, and the judgment is final. More than one million Rohingya remain in Bangladesh.";

interface Story {
  kicker: string;
  head: string;
  body: string;
  pic: (x: number, y: number, w: number, h: number) => void;
}

const STORIES: Story[] = [
  {
    kicker: "UKRAINE - WAR",
    head: "KERCH BRIDGE HIT FOR A THIRD TIME IN A WEEK",
    body:
      "Traffic halted again after a fresh overnight strike on the Crimean Bridge. " +
      "Crimea's head confirmed the attack; damage is being assessed.",
    pic: picBridge,
  },
  {
    kicker: "TECHNOLOGY - MARKETS",
    head: "ANTHROPIC PRICES RECORD $81BN IPO",
    body:
      "The Claude AI maker priced its listing at $83 a share, raising $81.3 billion, " +
      "the largest debut on record. Trading starts today as ANT.",
    pic: picChart,
  },
  {
    kicker: "CHINA - DIPLOMACY",
    head: "TRUMP, XI AND PUTIN MEET IN SHENZHEN",
    body:
      "The U.S., Chinese and Russian leaders meet today in Shenzhen for their first " +
      "trilateral talks. Nuclear arms, Ukraine and Iran are on the agenda.",
    pic: picFlags,
  },
  {
    kicker: "CULTURE - GAMES",
    head: "VICE CITY OPENS AS GTA VI ROLLS OUT",
    body:
      "After 13 years, Grand Theft Auto VI began its global rollout at midnight, starting in " +
      "New Zealand. Early reviews give it 99 on Metacritic.",
    pic: picCity,
  },
];

const BRIEFS: string[] = [
  "WASHINGTON - HOUSE DEMOCRATS NOMINATED HAKEEM JEFFRIES, 251-11, FOR SPEAKER. IF ELECTED ON JAN. 3, HE WOULD BE THE FIRST BLACK SPEAKER IN U.S. HISTORY.",
  "SPACE - NASA EXPECTS TO CONFIRM TODAY THAT VOYAGER 1, LAUNCHED IN 1977, HAS REACHED ONE LIGHT-DAY FROM EARTH, A FIRST FOR ANY HUMAN-MADE OBJECT.",
  "FAITH - ISLAM IS ON TRACK TO BECOME THE WORLD'S LARGEST RELIGION BY 2035, A PEW RESEARCH PROJECTION SAYS, PASSING CHRISTIANITY ON HIGHER BIRTH RATES.",
  "BRUSSELS - THE EU PROPOSED A 45 BILLION EURO LOAN TO UKRAINE, TO BE REPAID AFTER RUSSIA PAYS REPARATIONS, THE FINANCIAL TIMES REPORTED.",
];

// --------------------------------------------------------------- layout --
const M = 36; // side margin
const CW = W - 2 * M; // 952 content width

function rule(y: number): void {
  hline(M, W - M - 1, y, INK, 2);
}

function drawStory(st: Story, x: number, y0: number, w: number): void {
  // kicker
  drawText(st.kicker, x, y0, 2, INK);
  // headline, scale 3, two lines
  const headLines = wrap(st.head, 3, w);
  for (let i = 0; i < headLines.length; i++) {
    drawText(headLines[i], x, y0 + 20 + i * 26, 3, INK);
  }
  // picture
  const picY = y0 + 78;
  st.pic(x, picY, w, 56);
  // body, scale 2
  drawPara(st.body, x, picY + 64, 2, w, 17, INK);
}

function build(): void {
  // ---- masthead
  rule(24);
  drawTextCentered("WORLD NEWS", W / 2, 36, 9, INK);
  rule(108);
  drawTextCentered("THURSDAY, 19 NOVEMBER 2026", W / 2, 122, 3, INK);
  rule(150);

  // ---- lead story: courthouse picture on the right
  drawText(LEAD_KICKER, M, 166, 2, INK);
  const leadTextW = 744;
  const leadHead = wrap(LEAD_HEAD, 4, leadTextW);
  for (let i = 0; i < leadHead.length; i++) {
    drawText(leadHead[i], M, 192 + i * 32, 4, INK);
  }
  picCourthouse(800, 166, 188, 134);
  drawPara(LEAD_BODY, M, 264, 2, leadTextW, 17, INK);
  rule(362);

  // ---- two-by-two grid
  const colW = 464;
  const col2X = M + colW + 24;
  vline(M + colW + 12, 378, 818, SOFT, 1);
  drawStory(STORIES[0], M, 378, colW);
  drawStory(STORIES[1], col2X, 378, colW);
  drawStory(STORIES[2], M, 602, colW);
  drawStory(STORIES[3], col2X, 602, colW);

  // ---- in brief
  rule(830);
  drawText("IN BRIEF", M, 842, 3, INK);
  let by = 872;
  for (const b of BRIEFS) {
    by = drawPara(b, M, by, 2, CW, 16, INK) + 4;
  }
}

// ------------------------------------------------------------------ main --
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  build();
  const png = encodePNG();
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath} (${png.length} bytes, sha256 ${sha})`);
}

main();
