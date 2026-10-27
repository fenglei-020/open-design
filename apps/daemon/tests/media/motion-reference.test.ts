import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildMotionReference,
  MotionReferenceError,
  parseCuts,
  parseProbe,
  pickFrameTimes,
} from '../../src/media/motion-reference.js';

const PROBE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'ref.mp4':
  Duration: 00:00:15.03, start: 0.000000, bitrate: 2102 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080, 1984 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)`;

describe('motion reference parsing', () => {
  it('reads duration, size, fps and audio from the ffmpeg banner', () => {
    expect(parseProbe(PROBE)).toEqual({ durationSec: 15.03, width: 1920, height: 1080, fps: 30, hasAudio: true, hasVideo: true });
    expect(parseProbe(PROBE.replace(/\n.*Audio:.*$/m, '')).hasAudio).toBe(false);
  });

  it('keeps cuts inside the film, drops near-duplicates', () => {
    const log = ['pts_time:0.02', 'pts_time:2.5', 'pts_time:2.6', 'pts_time:6.25', 'pts_time:14.99'].map((t) => `[Parsed_showinfo_1] n:0 ${t} pos`).join('\n');
    expect(parseCuts(log, 15)).toEqual([2.5, 6.25]);
  });

  it('frames every shot and an even grid, never more than 24, all inside the film', () => {
    const times = pickFrameTimes([2.5, 6.25], 15);
    expect(times[0]).toBeLessThanOrEqual(0.3);
    expect(times.some((t) => t >= 2.5 && t < 3)).toBe(true);
    expect(times.some((t) => t >= 6.25 && t < 6.8)).toBe(true);
    expect(Math.max(...times)).toBeLessThan(15);
    expect(pickFrameTimes([], 170).length).toBeLessThanOrEqual(24);
  });
});

describe('buildMotionReference', () => {
  let project = '';
  let server: http.Server;
  let base = '';
  const savedYtDlp = process.env.OD_YTDLP_PATH;
  const savedPath = process.env.PATH;

  beforeAll(async () => {
    project = await mkdtemp(path.join(os.tmpdir(), 'motion-ref-'));
    // Two 2-second colour shots with a hard cut and a tone: a measurable reference.
    const made = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=red:s=640x360:d=2:r=30',
      '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=2:r=30',
      '-f', 'lavfi', '-i', 'sine=f=440:d=4',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(project, 'ref.mp4')]);
    expect(made.status).toBe(0);
    await writeFile(path.join(project, 'notes.txt'), 'not a video');
    server = http.createServer((req, res) => {
      if (req.url === '/clip.mp4') { void readFile(path.join(project, 'ref.mp4')).then((b) => { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(b); }); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>a post page</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Exercise the no-downloader path: yt-dlp is out of reach.
    delete process.env.OD_YTDLP_PATH;
    process.env.PATH = path.dirname(process.execPath);
  });

  afterAll(async () => {
    if (savedYtDlp === undefined) delete process.env.OD_YTDLP_PATH; else process.env.OD_YTDLP_PATH = savedYtDlp;
    process.env.PATH = savedPath;
    server?.close();
    await rm(project, { recursive: true, force: true });
  });

  it('measures an attached project file into facts, frames and a contact sheet', async () => {
    const r = await buildMotionReference({ projectDir: project, source: 'ref.mp4', id: 'a' });
    expect(r.dir).toBe('.motion-reference/a');
    expect(r.source).toEqual({ kind: 'file', value: 'ref.mp4' });
    expect(r.durationSec).toBeCloseTo(4, 0);
    expect([r.width, r.height, r.fps, r.hasAudio]).toEqual([640, 360, 30, true]);
    expect(r.cuts.some((t) => Math.abs(t - 2) < 0.15)).toBe(true);
    expect(r.frames.length).toBeGreaterThan(2);
    const facts = JSON.parse(await readFile(path.join(project, r.facts), 'utf8'));
    expect(facts.cuts).toEqual(r.cuts);
    expect((await readFile(path.join(project, r.contactSheet))).length).toBeGreaterThan(1000);
  });

  it('downloads a direct video link without a downloader', async () => {
    const r = await buildMotionReference({ projectDir: project, source: `${base}/clip.mp4`, id: 'b' });
    expect(r.source.kind).toBe('url');
    expect(r.durationSec).toBeCloseTo(4, 0);
  });

  it('asks for an upload when the link is a web page and no downloader exists', async () => {
    await expect(buildMotionReference({ projectDir: project, source: `${base}/post/1`, id: 'c' }))
      .rejects.toMatchObject({ code: 'NEEDS_UPLOAD' });
  });

  it('refuses paths outside the project and non-video files', async () => {
    await expect(buildMotionReference({ projectDir: project, source: '../etc/passwd', id: 'd' })).rejects.toBeInstanceOf(MotionReferenceError);
    await expect(buildMotionReference({ projectDir: project, source: 'notes.txt', id: 'e' })).rejects.toMatchObject({ code: 'NOT_VIDEO' });
  });

  it('works in a brand-new project whose folder does not exist yet', async () => {
    const fresh = path.join(project, 'not-created-yet');
    const r = await buildMotionReference({ projectDir: fresh, source: `${base}/clip.mp4`, id: 'f' });
    expect(r.durationSec).toBeCloseTo(4, 0);
  });
});
