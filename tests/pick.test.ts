import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { cleanStoredQuote, linksInPosts, parseRedditRss } from "../lib/feeds";
import {
  MISSING_KEY_MESSAGE,
  chooseFromPool,
  poolForExploration,
  ratesFromPicks,
  smoothedRate,
  type CandidateInput,
  type PickModel,
} from "../lib/pick-logic";
import { sourceConfigFor, sourceKeyFor } from "../lib/source-config";
import { earliestPickDate, laMidnightUtc } from "../lib/time";

const high = { good: 8, total: 10, rate: smoothedRate(8, 10) };
const low = { good: 0, total: 0, rate: smoothedRate(0, 0) };

function candidate(id: string, key: string): CandidateInput {
  return {
    id,
    sources: [
      {
        key,
        url: "https://example.com/post",
        platform: "reddit",
        excerpt: "people recommended this ship tour",
        sourceScore: 12,
        commentCount: 4,
      },
    ],
  };
}

describe("rates and exploration", () => {
  it("smooths a good-rate as (good + 1) / (total + 2)", () => {
    assert.equal(smoothedRate(1, 1), 2 / 3);
    assert.equal(smoothedRate(0, 0), 0.5);
  });

  it("sums votes onto each source key once per pick", () => {
    const rates = ratesFromPicks([
      { keys: ["reddit:r/Starfield", "hn:"], good: 2, total: 2 },
      { keys: ["reddit:r/Starfield"], good: 0, total: 2 },
    ]);
    assert.equal(rates.get("reddit:r/Starfield")?.total, 4);
    assert.equal(rates.get("hn:")?.good, 2);
  });

  it("limits the pool to a low-data source after four familiar picks", () => {
    const rates = new Map([
      ["reddit:r/Starfield", high],
      ["hn:", low],
    ]);
    const familiar = candidate("a", "reddit:r/Starfield");
    const fresh = candidate("b", "hn:");
    const recent = ["reddit:r/Starfield", "reddit:r/Starfield", "reddit:r/Starfield", "reddit:r/Starfield"];
    const pool = poolForExploration([familiar, fresh], recent, rates);
    assert.deepEqual(pool.map((item) => item.id), ["b"]);
  });
});

describe("chooseFromPool", () => {
  afterEach(() => mock.restoreAll());

  it("logs and leaves a gap when the model is missing", async () => {
    const errors = mock.method(console, "error", () => {});
    const result = await chooseFromPool({
      candidates: [candidate("video-1", "reddit:r/Starfield")],
      rates: new Map(),
      recentSourceKeys: [],
      channelRates: null,
      model: null,
      count: 1,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.gap, MISSING_KEY_MESSAGE);
    assert.equal(errors.mock.calls[0]?.arguments[0], MISSING_KEY_MESSAGE);
  });

  it("uses the mocked model choice and keeps YouTube text out of the prompt", async () => {
    let seen = "";
    const model: PickModel = async (prompt) => {
      seen = prompt;
      return [{ videoId: "video-1", whyLine: "Recommended on r/Starfield.", rationale: "Only source with a post." }];
    };
    const result = await chooseFromPool({
      candidates: [candidate("video-1", "reddit:r/Starfield")],
      rates: new Map([["reddit:r/Starfield", high]]),
      recentSourceKeys: [],
      channelRates: null,
      model,
      count: 1,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.choices[0]?.videoId, "video-1");
      assert.equal(result.choices[0]?.whyLine, "Recommended on r/Starfield.");
    }
    assert.match(seen, /reddit:r\/Starfield/);
    assert.match(seen, /people recommended this ship tour/);
    assert.doesNotMatch(seen, /SECRET TITLE/);
    assert.match(seen, /Do not use or invent YouTube titles/);
  });

  it("records a gap when the model throws", async () => {
    mock.method(console, "error", () => {});
    const model: PickModel = async () => {
      throw new Error("anthropic down");
    };
    const result = await chooseFromPool({
      candidates: [candidate("video-1", "hn:")],
      rates: new Map(),
      recentSourceKeys: [],
      channelRates: null,
      model,
      count: 1,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.gap, "anthropic down");
  });

  it("rejects a video id that was not offered", async () => {
    mock.method(console, "error", () => {});
    const model: PickModel = async () => [{ videoId: "other", whyLine: "nope", rationale: "nope" }];
    const result = await chooseFromPool({
      candidates: [candidate("video-1", "hn:")],
      rates: new Map(),
      recentSourceKeys: [],
      channelRates: null,
      model,
      count: 1,
    });
    assert.equal(result.ok, false);
  });
});

describe("dates and sources", () => {
  it("schedules a pick date at least 12 hours ahead", () => {
    const now = new Date("2026-11-15T15:00:00Z");
    const date = earliestPickDate(now);
    assert.ok(laMidnightUtc(date).getTime() >= now.getTime() + 12 * 60 * 60 * 1000);
  });

  it("uses the owner's source defaults", () => {
    const starfield = sourceConfigFor("starfield", {});
    assert.equal(starfield.hn, false);
    assert.deepEqual(starfield.subreddits, ["Starfield", "starfieldmods"]);
    const ai = sourceConfigFor("ai-game-dev", {});
    assert.equal(ai.hn, true);
    assert.deepEqual(ai.subreddits, ["aigamedev", "gamedev"]);
    assert.equal(ai.subreddits.includes("proceduralgeneration"), false);
  });

  it("builds reddit and hn source keys", () => {
    assert.equal(sourceKeyFor("reddit", "https://www.reddit.com/r/Starfield/comments/abc/title/"), "reddit:r/Starfield");
    assert.equal(sourceKeyFor("hacker_news", "https://news.ycombinator.com/item?id=1"), "hn:");
  });

  it("reads a YouTube id out of a Reddit feed entry", () => {
    const xml = `<feed><entry><link href="https://www.reddit.com/r/Starfield/comments/abc/title/" /><title>Watch</title><content>https://youtu.be/dQw4w9WgXcQ</content><published>2026-11-01T00:00:00+00:00</published></entry></feed>`;
    const links = linksInPosts(parseRedditRss(xml), "reddit", "reddit:r/Starfield");
    assert.equal(links.length, 1);
    assert.equal(links[0]?.youtubeId, "dQw4w9WgXcQ");
    assert.equal(links[0]?.sourceKey, "reddit:r/Starfield");
  });

  it("stores a reddit post as a title and a short plain excerpt", () => {
    const xml = `<feed><entry><link href="https://www.reddit.com/r/starfieldmods/comments/abc/starfield_manual_leaning/" /><title>Starfield Manual Leaning</title><content>&lt;table&gt;&lt;!-- SC_OFF --&gt;&lt;p&gt;Working in first and third person.&lt;/p&gt;&amp;#32; submitted by &amp;#32; &lt;a href="https://www.reddit.com/user/x"&gt;/u/x&lt;/a&gt; https://youtu.be/abcdefghijk</content></entry></feed>`;
    const [post] = parseRedditRss(xml);
    assert.equal(post?.excerpt.startsWith("Starfield Manual Leaning\n"), true);
    assert.equal(post?.excerpt.includes("<"), false);
    assert.equal(post?.excerpt.includes("submitted by"), false);
    assert.ok((post?.excerpt.length ?? 0) <= 200);
    assert.equal(post?.text.includes("abcdefghijk"), true);
    const cleaned = cleanStoredQuote(
      `Starfield Manual Leaning <table> <tr><td> <!-- SC_OFF --><p>Working in first and third person.</p> &#32; submitted by &#32; <a href="/u/x">/u/x</a>`,
    );
    assert.equal(cleaned.includes("<"), false);
    assert.equal(cleaned.includes("submitted by"), false);
    assert.ok(cleaned.length <= 200);
  });
});
