// Keyboard rows for drawing heatmaps and drift maps: each layout position in
// order, with punctuation positions as gaps (null) so letters line up where
// they really are. Trailing punctuation is dropped, so QWERTY draws as before.
import { KEY_LAYOUTS, type LayoutId } from "../../engine/src";

export function keyboardRows(layout: LayoutId): (string | null)[][] {
  return KEY_LAYOUTS[layout].rows.map((row) => {
    const keys = [...row].map((c) => (c >= "a" && c <= "z" ? c : null));
    while (keys.length && keys[keys.length - 1] === null) keys.pop();
    return keys;
  });
}
