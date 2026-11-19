// WORLD NEWS - Thursday, 19 November 2026
// A one-day newspaper front page, drawn entirely with code.
// Node 22 standard library only. No network, no randomness, no clock.
// Fully deterministic: the same input always produces the same PNG bytes.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------------------------------------------------------------------
// STORY TEXT
// ---------------------------------------------------------------------------

// LEAD - ICJ VERDICT, 19 NOV 2026 (confirmed outcome)
// Myanmar found responsible for genocide against the Rohingya.
// Sources: Wikipedia "Rohingya genocide case", agentictribune,
// Al Jazeera, Reuters live.
const LEAD_KICKER = "THE HAGUE - INTERNATIONAL JUSTICE";
const LEAD_HEADLINE = "WORLD COURT: MYANMAR COMMITTED GENOCIDE";
const LEAD_DECK =
  "THE INTERNATIONAL COURT OF JUSTICE HAS FOUND MYANMAR RESPONSIBLE FOR " +
  "GENOCIDE AGAINST THE ROHINGYA. THE ONLY REASONABLE INFERENCE, IT SAID, " +
  "WAS AN INTENT TO DESTROY THE GROUP IN NORTHERN RAKHINE. FINAL AND BINDING.";
const LEAD_FACTS =
  "ABOUT 10,000 KILLED IN 2017. MORE THAN 730,000 FLED. READ BY PRESIDENT " +
  "YUJI IWASAWA.";

const STORY2_KICKER = "SHENZHEN - DIPLOMACY";
const STORY2_HEADLINE = "TRUMP, XI AND PUTIN HOLD FIRST THREE-WAY SUMMIT";
const STORY2_DECK =
  "LEADERS MEET IN SHENZHEN ON THE APEC SIDELINES AS THE NUCLEAR PACT " +
  "LIES EXPIRED. NO DEAL IS EXPECTED.";
// Sources: Yonhap, AnewZ, AJP

const STORY3_KICKER = "TECHNOLOGY - MARKETS";
const STORY3_HEADLINE = "ANTHROPIC PRICES RECORD $81BN IPO AT $83";
const STORY3_DECK =
  "THE CLAUDE MAKER'S SHARES BEGIN TRADING TODAY ON NASDAQ AS ANT.";
// Sources: Anthropic pricing announcement, Nasdaq notice

const STORY4_KICKER = "CULTURE - GAMES";
const STORY4_HEADLINE = "VICE CITY OPENS AS GTA VI ROLLS OUT";
const STORY4_DECK =
  "AFTER 13 YEARS, A RECORD 99 ON METACRITIC. 17M COPIES PRE-SOLD.";
// Sources: Reuters, AAP, AsiaToday

const STORY5_KICKER = "BANGLADESH - UNREST";
const STORY5_HEADLINE = "BANGLADESH BURNS AS YUNUS HOME TORCHED";
const STORY5_DECK =
  "LOCKDOWN SHUTS PARTS OF THE COUNTRY. 28 DISTRICTS HIT BY BOMBS AND ARSON.";
// Sources: Reuters, The Hindu BusinessLine

const BRIEFS: string[] = [
  "CRIMEA BRIDGE HIT FOR A THIRD TIME IN A WEEK. TRAFFIC HALTED.",
  "VAN GOGH SELLS FOR A RECORD $190.4M AT SOTHEBY'S NEW YORK.",
  "COP31 MINISTERS WRESTLE OVER A DRAFT DEAL IN ANTALYA. TALKS CLOSE FRIDAY.",
  "IAEA: NORTH KOREA EXPANDED URANIUM ENRICHMENT AT YONGBYON.",
  "US AND VENEZUELA SIGN A MILITARY COOPERATION AGREEMENT.",
];

// ---------------------------------------------------------------------------
// CANVAS
// ---------------------------------------------------------------------------
const W = 1024;
const H = 1024;
const PAPER: number[] = [246, 243, 236];
const INK: number[] = [17, 17, 17];
const RED: number[] = [178, 34, 52];
const BLUE: number[] = [40, 70, 140];
const GOLD: number[] = [212, 160, 30];
const ORANGE: number[] = [205, 70, 20];
const YELLOW: number[] = [238, 178, 40];
const GREY: number[] = [110, 108, 100];

const px = new Uint8Array(W * H * 3);

function setPx(x: number, y: number, c: number[]): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: number[]): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
}

function drawLine(x0: number, y0: number, x1: number, y1: number, c: number[], t: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(t / 2);
  for (;;) {
    fillRect(x - half, y - half, t, t, c);
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

// Fill a triangle by scanning horizontal spans between its edges.
function fillTriangle(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  c: number[],
): void {
  const minY = Math.max(0, Math.min(ay, by, cy));
  const maxY = Math.min(H - 1, Math.max(ay, by, cy));
  const edge = (x0: number, y0: number, x1: number, y1: number, y: number): number => {
    if (y0 === y1) return x0;
    return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  };
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    if (y >= Math.min(ay, by) && y <= Math.max(ay, by)) xs.push(edge(ax, ay, bx, by, y));
    if (y >= Math.min(by, cy) && y <= Math.max(by, cy)) xs.push(edge(bx, by, cx, cy, y));
    if (y >= Math.min(cy, ay) && y <= Math.max(cy, ay)) xs.push(edge(cx, cy, ax, ay, y));
    if (xs.length < 2) continue;
    const lo = Math.floor(Math.min(xs[0], xs[1], xs[2] ?? xs[0]));
    const hi = Math.ceil(Math.max(xs[0], xs[1], xs[2] ?? xs[0]));
    fillRect(lo, y, hi - lo + 1, 1, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: number[]): void {
  for (let y = -r; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y));
    fillRect(cx - hw, cy + y, hw * 2 + 1, 1, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, t: number, c: number[]): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(cx + r * Math.cos(rad));
    const y = Math.round(cy + r * Math.sin(rad));
    fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
  }
}

// Five-pointed star as a fan of triangles from its centre.
function drawStar(cx: number, cy: number, r: number, c: number[]): void {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (i % 2 === 0 ? r : r * 0.42);
    const ang = (-90 + i * 36) * (Math.PI / 180);
    pts.push([Math.round(cx + rad * Math.cos(ang)), Math.round(cy + rad * Math.sin(ang))]);
  }
  for (let i = 0; i < 10; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 10];
    fillTriangle(cx, cy, p1[0], p1[1], p2[0], p2[1], c);
  }
}

// Downward bowl of a scale pan.
function fillPan(cx: number, cy: number, r: number, c: number[]): void {
  for (let y = 0; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(Math.max(0, r * r - (r - y) * (r - y))));
    fillRect(cx - hw, cy + y, hw * 2 + 1, 1, c);
  }
}

// ---------------------------------------------------------------------------
// 5x7 BITMAP FONT (own design). Each glyph: 7 rows of 5 cells, "#" = ink.
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "##..#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
  "+": [".....", "..#..", "..#..", ".###.", "..#..", "..#..", "....."],
  "=": [".....", ".....", ".###.", ".....", ".###.", ".....", "....."],
};

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}

function drawText(s: string, x: number, y: number, scale: number, c: number[]): void {
  let cx = x;
  for (const ch of s) {
    const g = GLYPHS[ch] ?? GLYPHS["?"];
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      for (let col = 0; col < 5; col++) {
        if (row[col] === "#") {
          fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(s: string, cx: number, y: number, scale: number, c: number[]): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Greedy word wrap. Returns lines that all fit within maxW.
function wrapText(text: string, maxW: number, scale: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawWrapped(
  text: string,
  x: number,
  y: number,
  maxW: number,
  scale: number,
  lineH: number,
  c: number[],
): number {
  const lines = wrapText(text, maxW, scale);
  for (let i = 0; i < lines.length; i++) {
    drawText(lines[i], x, y + i * lineH, scale, c);
  }
  return y + lines.length * lineH;
}

// ---------------------------------------------------------------------------
// ILLUSTRATIONS
// ---------------------------------------------------------------------------

// Lead: Peace Palace (pediment + columns + steps) with scales of justice.
function drawLeadArt(x0: number, y0: number, x1: number, y1: number): void {
  const cx = Math.floor((x0 + x1) / 2);
  // Pediment triangle.
  fillTriangle(x0 + 6, y0 + 78, x1 - 6, y0 + 78, cx, y0 + 6, INK);
  fillCircle(cx, y0 + 56, 9, PAPER);
  circleOutline(cx, y0 + 56, 9, 3, PAPER,);
  // Entablature band.
  fillRect(x0 + 2, y0 + 78, x1 - x0 - 4, 12, INK);
  // Five columns.
  const colW = 20;
  const span = x1 - x0 - 16;
  for (let i = 0; i < 5; i++) {
    const colX = x0 + 8 + Math.round((i * (span - colW)) / 4);
    fillRect(colX, y0 + 90, colW, 76, INK);
  }
  // Base + steps.
  fillRect(x0 + 2, y0 + 166, x1 - x0 - 4, 8, INK);
  fillRect(x0 + 12, y0 + 174, x1 - x0 - 24, 6, GREY);
  fillRect(x0 + 22, y0 + 180, x1 - x0 - 44, 6, GREY);
  // Scales of justice.
  const poleTop = y0 + 196;
  const poleBot = y1 - 8;
  fillRect(cx - 3, poleTop, 6, poleBot - poleTop, INK);
  fillRect(cx - 52, poleTop, 104, 5, INK);
  fillCircle(cx, poleTop - 2, 6, INK);
  for (const side of [-1, 1]) {
    const panCx = cx + side * 46;
    const beamY = poleTop + 5;
    drawLine(panCx, beamY, panCx - 16, beamY + 30, INK, 2);
    drawLine(panCx, beamY, panCx + 16, beamY + 30, INK, 2);
    fillPan(panCx, beamY + 30, 17, INK);
  }
}

// Story 2: three large national flags over a summit table line.
function drawFlags(x: number, y: number, w: number, h: number): void {
  const fw = Math.floor((w - 22) / 3);
  const fh = h;
  // --- United States: stars and stripes.
  const ux = x;
  const stripeH = Math.max(3, Math.floor(fh / 13));
  for (let i = 0; i < 13; i++) {
    fillRect(ux, y + i * stripeH, fw, stripeH, i % 2 === 0 ? RED : PAPER);
  }
  fillRect(ux, y, Math.floor(fw * 0.42), stripeH * 7, BLUE);
  for (let r = 0; r < 4; r++) {
    for (let cIdx = 0; cIdx < 5; cIdx++) {
      fillRect(
        ux + 5 + cIdx * 12,
        y + 4 + r * 8,
        3, 3, PAPER,
      );
    }
  }
  // --- China: red field, one big yellow star + four small ones.
  const cx = x + fw + 11;
  fillRect(cx, y, fw, fh, RED);
  drawStar(cx + 26, y + 18, 12, YELLOW);
  drawStar(cx + 58, y + 10, 5, YELLOW);
  drawStar(cx + 72, y + 22, 5, YELLOW);
  drawStar(cx + 72, y + 38, 5, YELLOW);
  drawStar(cx + 58, y + 48, 5, YELLOW);
  // --- Russia: white, blue, red horizontal bands.
  const rx = x + 2 * (fw + 11);
  const bandH = Math.floor(fh / 3);
  fillRect(rx, y, fw, bandH, PAPER);
  fillRect(rx, y + bandH, fw, bandH, BLUE);
  fillRect(rx, y + 2 * bandH, fw, fh - 2 * bandH, RED);
  // Thin ink frame around each flag + summit table line below.
  for (const fx of [ux, cx, rx]) {
    fillRect(fx, y, fw, 2, INK);
    fillRect(fx, y + fh - 2, fw, 2, INK);
    fillRect(fx, y, 2, fh, INK);
    fillRect(fx + fw - 2, y, 2, fh, INK);
  }
  fillRect(x, y + fh + 4, w, 3, INK);
}

// Story 3: rising bar chart with ANT $83 ticker and an upward arrow.
function drawChart(x: number, y: number, w: number, h: number): void {
  const baseY = y + h - 4;
  const heights = [12, 20, 28, 38, 48];
  const bw = 52;
  const gap = 14;
  for (let i = 0; i < heights.length; i++) {
    const bx = x + i * (bw + gap);
    fillRect(bx, baseY - heights[i], bw, heights[i], INK);
  }
  // Axis.
  fillRect(x, baseY, w - 130, 3, INK);
  // Upward arrow over the bars.
  drawLine(x + 8, baseY - 16, x + w - 150, y + 4, INK, 3);
  drawLine(x + w - 150, y + 4, x + w - 168, y + 6, INK, 3);
  drawLine(x + w - 150, y + 4, x + w - 152, y + 20, INK, 3);
  // Ticker label, top right.
  drawText("ANT $83", x + w - 126, y + 8, 3, INK);
  drawText("NASDAQ", x + w - 126, y + 36, 2, GREY);
}

// Story 4: Vice City skyline with palm trees and a big 99 badge.
function drawSkyline(x: number, y: number, w: number, h: number): void {
  const baseY = y + h - 2;
  const buildings: number[][] = [
    [0, 26, 46], [52, 40, 40], [98, 30, 52], [156, 48, 44],
    [206, 34, 40], [252, 22, 46], [304, 38, 36],
  ];
  for (const b of buildings) {
    const bx = x + b[0];
    const bh = b[1];
    const bw = b[2];
    fillRect(bx, baseY - bh, bw, bh, INK);
    // Windows.
    for (let wy = baseY - bh + 6; wy < baseY - 6; wy += 10) {
      for (let wx = bx + 6; wx < bx + bw - 5; wx += 11) {
        fillRect(wx, wy, 4, 5, PAPER);
      }
    }
  }
  // Palm tree: tall leaning trunk, five long drooping fronds, two coconuts.
  const px0 = x + 352;
  const pTopX = px0 + 8;
  const pTopY = baseY - 50;
  drawLine(px0, baseY, pTopX, pTopY, INK, 4);
  const fronds: number[][] = [
    [pTopX - 26, pTopY - 6], [pTopX - 16, pTopY - 16], [pTopX, pTopY - 20],
    [pTopX + 16, pTopY - 14], [pTopX + 26, pTopY - 4],
  ];
  for (const f of fronds) {
    drawLine(pTopX, pTopY, f[0], f[1], INK, 2);
    drawLine(f[0], f[1], f[0] + (f[0] < pTopX ? -6 : 6), f[1] + 10, INK, 2);
  }
  fillCircle(pTopX - 4, pTopY + 3, 3, INK);
  fillCircle(pTopX + 4, pTopY + 3, 3, INK);
  // Big 99 badge.
  const bcx = x + w - 44;
  const bcy = y + Math.floor(h / 2);
  fillCircle(bcx, bcy, 27, PAPER);
  circleOutline(bcx, bcy, 27, 4, INK);
  drawTextCentered("99", bcx, bcy - 14, 4, INK);
}

// Story 5: bold flame over a city building, DHAKA label.
function drawFlame(x: number, y: number, w: number, h: number): void {
  const baseY = y + h - 2;
  // City buildings along the bottom.
  const buildings: number[][] = [
    [0, 18, 60], [66, 26, 54], [126, 16, 66], [198, 24, 58],
  ];
  for (const b of buildings) {
    const bx = x + b[0];
    fillRect(bx, baseY - b[1], b[2], b[1], INK);
    for (let wy = baseY - b[1] + 5; wy < baseY - 4; wy += 9) {
      for (let wx = bx + 6; wx < bx + b[2] - 5; wx += 12) {
        fillRect(wx, wy, 4, 4, PAPER);
      }
    }
  }
  // Flame above the middle building: a tall teardrop with a flick.
  const fx = x + 128;
  const fy = baseY - 16;
  fillCircle(fx, fy - 14, 17, ORANGE);
  fillTriangle(fx - 17, fy - 6, fx + 17, fy - 6, fx + 2, y + 4, ORANGE);
  fillTriangle(fx - 17, fy, fx + 17, fy, fx, fy - 30, ORANGE);
  fillCircle(fx, fy - 6, 8, YELLOW);
  fillTriangle(fx - 8, fy, fx + 8, fy, fx, fy - 18, YELLOW);
  // DHAKA label, right side.
  drawText("DHAKA", x + w - 100, y + 8, 3, INK);
  drawText("LOCKDOWN", x + w - 100, y + 36, 2, GREY);
}

// ---------------------------------------------------------------------------
// PAGE LAYOUT
// ---------------------------------------------------------------------------
function rule(x0: number, x1: number, y: number, t: number): void {
  fillRect(x0, y, x1 - x0, t, INK);
}

function drawPage(): void {
  fillRect(0, 0, W, H, PAPER);

  // Masthead.
  rule(28, 996, 16, 3);
  drawTextCentered("WORLD NEWS", 512, 30, 9, INK);
  rule(28, 996, 102, 2);
  drawTextCentered("THURSDAY, 19 NOVEMBER 2026", 512, 114, 3, INK);
  rule(28, 996, 144, 2);

  // ---- Lead story (full width, art on the right) ----
  drawText(LEAD_KICKER, 28, 158, 2, GREY);
  drawWrapped(LEAD_HEADLINE, 28, 182, 640, 5, 42, INK);
  drawWrapped(LEAD_DECK, 28, 278, 640, 2, 17, INK);
  drawWrapped(LEAD_FACTS, 28, 372, 640, 2, 17, INK);
  drawLeadArt(690, 158, 996, 406);

  rule(28, 996, 420, 3);

  // ---- 2x2 grid ----
  const colW = 472;
  const colA = 28;
  const colB = 524;
  const row1 = 432;
  const row2 = 638;
  // Dividers.
  fillRect(510, 430, 2, 380, INK);
  rule(28, 996, 626, 2);

  const drawCell = (
    cx0: number, cy0: number,
    kicker: string, headline: string, deck: string,
    art: (x: number, y: number, w: number, h: number) => void,
  ): void => {
    drawText(kicker, cx0, cy0, 2, GREY);
    drawWrapped(headline, cx0, cy0 + 20, colW, 3, 25, INK);
    art(cx0, cy0 + 74, colW, 54);
    drawWrapped(deck, cx0, cy0 + 134, colW, 2, 17, INK);
  };

  drawCell(colA, row1, STORY2_KICKER, STORY2_HEADLINE, STORY2_DECK, drawFlags);
  drawCell(colB, row1, STORY3_KICKER, STORY3_HEADLINE, STORY3_DECK, drawChart);
  drawCell(colA, row2, STORY4_KICKER, STORY4_HEADLINE, STORY4_DECK, drawSkyline);
  drawCell(colB, row2, STORY5_KICKER, STORY5_HEADLINE, STORY5_DECK, drawFlame);

  // ---- IN BRIEF strip ----
  rule(28, 996, 820, 3);
  drawText("IN BRIEF", 28, 834, 3, INK);
  let by = 866;
  for (const item of BRIEFS) {
    fillRect(28, by + 3, 9, 9, INK);
    drawText(item, 48, by, 2, INK);
    by += 24;
  }
  rule(28, 996, 994, 3);
}

// ---------------------------------------------------------------------------
// PNG ENCODER (own implementation: chunks + CRC32; deflate via node:zlib)
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
fs.mkdirSync(outDir, { recursive: true });
drawPage();
const png = encodePNG();
fs.writeFileSync(path.join(outDir, "entry.png"), png);
