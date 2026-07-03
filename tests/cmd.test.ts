import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cmdSites } from "../src/commands/sites.js";
import { cmdEdge } from "../src/commands/edge.js";
import { cmdBots } from "../src/commands/bots.js";
import { cmdSources } from "../src/commands/sources.js";
import { cmdExport } from "../src/commands/export.js";
import { cmdStats } from "../src/commands/stats.js";
import { cmdCampaigns } from "../src/commands/campaigns.js";
import { cmdReferrals } from "../src/commands/referrals.js";
import { cmdLanders } from "../src/commands/landers.js";
import { cmdEvents } from "../src/commands/events.js";
import { cmdUsers } from "../src/commands/users.js";
import { cmdFunnel } from "../src/commands/funnel.js";
import { cmdSeo } from "../src/commands/seo.js";
import { cmdSpeed } from "../src/commands/speed.js";
import { cmdInsights } from "../src/commands/insights.js";
import { copyToClipboard } from "../src/clipboard.js";
import { _resetSiteCache } from "../src/commands/helpers.js";

vi.mock("../src/clipboard.js", () => ({
  copyToClipboard: vi.fn(async () => ({ ok: true })),
}));

function stubFetch(sitesPayload: unknown, secondPayload?: unknown) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (String(url).includes("/api/sites")) {
      return { ok: true, status: 200, json: async () => sitesPayload, text: async () => "" } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => secondPayload ?? [], text: async () => "" } as unknown as Response;
  });
}

function captureStdout(fn: () => Promise<void>): Promise<string> {
  return new Promise(async (resolve, reject) => {
    let out = "";
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => { out += String(chunk); return true; };
    try { await fn(); } catch (e) { process.stdout.write = orig; reject(e); return; }
    process.stdout.write = orig;
    resolve(out);
  });
}

const SITE = { id: "my-blog", name: "My Blog", property: "GA-999", cfZoneId: "zone-1", gscSiteUrl: "https://my-blog.com", domain: "my-blog.com" };

beforeEach(() => {
  process.env.FLEETS_TOKEN = "fl_test_cli_token";
  process.env.FLEETS_API_URL = "https://fleets.run";
  _resetSiteCache();
});

afterEach(() => {
  delete process.env.FLEETS_TOKEN;
  delete process.env.FLEETS_API_URL;
  vi.restoreAllMocks();
  _resetSiteCache();
});

// ---------------------------------------------------------------------------
// cmdSites
// ---------------------------------------------------------------------------

describe("cmdSites", () => {
  it("lists sites with correct Bearer header", async () => {
    const sites = [{ id: "my-blog", name: "My Blog", property: "123" }];
    const fetchMock = stubFetch(sites);
    vi.stubGlobal("fetch", fetchMock);
    const output = await captureStdout(() => cmdSites());
    expect(output).toContain("my-blog");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer fl_test_cli_token");
  });

  it("prints no sites message when list is empty", async () => {
    vi.stubGlobal("fetch", stubFetch([]));
    const output = await captureStdout(() => cmdSites());
    expect(output).toContain("no sites");
  });
});

// ---------------------------------------------------------------------------
// cmdEdge (replaces cmdBots)
// ---------------------------------------------------------------------------

describe("cmdEdge", () => {
  it("calls /api/cf with zone and range", async () => {
    const cfData = { summary: { humans: 900, bots: 100, total: 1000 } };
    const fetchMock = stubFetch([SITE], cfData);
    vi.stubGlobal("fetch", fetchMock);
    const output = await captureStdout(() => cmdEdge(["my-blog"], { range: "7d" }));
    expect(output).toBeTruthy();
    const cfCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/cf"));
    expect(cfCall).toBeDefined();
    expect(String(cfCall![0])).toContain("days=7");
  });

  it("exits with error for unknown slug", async () => {
    vi.stubGlobal("fetch", stubFetch([]));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as never);
    await cmdEdge(["nonexistent"], {}).catch(() => {});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// cmdBots (alias for edge)
// ---------------------------------------------------------------------------

describe("cmdBots", () => {
  it("delegates to edge — calls /api/cf", async () => {
    const cfData = { summary: { humans: 900, bots: 100, total: 1000 } };
    const fetchMock = stubFetch([SITE], cfData);
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdBots(["my-blog"], { range: "7d" }));
    const cfCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/cf"));
    expect(cfCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// cmdSources
// ---------------------------------------------------------------------------

describe("cmdSources", () => {
  it("calls /api/ga?view=sources with correct property", async () => {
    const sources = [{ sourceMedium: "google / organic", sessions: 500, users: 400 }];
    const fetchMock = stubFetch([SITE], sources);
    vi.stubGlobal("fetch", fetchMock);
    const output = await captureStdout(() => cmdSources(["my-blog"], { range: "7d" }));
    expect(output).toContain("google");
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("view=sources");
    expect(gaUrl).toContain("property=GA-999");
  });
});

// ---------------------------------------------------------------------------
// cmdStats
// ---------------------------------------------------------------------------

describe("cmdStats", () => {
  it("calls /api/ga?view=summary", async () => {
    const fetchMock = stubFetch([SITE], { sessions: 100 });
    vi.stubGlobal("fetch", fetchMock);
    const output = await captureStdout(() => cmdStats(["my-blog"], { range: "7d" }));
    expect(output).toBeTruthy();
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("view=summary");
  });

  it("throws without token", async () => {
    delete process.env.FLEETS_TOKEN;
    await expect(cmdStats(["my-blog"], {})).rejects.toThrow("not logged in");
  });
});

// ---------------------------------------------------------------------------
// cmdCampaigns
// ---------------------------------------------------------------------------

describe("cmdCampaigns", () => {
  it("calls /api/ga?view=campaigns", async () => {
    const fetchMock = stubFetch([SITE], []);
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdCampaigns(["my-blog"], {}));
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("view=campaigns");
  });
});

// ---------------------------------------------------------------------------
// cmdReferrals
// ---------------------------------------------------------------------------

describe("cmdReferrals", () => {
  it("calls /api/ga?view=referrals", async () => {
    const fetchMock = stubFetch([SITE], []);
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdReferrals(["my-blog"], {}));
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("view=referrals");
  });
});

// ---------------------------------------------------------------------------
// cmdLanders
// ---------------------------------------------------------------------------

describe("cmdLanders", () => {
  it("calls /api/ga?view=landers", async () => {
    const fetchMock = stubFetch([SITE], []);
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdLanders(["my-blog"], {}));
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("view=landers");
  });
});

// ---------------------------------------------------------------------------
// cmdEvents
// ---------------------------------------------------------------------------

describe("cmdEvents", () => {
  it("calls /api/ga?view=events", async () => {
    const fetchMock = stubFetch([SITE], []);
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdEvents(["my-blog"], {}));
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("view=events");
  });
});

// ---------------------------------------------------------------------------
// cmdUsers
// ---------------------------------------------------------------------------

describe("cmdUsers", () => {
  it("calls /api/ga?view=users", async () => {
    const fetchMock = stubFetch([SITE], {});
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdUsers(["my-blog"], {}));
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("view=users");
  });
});

// ---------------------------------------------------------------------------
// cmdFunnel
// ---------------------------------------------------------------------------

describe("cmdFunnel", () => {
  it("calls /api/ga?view=funnel with steps", async () => {
    const fetchMock = stubFetch([SITE], {});
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdFunnel(["my-blog", "/home", "/checkout"], {}));
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("view=funnel");
    expect(gaUrl).toContain("steps=");
  });

  it("exits without two steps", async () => {
    vi.stubGlobal("fetch", stubFetch([SITE], {}));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as never);
    await cmdFunnel(["my-blog", "/home"], {}).catch(() => {});
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

// ---------------------------------------------------------------------------
// cmdSeo
// ---------------------------------------------------------------------------

describe("cmdSeo", () => {
  it("calls /api/gsc?view=summary with gscSiteUrl", async () => {
    const fetchMock = stubFetch([SITE], {});
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdSeo(["my-blog"], {}));
    const gscUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/gsc"))![0]);
    expect(gscUrl).toContain("view=summary");
    expect(gscUrl).toContain("site=");
  });

  it("exits without GSC site when not configured", async () => {
    const siteNoGsc = { id: "my-blog", name: "My Blog", property: "GA-999" };
    vi.stubGlobal("fetch", stubFetch([siteNoGsc], {}));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as never);
    await cmdSeo(["my-blog"], {}).catch(() => {});
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// cmdSpeed
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// cmdInsights --prompt / --copy
// ---------------------------------------------------------------------------

describe("cmdInsights", () => {
  const INSIGHTS = {
    generatedAt: "2026-06-26T15:29:00Z",
    count: 1,
    insights: [{ id: "pricing-meta", severity: "high", title: "t", body: "b", prompt: "PASTE ME" }],
  };
  function stubInsights() {
    return vi.fn(async () => ({ ok: true, status: 200, json: async () => INSIGHTS, text: async () => "" } as unknown as Response));
  }

  it("prints the prompt to stdout with --prompt", async () => {
    vi.stubGlobal("fetch", stubInsights());
    const output = await captureStdout(() => cmdInsights([], { prompt: "first" }));
    expect(output).toContain("PASTE ME");
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it("copies to clipboard (not stdout) with --prompt --copy", async () => {
    vi.stubGlobal("fetch", stubInsights());
    const output = await captureStdout(() => cmdInsights([], { prompt: "first", copy: true }));
    expect(copyToClipboard).toHaveBeenCalledWith("PASTE ME");
    expect(output).not.toContain("PASTE ME");
  });

  it("falls back to stdout when clipboard copy fails", async () => {
    (copyToClipboard as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, reason: "no clipboard tool found" });
    vi.stubGlobal("fetch", stubInsights());
    const output = await captureStdout(() => cmdInsights([], { prompt: "first", copy: true }));
    expect(output).toContain("PASTE ME");
  });
});

describe("cmdSpeed", () => {
  it("calls /api/psi with domain and strategy", async () => {
    const fetchMock = stubFetch([SITE], {});
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdSpeed(["my-blog"], { strategy: "mobile" }));
    const psiUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/psi"))![0]);
    expect(psiUrl).toContain("strategy=mobile");
    expect(psiUrl).toContain("url=");
  });
});

// ---------------------------------------------------------------------------
// cmdExport
// ---------------------------------------------------------------------------

describe("cmdExport", () => {
  it("outputs CSV with correct header on --format csv", async () => {
    const rows = [{ date: "2024-01-01", value: 100 }, { date: "2024-01-02", value: 120 }];
    vi.stubGlobal("fetch", stubFetch([SITE], rows));
    const output = await captureStdout(() => cmdExport(["my-blog"], { range: "30d", format: "csv" }));
    expect(output).toContain("date,sessions");
    expect(output).toContain("2024-01-01,100");
  });

  it("outputs JSON by default", async () => {
    const rows = [{ date: "2024-01-01", value: 42 }];
    vi.stubGlobal("fetch", stubFetch([SITE], rows));
    const output = await captureStdout(() => cmdExport(["my-blog"], { range: "7d" }));
    const parsed = JSON.parse(output);
    expect(parsed).toEqual(rows);
  });

  it("calls /api/ga with days=30 when --range 30d", async () => {
    const fetchMock = stubFetch([SITE], []);
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdExport(["my-blog"], { range: "30d" }));
    const gaUrl = String(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"))![0]);
    expect(gaUrl).toContain("days=30");
  });

  it("sends Bearer token on export request", async () => {
    const fetchMock = stubFetch([SITE], []);
    vi.stubGlobal("fetch", fetchMock);
    await captureStdout(() => cmdExport(["my-blog"], { range: "7d" }));
    const gaCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/ga"));
    const [, init] = gaCall as [string, RequestInit];
    expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer fl_test_cli_token");
  });
});
