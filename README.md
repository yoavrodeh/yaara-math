# Yaara's Math

A small math practice app for a tablet: addition, subtraction, multiplication and division, four levels each plus a
"long" level written in columns (long division under a bracket), ten questions per round, a pastel strawberry
theme, and a play-time countdown.

It's a plain web app (no build step), installed on the tablet from Chrome with **Add to Home screen**, and it works
offline.

## Files

| File | What's in it |
|---|---|
| `app.js` | Everything that happens: the levels (`OPS` at the top), scoring, the timer, the screens |
| `style.css` | Colours (top of the file), sizes, decorations |
| `index.html` | The page, plus the leaf and flower shapes |
| `sw.js` | Offline support |
| `icon.svg` | The app icon; `icon-192.png` and `icon-512.png` are rendered from it |

## Changing it

- **Levels**: edit the `levels` list of an operation in `OPS` in `app.js`. Each level has a `sample` (shown on the
  level screen) and a `make` function that returns one question.
- **Long levels**: a question with a `sheet` is drawn as a worksheet (`columnSheet`, `divisionSheet`). Only the
  `ans` row is scored; carries, remainders and partial products are her working.
- **Questions per round, time choices**: constants at the top of `app.js`.
- Bump `VERSION` in `app.js` so you can see on the start screen that the tablet has the new version.

Try it locally with `python3 -m http.server 8765` and open <http://localhost:8765>.

Push to `main`: GitHub Pages republishes in a minute or so, and the tablet picks up the new version the next time
the app opens while online.

## Scoring

1 point for a right answer on the first try, ½ on the second; after a second miss the answer is shown. Points per
day and the best score per level are kept on the device.
