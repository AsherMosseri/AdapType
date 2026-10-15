import { wordsFromText } from "../../../engine/src";
import type { App, Screen, ScreenView } from "../app";
import { topBar } from "../components/topBar";
import { h } from "../dom";
import type { CustomPack, PackWeight } from "../store";

export const WEIGHT_CHOICES: { id: string; label: string }[] = [
  { id: "0", label: "Off" },
  { id: "1", label: "A little" },
  { id: "2", label: "Even" },
  { id: "4", label: "A lot" },
];

/**
 * Make or edit one of your own word packs: paste text or import a .txt or
 * .md file. Only the words and how often each appears are kept.
 */
export function wordsScreen(app: App, screen: Screen): ScreenView {
  if (screen.name !== "words") throw new Error("words");
  const existing = screen.id ? app.data.customPacks.find((p) => p.id === screen.id) : undefined;
  const back = () => app.go(screen.returnTo ?? { name: "settings" });
  let words: [string, number][] = existing ? existing.words : [];
  let addMode = !!existing;

  const nameInput = h("input", { type: "text", id: "pack-name", class: "text-input", maxlength: "40", value: existing?.name ?? "", placeholder: "Work, School, My novel…" });
  const textArea = h("textarea", { id: "pack-text", class: "text-area", rows: "10", placeholder: "Paste an email, notes, an essay or anything you type a lot." });
  const fileInput = h("input", { type: "file", id: "pack-file", accept: ".txt,.md,text/plain,text/markdown", class: "sr-only" });
  const preview = h("div", { class: "pack-preview", "aria-live": "polite" });
  const status = h("p", { class: "status", role: "status" });
  const saveButton = h("button", { type: "button", class: "button primary" }, existing ? "Save changes" : "Save pack");

  const merge = (incoming: [string, number][]) => {
    const counts = new Map(addMode ? words : []);
    for (const [w, n] of incoming) counts.set(w, (counts.get(w) ?? 0) + n);
    // Re-sort the same way the engine does: most common first, then alphabetical.
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5000) as [string, number][];
  };

  const renderPreview = () => {
    const pending = textArea.value.trim() ? wordsFromText(textArea.value) : [];
    const shown = pending.length ? merge(pending) : words;
    preview.replaceChildren(
      shown.length === 0
        ? h("p", { class: "fine" }, "Words show up here as you paste.")
        : h(
            "div",
            null,
            h("p", null, h("strong", null, `${shown.length.toLocaleString()} different words. `), "The most common:"),
            h("ul", { class: "word-chips" }, shown.slice(0, 24).map(([w, n]) => h("li", null, w, h("span", { class: "fine" }, ` ${n}`)))),
          ),
    );
  };
  textArea.addEventListener("input", renderPreview);
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      status.textContent = "That file is over 2 MB. Try a shorter one.";
      return;
    }
    textArea.value = await file.text();
    status.textContent = `Read ${file.name}.`;
    renderPreview();
  });

  saveButton.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const pending = textArea.value.trim() ? wordsFromText(textArea.value) : [];
    const next = pending.length ? merge(pending) : words;
    if (!name) {
      status.textContent = "Give the pack a name.";
      nameInput.focus();
      return;
    }
    if (next.length === 0) {
      status.textContent = "Paste some text or import a file first.";
      textArea.focus();
      return;
    }
    if (existing) {
      existing.name = name;
      existing.words = next;
      existing.at = Date.now();
    } else {
      const pack: CustomPack = { id: `p${Date.now().toString(36)}`, name, words: next, weight: 2 as PackWeight, at: Date.now() };
      app.data.customPacks.push(pack);
    }
    // The pasted text is dropped here: only the word counts above are saved.
    textArea.value = "";
    app.persist();
    back();
  });

  const modeChoice = existing
    ? h(
        "div",
        { class: "segmented", role: "radiogroup", "aria-label": "Adding text" },
        [
          { id: "add", label: "Add to these words", on: true },
          { id: "replace", label: "Replace them" },
        ].map((c) => {
          const input = h("input", { type: "radio", name: "pack-mode", id: `pack-mode-${c.id}`, checked: !!c.on });
          input.addEventListener("change", () => {
            addMode = c.id === "add";
            renderPreview();
          });
          return h("label", { for: `pack-mode-${c.id}` }, input, h("span", null, c.label));
        }),
      )
    : null;

  const main = h(
    "main",
    { class: "words-screen" },
    h("h1", { tabindex: "-1" }, existing ? `Edit ${existing.name}` : "Your own words"),
    h(
      "p",
      { class: "lead" },
      "Practice the words you actually type. AdapType keeps only the words and how often each appears, never your text, and it stays on this device.",
    ),
    h(
      "section",
      { class: "panel" },
      h("label", { class: "field-label", for: "pack-name" }, "Name"),
      nameInput,
      h("label", { class: "field-label", for: "pack-text" }, existing ? "Add more text" : "Text"),
      modeChoice,
      textArea,
      h(
        "div",
        { class: "actions wrap" },
        h("label", { class: "button", for: "pack-file", tabindex: "0", onkeydown: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fileInput.click()) }, "Import a .txt or .md file"),
        fileInput,
      ),
      preview,
      h("div", { class: "actions wrap" }, saveButton, h("button", { type: "button", class: "button", onclick: back }, "Cancel")),
      status,
      h("p", { class: "fine" }, "Words only show up in practice once their letters are unlocked. Words with apostrophes and numbers are left out."),
    ),
  );
  renderPreview();
  const el = h("div", { class: "screen" }, topBar(app, { back, backLabel: "Back" }), main);
  return { el };
}
