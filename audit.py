"""Full-platform browser audit: renders every route, captures console errors,
failed network requests, and verifies key UI actually appears."""
import sys, json, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"

ROUTES = ["/", "/opportunities", "/markets", "/markets/XAUUSD", "/markets/SP500",
          "/calendar", "/record", "/journal", "/account", "/live"]

# Noise we intentionally ignore: third-party analytics/telemetry from the
# TradingView iframe, and favicon 404s.
IGNORE = ("telemetry", "analytics", "favicon", "google", "doubleclick",
          "sentry", "hotjar", "widgetembed", "tradingview.com/cme")

def audit(page, route):
    errs, fails = [], []
    page.on("console", lambda m: errs.append(m.text[:220]) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)[:220]))
    page.on("requestfailed", lambda r: fails.append(f"{r.method} {r.url[:110]} {r.failure}"))

    page.goto(BASE + route, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(7000)  # let client fetches + widget settle

    body = page.inner_text("body")[:400]
    return errs, fails, body

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    report = {}
    for r in ROUTES:
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page()
        try:
            errs, fails, body = audit(pg, r)
            errs = [e for e in errs if not any(k in e.lower() for k in IGNORE)]
            fails = [f for f in fails if not any(k in f.lower() for k in IGNORE)]
            skeleton = "skeleton" in pg.content()
            report[r] = {"errors": errs[:6], "failed": fails[:6],
                         "chars": len(body.strip()), "stuck_loading": skeleton}
            print(f"{r:<20} errs={len(errs):<3} netfail={len(fails):<3} text={len(body.strip()):<5} {'STUCK' if skeleton else ''}")
            for e in errs[:4]:
                print("      ERR:", e)
            for f in fails[:4]:
                print("      NET:", f)
        except Exception as ex:
            print(f"{r:<20} EXCEPTION {str(ex)[:150]}")
            report[r] = {"exception": str(ex)[:200]}
        ctx.close()

    # Chart-specific deep check
    print("\n=== CHART CHECK (/markets) ===")
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(BASE + "/markets", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(12000)
    iframes = pg.locator("iframe").count()
    container = pg.locator(".tradingview-widget-container").count()
    box = None
    if iframes:
        box = pg.locator("iframe").first.bounding_box()
    print("iframes:", iframes, "| containers:", container, "| first iframe box:", box)
    pg.screenshot(path="/home/user/shot_markets.png", full_page=False)
    ctx.close()
    b.close()

json.dump(report, open("/home/user/audit.json", "w"), indent=1)
