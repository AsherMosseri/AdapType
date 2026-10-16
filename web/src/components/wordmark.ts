import { h } from "../dom";

/** The logo and name, as shown at the top of each screen. */
export function wordmark(): HTMLElement {
  return h(
    "span",
    { class: "wordmark" },
    h("img", { class: "wordmark-logo", src: `${import.meta.env.BASE_URL}favicon.svg`, alt: "", width: "28", height: "28" }),
    h("span", null, "Adap", h("b", null, "Type")),
  );
}
