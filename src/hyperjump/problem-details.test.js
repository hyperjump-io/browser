import { describe, test, expect } from "vitest";
import { problemDetail, problemResponse } from "./problem-details.js";

/** @type (body: string, contentType?: string) => Response */
const respond = (body, contentType = "application/problem+json") => new Response(body, { status: 500, headers: { "content-type": contentType } });

describe("Problem Details", () => {
  test("a layer's response has its detail", async () => {
    const response = problemResponse("https://example.com/a", 403, "Forbidden", "Not allowed");

    expect(response.status).to.equal(403);
    expect(response.statusText).to.equal("Forbidden");
    expect(response.url).to.equal("https://example.com/a");
    expect(await problemDetail(response)).to.equal("Not allowed");
  });

  test("a server's Problem Details are read the same way", async () => {
    expect(await problemDetail(respond(`{ "detail": "Gone" }`, "application/problem+json; charset=utf-8"))).to.equal("Gone");
  });

  test.each([
    ["a body that isn't Problem Details", respond(`{ "detail": "Gone" }`, "application/json")],
    ["Problem Details that aren't JSON", respond(`detail`)],
    ["Problem Details without a detail", respond(`{ "title": "Gone" }`)],
    ["a detail that isn't a string", respond(`{ "detail": 42 }`)]
  ])("%s has no detail", async (_name, response) => {
    expect(await problemDetail(response)).to.equal(undefined);
  });

  test("control characters are removed", async () => {
    expect(await problemDetail(respond(JSON.stringify({ detail: "a\u001B[31mb\nc\u009Bd" })))).to.equal("a[31mbcd");
  });

  test("a long detail is cut", async () => {
    const detail = await problemDetail(respond(JSON.stringify({ detail: "a".repeat(1000) })));
    expect(detail).to.equal(`${"a".repeat(300)}…`);
  });
});
