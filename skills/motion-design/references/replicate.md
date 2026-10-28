# Replicating a reference film

Shared rules for rebuilding a reference video as an editable Open Design
Motion film. Open Design uses them when a user asks to replicate a video;
ODEval's template pipeline uses the same rules and adds its packaging on top.

## The one rule that matters

**Measure the timeline; never estimate it.** Eyeballing beat boundaries from
a contact sheet has been wrong by more than a second in a 15-second film.
`od media reference` gives the measured cuts; build every timing from them.

## Precedence

When instructions conflict, decide in this order:

1. What was measured in the reference — timing, motion, layout, palette.
2. What the user said about the reference — what to keep, what to change.
3. Your own taste, last.

Other guidance (including the general motion-design craft) governs syntax,
the composition contract and project rules only. Do not bring in a house
style — a default palette, art direction or "pick one material world" — when
it contradicts the reference. Say in the final reply what you changed and why.

## 1. Read the measurements

`facts.json` holds duration, size, fps, whether there is audio, and `cuts` in
seconds. `contact.jpg` shows the film at a glance; `frames/` holds a frame
early in every shot plus an even grid. View the contact sheet first, then the
frames. Hard cuts alone are not enough: motion graphics change type, layout
and stage colour inside a single shot, so the frames are the evidence and the
cut list is a hint. For a moment the frames miss, cut one yourself:
`ffmpeg -ss <t> -i <reference video> -frames:v 1 out.png`.

Write the beat map before any code: for each beat its start and length (from
the cuts), what fills the frame, the exact copy, palette, type, the motion
mechanism (what transforms into what) and how it exits.

## 2. Fidelity follows the request

- "Replicate / 复刻 / make the same film": rebuild it as it is — the same
  beats, timing, copy, composition, palette and motion. Keep its brand names,
  products, characters and numbers unless the user asks otherwise.
- "Like this, for my brand / change X": keep the reference's form and feel —
  beat structure, rhythm, motion grammar, composition, palette mood — and swap
  only the content named. An adapted film does not carry the reference's
  words, phrasing, logo, footage, people or places unless the user asks to
  keep them; a scene whose content only holds for the reference's brand (what
  its name means, its story) is rewritten for the user's brand in the same
  form, or cut with its time given to a neighbour.

## 3. Author editable source

Write the film so a later "change this" is a one-place edit:

- One configuration holds the clock: `duration`, `scenes: [{ id, name, dur }]`
  with each scene starting where the previous one ends, and `cues: [{ id,
  scene, at }]` for key events (`at` in seconds from the scene start; an exit
  or transition tied to the scene's end is `{ from: "end", at: 0.35 }`). Read
  event times from the cues, never hard-code them in drawing code.
- Copy, colours, image paths and fonts a user might swap live in that
  configuration, not scattered through the markup.
- Every element a person might point at — headline, logo, product shot,
  price, figure — carries `data-od-id="kebab-case-id"`. On a canvas film the
  configuration keys and cue ids are the only handles; name them clearly.
- Every scene keeps some ambient motion written as a function of time, so a
  scene stretched later never freezes on its last frame.

## 4. Pictures: cut the stills, rebuild what moves

- A static still — photo, product shot, screenshot, icon, logo — may be cut
  from the reference's largest clean frame into the composition's `assets/`
  **only when the user says it is theirs or asks to keep it**; otherwise
  rebuild it or use a neutral stand-in of the same shape and role.
- Anything that performs — blinks, changes expression, deforms, a wordmark
  whose letters arrive one by one — is rebuilt in HTML, SVG or Canvas, in the
  same medium and look (a halftone figure stays halftone, with the same face).
- The reference video itself, and whole reference frames used as a backdrop,
  never go into the film.

## 5. Type

1. Identify each face from full-size crops of sharp frames: class, weight,
   width, x-height and tell-tale glyphs (`a`, `g`, `R`, digits). Compare two or
   three candidates set in the same text at the same size, and match size on
   the cap-height.
2. Use redistributable faces only — Google Fonts families (OFL, Apache, UFL).
   A commercial or brand face is replaced by the closest Google Fonts family;
   say which.
3. Bundle each face you draw with into the composition's `assets/` and load it
   with a relative `@font-face`, never a CDN. Bundle every weight and italic you
   set; do not let the browser fake bold or italic.
4. Declare the faces once on `:root` as roles — `--od-font-heading` and
   `--od-font-body` — each as the Latin face, then `"Noto Sans SC"` (or `"Noto
   Serif SC"` for serifs), then `"PingFang SC","Hiragino Sans GB","Microsoft
   YaHei"`, then the generic family, and use them in `font-family` rules (a
   canvas reads them with `getComputedStyle`). Chinese copy then renders
   without boxes.

## 6. Check against the reference

Two layers, in the delivery check:

1. **Does the film hold together?** Capture just before and after each scene
   boundary and one mid-scene frame; adjacent captures must connect.
2. **Does it match the reference?** At the same timestamps — the opening, the
   key transformation, the ending, and any beat that looked off — put the
   reference frame and the render side by side and compare beat timing,
   composition, palette, type and the state of the motion.

Wait for fonts before capturing (`document.fonts.ready`, then two animation
frames); a capture during font loading shows fallback glyphs that are not a
real defect. Similarity scores are a smoke alarm only; judge the pairs by eye.
Still frames cannot show motion: if the reference's figure blinks or boils,
compare a few consecutive frames (0.04 s apart) in that scene.

Fix the single largest difference first — position and size by measuring both
frames, a late or early beat in the configuration not the drawing code, type
hierarchy by size and weight before spacing.

## 7. Sound

Unchanged from the general sound policy. The reference's own soundtrack is
reused only when the user explicitly asks; `facts.json` says whether it has
one.
