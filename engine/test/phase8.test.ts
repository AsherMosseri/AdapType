import { describe, expect, it } from "vitest";
import {
  CHALLENGE_FORMAT,
  CHALLENGE_MAX_NAME,
  CHALLENGE_TIME_STEP,
  ChallengeError,
  challengeGhost,
  challengeGhostAt,
  challengeResult,
  challengeRound,
  challengeText,
  CHALLENGE_MAX_TEXT,
  cleanName,
  decodeChallenge,
  encodeChallenge,
  makeChallenge,
  rematchChallenge,
  replayEvents,
  TypingRound,
  type Challenge,
  type ErrorMode,
  type TypingEvent,
} from "../src";
import { simulateTyping } from "./simulate";

/** Types a text with an uneven rhythm, a wrong key fixed now and then. */
function type(text: string, seed: number, msPerKey = 180): TypingEvent[] {
  const events = simulateTyping(text, { msPerKey, errorRate: 0.05, seed }, 5000);
  return events.map((e, i) => ({ ...e, t: e.t + ((i * 37) % 23) + i * 0.3 }));
}

function play(text: string, input: readonly TypingEvent[], mode: ErrorMode = "backspace", options: { autoIndent?: boolean } = {}): TypingRound {
  const round = new TypingRound(text, mode, options);
  for (const e of input) round.input(e);
  return round;
}

function challengeFor(text: string, seed: number, extra: Partial<Parameters<typeof makeChallenge>[0]> = {}, name = "Asher"): Challenge {
  const input = type(text, seed);
  const ch = makeChallenge({ target: text, errorMode: "backspace", events: replayEvents(input), ...extra }, "practice", name);
  if (!ch) throw new Error("no challenge");
  return ch;
}

const TEXT = "the quick brown fox jumps over the lazy dog while seven bright stars watch from far away";

describe("challenge links", () => {
  it("make whole time steps after the first keystroke, and finish the text", () => {
    const ch = challengeFor(TEXT, 1);
    expect(ch.events[0][0]).toBe(0);
    for (const [t] of ch.events) expect(t % CHALLENGE_TIME_STEP).toBe(0);
    expect(challengeRound(ch).done).toBe(true);
    expect(ch.score).toEqual([0, 0]);
    expect(ch.opponent).toBe("");
  });

  it("aren't made from a run that doesn't finish", () => {
    const input = type("the quick", 2);
    expect(makeChallenge({ target: TEXT, errorMode: "backspace", events: replayEvents(input) }, "practice", "")).toBeNull();
    expect(makeChallenge({ target: TEXT, errorMode: "backspace", events: [] }, "practice", "")).toBeNull();
  });

  it("read back exactly what was written, in every mode", () => {
    for (const mode of ["backspace", "block", "skip"] as const) {
      const input = type(TEXT, 3);
      const ch = makeChallenge({ target: TEXT, errorMode: mode, catchUp: true, events: replayEvents(input) }, "daily", "Sam");
      expect(ch).not.toBeNull();
      expect(decodeChallenge(encodeChallenge(ch!))).toEqual(ch);
      expect(ch!.catchUp).toBe(mode === "block");
    }
  });

  it("keep code's new lines and auto-indent, and any characters", () => {
    const code = "function f() {\n  return [1, 2];\n}";
    // With auto-indent, the spaces after a new line fill in by themselves.
    const typed = code.replace(/\n {2}/g, "\n");
    const input = [...typed].map((char, i) => ({ kind: "char" as const, char, t: 100 + i * 150 }));
    const ch = makeChallenge({ target: code, errorMode: "backspace", autoIndent: true, events: replayEvents(input) }, "code", "Zoë 🦊");
    expect(ch).not.toBeNull();
    const back = decodeChallenge(encodeChallenge(ch!));
    expect(back).toEqual(ch);
    expect(back.autoIndent).toBe(true);
    expect(challengeRound(back).done).toBe(true);

    const custom = challengeText("Café,  naïve\tfaçade: “quotes” — and 🦊…\r\n\r\n  next line ");
    expect(custom).toBe('Café, naïve façade: "quotes" - and ...\nnext line');
    const ch2 = makeChallenge({ target: custom, errorMode: "skip", events: replayEvents([...custom].map((char, i) => ({ kind: "char", char, t: i * 200 }))) }, "custom", "");
    expect(decodeChallenge(encodeChallenge(ch2!))).toEqual(ch2);
  });

  it("stay short: about a link character per text character, plus the timing", () => {
    const code = encodeChallenge(challengeFor(TEXT, 4));
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(TEXT.length * 4);
  });

  it("refuse damaged, cut off and newer links", () => {
    const code = encodeChallenge(challengeFor(TEXT, 5));
    expect(() => decodeChallenge(code.slice(0, code.length - 10))).toThrow(ChallengeError);
    expect(() => decodeChallenge(code + "AAAA")).toThrow(ChallengeError);
    expect(() => decodeChallenge("not a link!")).toThrow(ChallengeError);
    expect(() => decodeChallenge("")).toThrow(ChallengeError);
    // A newer format says so.
    try {
      decodeChallenge(Buffer.from([CHALLENGE_FORMAT + 1]).toString("base64url"));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ChallengeError);
      expect((e as ChallengeError).newer).toBe(true);
    }
  });

  it("make your own text typeable, up to the limit", () => {
    expect(challengeText("a".repeat(CHALLENGE_MAX_TEXT + 50)).length).toBe(CHALLENGE_MAX_TEXT);
    expect(challengeText("  \n\n ")).toBe("");
  });

  it("clean names", () => {
    expect(cleanName("  Sam \n  Lee\u0007 ")).toBe("Sam Lee");
    expect([...cleanName("x".repeat(40))].length).toBe(CHALLENGE_MAX_NAME);
    expect(cleanName("🦊".repeat(30))).toBe("🦊".repeat(CHALLENGE_MAX_NAME));
  });
});

describe("racing a challenge", () => {
  it("follows the sender's run as a ghost", () => {
    const ch = challengeFor(TEXT, 6);
    const ghost = challengeGhost(ch);
    expect(ghost.positions[ghost.positions.length - 1]).toBe(TEXT.length);
    expect(ghost.finishMs).toBe(ch.events[ch.events.length - 1][0]);
    expect(challengeGhostAt(ghost, -1)).toBe(0);
    expect(challengeGhostAt(ghost, 0)).toBe(ghost.positions[0]);
    expect(challengeGhostAt(ghost, ghost.finishMs)).toBe(TEXT.length);
    expect(challengeGhostAt(ghost, ghost.finishMs / 2)).toBe(challengeRound(ch, ghost.finishMs / 2).position);
    expect(ghost.metrics.wpm).toBeGreaterThan(0);
  });

  it("the faster finish wins, and the score carries into a rematch", () => {
    const ch = { ...challengeFor(TEXT, 7), score: [2, 1] as [number, number] };
    const theirMs = challengeGhost(ch).finishMs;
    // Faster than the sender.
    const fast = type(TEXT, 8, 120);
    const won = challengeResult(ch, play(TEXT, fast));
    expect(won.outcome).toBe("win");
    expect(won.theirMs).toBe(theirMs);
    expect(won.marginMs).toBe(theirMs - won.yourMs);
    expect(won.score).toEqual([2, 2]);
    // Slower.
    const lost = challengeResult(ch, play(TEXT, type(TEXT, 9, 300)));
    expect(lost.outcome).toBe("loss");
    expect(lost.score).toEqual([1, 3]);

    // Sent back: you're the sender now, and they're your opponent.
    const back = rematchChallenge(ch, play(TEXT, fast), fast, "Sam");
    expect(back).not.toBeNull();
    expect(back!.name).toBe("Sam");
    expect(back!.opponent).toBe("Asher");
    expect(back!.source).toBe("rematch");
    expect(back!.score).toEqual([2, 2]);
    expect(challengeGhost(back!).finishMs).toBe(won.yourMs);
    expect(decodeChallenge(encodeChallenge(back!))).toEqual(back);
  });

  it("is a tie at the same time step", () => {
    const input = type(TEXT, 10);
    const ch = makeChallenge({ target: TEXT, errorMode: "backspace", events: replayEvents(input) }, "practice", "")!;
    const r = challengeResult(ch, play(TEXT, input));
    expect(r.outcome).toBe("tie");
    expect(r.score).toEqual([0, 0]);
  });
});
