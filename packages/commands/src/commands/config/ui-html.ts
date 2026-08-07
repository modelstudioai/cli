// Self-contained single-page web UI for managing config profiles and viewing
// locally installed agent tooling (skills, MCP servers, coding agents). Served
// as a string by `config ui`; no build step, no client dependencies. All
// fetches carry the session token from the page URL. Visual language mirrors
// the bailian landing design system (Inter / Geist Mono, gradient accents,
// lift-on-hover cards).
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Config - Alibaba Cloud Model Studio CLI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --font: "Inter", "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --mono: "Geist Mono", "SF Mono", "Roboto Mono", monospace;
    --ink: #111111; --muted: #696969; --muted-2: #888888;
    --line: #dddee3; --line-soft: #ededf1; --surface: #ffffff;
    --surface-soft: #f8fafb; --chip: #eff3fa;
    --blue: #4b73ff; --violet: #653aff; --cyan: #49dad1;
    --grad-text: linear-gradient(106deg, #4a7dff 10%, #41ffd3 97%);
    --grad-dot: linear-gradient(135deg, #03ffd9 0%, #0054ff 90%);
    --ok: #1f883d; --ok-soft: #eaf6ee; --warn: #b25c00; --danger: #cf222e;
    --r-card: 18px; --r-btn: 10px; --r-pill: 999px;
    --shadow-card: 0 8px 30px rgba(17,17,17,.06);
    --shadow-lift: 0 16px 48px rgba(40,52,90,.12);
    --t-lift: .3s cubic-bezier(.2,.7,.2,1); --t-fast: .15s ease;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--font); font-size: 14px; line-height: 1.5;
    color: var(--ink); background: #fafafc; -webkit-font-smoothing: antialiased; }
  #app { display: flex; min-height: 100vh; }

  /* Sidebar */
  #sidebar { width: 236px; flex: none; background: var(--surface); border-right: 1px solid var(--line-soft);
    padding: 22px 16px; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
    transition: width .28s cubic-bezier(.2,.7,.2,1), padding .28s cubic-bezier(.2,.7,.2,1); }
  .nav-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 4px; text-decoration: none; }
  .nav-logo { height: 24px; width: auto; display: block; }
  .nav-logo-mini { height: 26px; width: auto; display: none; }
  .nav-wordmark { font-weight: 400; font-size: 17px; line-height: 1; letter-spacing: -.3px; color: #1a1a19; white-space: nowrap; }
  .nav { display: flex; flex-direction: column; gap: 4px; margin-top: 18px; }
  .nav-group { display: flex; flex-direction: column; gap: 2px; }
  .nav-group + .nav-group { margin-top: 16px; }
  .nav-group-label { font-size: 11px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase;
    color: var(--muted-2); padding: 0 12px 4px; white-space: nowrap; overflow: hidden; }
  .nav-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    padding: 9px 12px; border: 0; background: none; border-radius: var(--r-btn); cursor: pointer;
    font: inherit; font-weight: 500; color: var(--muted); transition: background var(--t-fast), color var(--t-fast); }
  .nav-item:hover { background: rgba(0,0,0,.04); color: var(--ink); }
  .nav-item.is-active { background: var(--chip); color: var(--ink); }
  .nav-ic { flex: none; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; }
  .nav-ic svg { width: 20px; height: 20px; display: block; }
  .nav-text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nav-item .badge { flex: none; margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--muted-2);
    background: var(--surface-soft); border: 1px solid var(--line-soft); border-radius: var(--r-pill); padding: 1px 7px; min-width: 20px; text-align: center; }
  .nav-item.is-active .badge { color: var(--blue); border-color: transparent; background: #fff; }
  /* Collapse toggle pinned to the vertical center of the right edge */
  .sidebar-toggle { position: absolute; top: 50%; right: -12px; z-index: 5; transform: translateY(-50%);
    width: 22px; height: 46px; display: inline-flex; align-items: center; justify-content: center; padding: 0; cursor: pointer;
    border: 1px solid var(--line-soft); border-radius: 999px; background: var(--surface); color: var(--muted-2);
    box-shadow: 0 2px 8px rgba(20,30,60,.10);
    transition: color var(--t-fast), border-color var(--t-fast), background var(--t-fast), box-shadow var(--t-fast); }
  .sidebar-toggle:hover { color: var(--blue); border-color: var(--blue); background: #fff; box-shadow: 0 4px 14px rgba(28,84,228,.18); }
  .sidebar-toggle .chev { width: 16px; height: 16px; transition: transform .28s cubic-bezier(.2,.7,.2,1); }
  /* Collapsed: icon-only rail */
  #sidebar.is-collapsed { width: 66px; padding: 22px 12px; }
  #sidebar.is-collapsed .nav-brand { justify-content: center; padding: 0 0 4px; }
  #sidebar.is-collapsed .nav-logo-full { display: none; }
  #sidebar.is-collapsed .nav-logo-mini { display: block; }
  #sidebar.is-collapsed .nav-wordmark { display: none; }
  #sidebar.is-collapsed .nav-text { display: none; }
  #sidebar.is-collapsed .nav-item { justify-content: center; padding: 9px 0; gap: 0; }
  #sidebar.is-collapsed .nav-item .badge { display: none; }
  #sidebar.is-collapsed .nav-group + .nav-group { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft); }
  #sidebar.is-collapsed .nav-group-label { height: 0; padding: 0; margin: 0; font-size: 0; }
  #sidebar.is-collapsed .sidebar-toggle .chev { transform: rotate(180deg); }
  .side-foot { margin-top: auto; padding-top: 14px; }
  .acct-session { margin-bottom: 12px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
  .qr { display: block; width: 100%; max-width: 148px; margin: 0 auto 10px; border: 1px solid var(--line-soft);
    border-radius: 10px; background: #fff; padding: 8px; }
  .url-row { display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 10px;
    border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
  .url-link { flex: 1; min-width: 0; font-family: var(--mono); font-size: 10.5px; color: var(--blue);
    text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .url-link:hover { text-decoration: underline; }
  .copy-btn { flex: none; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: var(--r-pill);
    border: 1px solid var(--line); background: #fff; color: var(--ink); cursor: pointer;
    transition: border-color var(--t-fast), color var(--t-fast), background var(--t-fast); }
  .copy-btn:hover { border-color: var(--blue); color: var(--blue); background: #fff; }
  .copy-btn.copied { border-color: var(--ok); color: var(--ok); background: var(--ok-soft); }

  /* Account (top-right) */
  .account { position: fixed; top: 18px; right: 22px; z-index: 40; }
  .acct-login { display: inline-flex; align-items: center; justify-content: center; gap: 7px; font: inherit; font-size: 14px; font-weight: 700;
    padding: 9px 22px; border-radius: var(--r-pill); border: none; background: var(--ink); color: #fff;
    cursor: pointer; box-shadow: var(--shadow-lift); transition: transform var(--t-fast), box-shadow var(--t-fast), background var(--t-fast); }
  .acct-login:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(0,0,0,.24); }
  .acct-login[disabled] { opacity: .65; cursor: default; transform: none; box-shadow: var(--shadow-lift); }
  .avatar { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #fff; cursor: pointer; padding: 0; overflow: hidden;
    display: inline-flex; align-items: center; justify-content: center; color: #fff; box-shadow: var(--shadow-lift); }
  .avatar svg { width: 20px; height: 20px; }
  .avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
  .acct-login[hidden], .avatar[hidden] { display: none; }
  .acct-menu { position: absolute; top: 50px; right: 0; width: 270px; background: #fff; border: 1px solid var(--line);
    border-radius: 14px; box-shadow: var(--shadow-lift); padding: 14px; }
  .acct-menu-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .avatar-lg { width: 44px; height: 44px; flex: none; border-width: 0; }
  .avatar-lg svg { width: 22px; height: 22px; }
  .acct-id { min-width: 0; }
  .acct-method { font-size: 14px; font-weight: 600; color: var(--ink); }
  .acct-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .acct-token { font-family: var(--mono); font-size: 11.5px; color: var(--muted-2); background: var(--surface-soft);
    border: 1px solid var(--line-soft); border-radius: 8px; padding: 7px 10px; word-break: break-all; margin-bottom: 12px; }
  .acct-logout { width: 100%; font: inherit; font-size: 13px; font-weight: 600; padding: 8px; border-radius: var(--r-btn);
    border: 1px solid var(--line); background: var(--surface-soft); color: var(--ink); cursor: pointer;
    transition: border-color var(--t-fast), color var(--t-fast); }
  .acct-logout:hover { border-color: #e5484d; color: #e5484d; }

  /* Toolbar (search) + pagination */
  .toolbar { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; }
  .search { flex: 1; max-width: 340px; font: inherit; font-size: 13px; padding: 8px 14px; border-radius: var(--r-pill);
    border: 1px solid var(--line); background: #fff; color: var(--ink); transition: border-color var(--t-fast); }
  .search:focus { outline: none; border-color: var(--blue); }
  .search::placeholder { color: var(--muted-2); }
  .pager { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
  .pager .pg { min-width: 32px; height: 32px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center;
    font: inherit; font-size: 13px; font-weight: 500; border-radius: var(--r-btn); border: 1px solid var(--line);
    background: #fff; color: var(--ink); cursor: pointer; font-variant-numeric: tabular-nums;
    transition: border-color var(--t-fast), color var(--t-fast), background var(--t-fast); }
  .pager .pg:hover:not(:disabled):not(.is-active) { border-color: var(--blue); color: var(--blue); }
  .pager .pg.is-active { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 700; }
  .pager .pg:disabled { opacity: .4; cursor: not-allowed; }
  .pager .pg-nav { font-size: 15px; line-height: 1; }
  .pager .pg-jump { border-color: transparent; background: transparent; color: var(--muted-2); letter-spacing: 1px; }
  .pager .pg-jump:hover { color: var(--blue); }
  .pager .pg-size { height: 32px; margin-left: 4px; font: inherit; font-size: 13px; border-radius: var(--r-btn);
    border: 1px solid var(--line); background: #fff; color: var(--ink); padding: 0 8px; cursor: pointer; }
  .pager .pg-size:hover { border-color: var(--blue); }

  /* Main */
  main { flex: 1; min-width: 0; padding: 34px 40px 60px; max-width: 1600px; }
  .view { display: none; animation: rise .34s cubic-bezier(.2,.7,.2,1); }
  .view.is-active { display: block; }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .view-head { position: sticky; top: 0; z-index: 20; margin: 0 0 22px; padding: 6px 0 14px;
    background: #fafafc; border-bottom: 1px solid var(--line-soft); }
  .view-title { margin: 0; font-weight: 600; font-size: 26px; letter-spacing: -.8px; }
  .view-title .grad { background: none; -webkit-background-clip: border-box; background-clip: border-box; -webkit-text-fill-color: currentColor; color: inherit; }
  .view-sub { margin: 8px 0 0; font-size: 14px; color: var(--muted); max-width: 620px; }

  /* Buttons */
  .btn-soft, .btn-primary, .btn-danger, .btn-danger-solid { padding: 8px 14px; border-radius: var(--r-btn); font: inherit;
    font-weight: 500; cursor: pointer; border: 1px solid var(--line); background: var(--surface); transition: background var(--t-fast), box-shadow var(--t-fast), transform var(--t-fast); }
  .btn-soft:hover { background: var(--surface-soft); }
  .btn-primary { background: var(--ink); color: #fff; border-color: var(--ink); }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.18); }
  .btn-danger { color: var(--danger); border-color: transparent; background: transparent; padding: 8px 10px; }
  .btn-danger:hover { background: #fdeef0; }
  .btn-danger-solid { color: #fff; background: var(--danger); border-color: var(--danger); font-weight: 600; }
  .btn-danger-solid:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(220,50,60,.28); }
  button:disabled { opacity: .5; cursor: default; box-shadow: none; transform: none; }

  /* Profiles */
  .profile-tile.selected { border-color: #dfe6f5; background: var(--chip); }
  .profile-tile .tile-name { flex: 1; }
  .profile-tile .star { color: var(--blue); font-size: 12px; }
  .profile-tile .chev { color: var(--muted-2); font-size: 15px; }
  .tile-add { align-items: center; justify-content: center; border-style: dashed; color: var(--muted);
    font-weight: 600; cursor: pointer; text-align: center; }
  .tile-add:hover { border-color: var(--blue); color: var(--blue); transform: translateY(-4px);
    box-shadow: var(--shadow-lift); }
  .card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r-card);
    box-shadow: var(--shadow-card); padding: 22px 24px; }
  .editor-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .editor-head h3 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.3px; }
  .row { display: flex; flex-direction: column; margin: 14px 0; }
    .model-cat { margin-top: 8px; }
    .model-cat-hint { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
    .model-cat-note { font-size: 11px; color: var(--muted-2); margin-top: 7px; line-height: 1.5; }
    .model-cat-note code { font-family: var(--mono); font-size: 10.5px; background: var(--chip);
      border: 1px solid var(--line-soft); border-radius: 5px; padding: 1px 5px; color: #33383f; }
    .model-chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .mchip { font-family: var(--mono); font-size: 11.5px; color: #33383f; background: var(--surface-soft);
      border: 1px solid var(--line); border-radius: var(--r-pill); padding: 4px 11px; cursor: pointer;
      transition: background .12s, border-color .12s, color .12s; white-space: nowrap; }
    .mchip:hover { border-color: var(--blue); color: var(--blue); }
    .mchip.active { background: var(--blue); border-color: var(--blue); color: #fff; }
  .row label { font-weight: 500; margin-bottom: 5px; font-size: 13px; color: #33383f; font-family: var(--mono); }
  .inputwrap { display: flex; gap: 6px; }
  input { flex: 1; width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--r-btn);
    font: inherit; background: var(--surface-soft); transition: border-color var(--t-fast), background var(--t-fast); }
  input:focus { outline: none; border-color: var(--blue); background: #fff; }
  select.select { width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--r-btn);
    font: inherit; background: var(--surface-soft); cursor: pointer; }
  select.select:focus { outline: none; border-color: var(--blue); background: #fff; }
  .toggle { flex: none; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--r-btn);
    background: var(--surface); cursor: pointer; font: inherit; font-size: 12px; color: var(--muted); }
  .toggle:hover { background: var(--surface-soft); }
  .actions { margin-top: 22px; display: flex; align-items: center; gap: 12px; }
  .muted { color: var(--muted); font-size: 12px; word-break: break-all; }
  .err { color: var(--danger); font-size: 12px; }

  /* Card grids (skills / mcp / agents) */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 14px; }
  .tile { position: relative; display: flex; flex-direction: column; background: var(--surface);
    border: 1px solid var(--line-soft); border-radius: var(--r-card); padding: 15px 17px; min-height: 96px;
    transition: transform var(--t-lift), box-shadow var(--t-lift), border-color var(--t-lift); }
  .tile:hover { transform: translateY(-4px); box-shadow: var(--shadow-lift); border-color: transparent; }
  .tile-top { display: flex; align-items: center; gap: 10px; }
  .tile-name { font-weight: 600; font-size: 15px; letter-spacing: -.3px; min-width: 0; flex: 0 1 auto;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile-meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .tile-desc { margin: 9px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--muted);
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tile-foot { margin-top: auto; padding-top: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-family: var(--mono); font-size: 11px; color: var(--muted-2); }
  .tile-path { font-family: var(--mono); font-size: 11px; color: var(--muted-2); word-break: break-all;
    margin-top: 9px; line-height: 1.5; }
  .tile-actions { margin-top: auto; padding-top: 14px; display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  .btn-launch { flex: none; min-width: 140px; text-align: center; white-space: nowrap; padding: 7px 14px; font-size: 12.5px; font-weight: 600; border-radius: var(--r-btn);
    border: 1px solid var(--line); background: var(--surface-soft); cursor: pointer; color: var(--ink);
    transition: border-color var(--t-fast), color var(--t-fast), background var(--t-fast); }
  .btn-launch:hover { border-color: var(--blue); color: var(--blue); background: #fff; }
  .btn-launch:disabled { opacity: .5; cursor: not-allowed; }
  .btn-launch:disabled:hover { border-color: var(--line); color: var(--ink); background: var(--surface-soft); }
  /* Round icon-only run/launch button (bottom-right of a tile) */
  .icon-run { flex: none; width: 38px; height: 38px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%; border: 1px solid var(--line); background: var(--surface-soft); color: var(--ink); cursor: pointer;
    transition: border-color var(--t-fast), color var(--t-fast), background var(--t-fast), box-shadow var(--t-fast), transform var(--t-fast); }
  .icon-run svg { width: 15px; height: 15px; margin-left: 1px; display: block; }
  .icon-run:hover { border-color: var(--blue); color: var(--blue); background: #fff; box-shadow: 0 3px 10px rgba(28,84,228,.16); transform: translateY(-1px); }
  .icon-run:active { transform: none; }
  .icon-run:disabled { opacity: .45; cursor: not-allowed; }
  .icon-run:disabled:hover { border-color: var(--line); color: var(--ink); background: var(--surface-soft); box-shadow: none; transform: none; }
  .launch-status { font-size: 11.5px; color: var(--muted); }
  .launch-status.ok { color: #16a34a; }
  .launch-status.err { color: var(--danger); }
  .scn-desc { margin: 10px 0 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
  #playgroundBody .tile-actions { margin-top: auto; padding-top: 14px; }
  /* Quick Start stepper */
  .qs-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; }
  .qs-step { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 20px; border: 1px solid var(--line-soft);
    border-radius: var(--r-card); background: var(--surface); transition: border-color var(--t-fast), background var(--t-fast); }
  .qs-step.done { border-color: #bbf7d0; background: #f6fef9; }
  .qs-step.locked { opacity: .6; }
  .qs-head { display: flex; align-items: center; gap: 10px; }
  .qs-ic { flex: none; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center;
    justify-content: center; font-size: 13px; font-weight: 700; border: 2px solid var(--line); color: var(--muted-2);
    background: #fff; }
  .qs-step.done .qs-ic { border-color: #16a34a; background: #16a34a; color: #fff; }
  .qs-title { font-size: 15px; font-weight: 600; color: var(--ink); }
  .qs-done-tag { font-size: 11px; font-weight: 600; color: #16a34a; background: var(--ok-soft, #ecfdf5);
    border: 1px solid #bbf7d0; border-radius: var(--r-pill); padding: 1px 9px; }
  .qs-desc { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.55; word-break: break-word;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .qs-desc code { font-family: var(--mono); font-size: 12px; background: var(--chip); padding: 1px 6px; border-radius: 5px; color: #242933; }
  .qs-act { margin: 0; margin-top: auto; padding-top: 4px; }
  .pg-warn { margin-bottom: 14px; padding: 10px 14px; border-radius: 10px; font-size: 13px;
    color: #92400e; background: #fffbeb; border: 1px solid #fde68a; }
  .dispatch-preview { white-space: pre-wrap; word-break: break-word; font-family: var(--mono); font-size: 12px;
    line-height: 1.55; background: var(--surface-soft); border: 1px solid var(--line-soft); border-radius: 8px;
    padding: 10px 12px; max-height: 168px; overflow: auto; margin: 4px 0 0; color: var(--ink); }
  .chip { display: inline-block; font-family: var(--mono); font-size: 11px; color: #242933;
    background: var(--chip); border-radius: 6px; padding: 3px 8px; }
  .chip.blue { color: var(--blue); }
  .pill { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; border-radius: var(--r-pill); padding: 3px 10px; white-space: nowrap; }
  .pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .pill.ok { color: var(--ok); background: var(--ok-soft); }
  .pill.neutral { color: var(--blue); background: var(--chip); }
  .pill.off { color: var(--muted-2); background: var(--surface-soft); }
  .ver { margin-left: auto; flex: none; font-family: var(--mono); font-size: 11px; color: var(--violet);
    background: #f1edff; border-radius: var(--r-pill); padding: 2px 9px; }
  .origin { flex: none; font-family: var(--mono); font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .4px; padding: 2px 8px; border-radius: var(--r-pill); }
  .origin.local { color: var(--muted); background: var(--surface-soft); border: 1px solid var(--line-soft); }
  .origin.remote { color: #fff; background: var(--blue); border: 1px solid transparent; }
  .empty { padding: 44px 24px; text-align: center; color: var(--muted); border: 1px dashed var(--line);
    border-radius: var(--r-card); background: var(--surface-soft); }
  .empty code { font-family: var(--mono); background: var(--chip); padding: 2px 7px; border-radius: 6px; color: #242933; }
  .loading { color: var(--muted); font-size: 13px; padding: 8px 2px; }

  /* Drawer (profile editor) */
  .drawer-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(17,17,17,.28);
    display: flex; justify-content: flex-end; animation: fade .2s ease; }
  .drawer-overlay[hidden] { display: none; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  .drawer-panel { width: min(560px, 94vw); height: 100%; background: var(--surface); display: flex;
    flex-direction: column; box-shadow: -20px 0 60px rgba(20,30,60,.18); animation: slidein .28s cubic-bezier(.2,.7,.2,1); }
  @keyframes slidein { from { transform: translateX(36px); opacity: .5; } to { transform: none; opacity: 1; } }
  .drawer-head { flex: none; display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px; border-bottom: 1px solid var(--line-soft); }
  .drawer-head h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.3px; }
  .drawer-head-actions { display: flex; align-items: center; gap: 8px; }
  .drawer-close { border: 0; background: none; font-size: 24px; line-height: 1; cursor: pointer;
    color: var(--muted); padding: 0 4px; border-radius: var(--r-btn); }
  .drawer-close:hover { color: var(--ink); background: var(--surface-soft); }
  .drawer-body { flex: 1; overflow-y: auto; padding: 4px 24px 16px; }
  .drawer-foot { flex: none; margin-top: 0; padding: 16px 24px; border-top: 1px solid var(--line-soft);
    background: var(--surface); }
  .drawer-foot[hidden] { display: none; }
  .drawer-foot-end { display: flex; justify-content: flex-end; align-items: center; gap: 10px; }
  .tile.clickable { cursor: pointer; }
  /* Detail drawer sections */
  .detail-sec { margin: 16px 0 0; }
  .detail-label { font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .5px;
    color: var(--muted-2); margin-bottom: 7px; }
  .detail-desc { font-size: 14px; line-height: 1.7; color: var(--ink); }
  .detail-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .detail-path { font-family: var(--mono); font-size: 12px; color: var(--muted); word-break: break-all; line-height: 1.6; }
  .detail-kv { display: flex; flex-direction: column; }
  .kv-row { display: flex; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); align-items: baseline; }
  .kv-row:last-child { border-bottom: 0; }
  .kv-key { flex: none; width: 88px; font-family: var(--mono); font-size: 11px; text-transform: uppercase;
    letter-spacing: .5px; color: var(--muted-2); }
  .kv-val { flex: 1; font-family: var(--mono); font-size: 12.5px; color: var(--ink); word-break: break-all; line-height: 1.5; }
  .kv-val.secret { color: var(--muted); letter-spacing: 1px; }
  .kv-reveal { flex: none; align-self: center; border: 1px solid var(--line); background: var(--surface);
    color: var(--muted); font: inherit; font-size: 11px; padding: 3px 9px; border-radius: var(--r-btn);
    cursor: pointer; white-space: nowrap; }
  .kv-reveal:hover { color: var(--ink); background: var(--surface-soft); }
  .settings-item { margin-bottom: 12px; }
  .settings-item:last-child { margin-bottom: 0; }
  .settings-item .detail-path { margin-bottom: 6px; }
  .settings-item .detail-code { max-height: 340px; overflow: auto; white-space: pre; }
  .detail-label-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .detail-code { font-family: var(--mono); font-size: 12px; line-height: 1.6; background: var(--surface-soft);
    border: 1px solid var(--line-soft); border-radius: var(--r-btn); padding: 14px 16px; white-space: pre-wrap;
    word-break: break-word; color: #242933; margin: 0; }
  textarea.code-edit { display: block; width: 100%; min-height: 220px; resize: vertical; white-space: pre;
    overflow: auto; tab-size: 2; }
  textarea.code-edit:focus { outline: none; border-color: var(--blue); background: #fff; }
  .mcp-note { margin: 10px 0 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .file-picker { display: flex; align-items: center; gap: 12px; }
  .file-pick-btn { flex: none; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: var(--r-btn);
    border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; white-space: nowrap;
    transition: border-color var(--t-fast), color var(--t-fast), background var(--t-fast); }
  .file-pick-btn:hover { border-color: var(--blue); color: var(--blue); background: #fff; }
  .file-name { min-width: 0; font-size: 13px; color: var(--muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-name.has-file { color: var(--ink); font-weight: 500; }
  .detail-preview { width: 100%; margin-top: 4px; border-radius: var(--r-card); overflow: hidden;
    background: var(--surface-soft); border: 1px solid var(--line-soft); display: flex;
    align-items: center; justify-content: center; }
  .detail-preview img, .detail-preview video { max-width: 100%; max-height: 50vh; width: auto; height: auto;
    object-fit: contain; display: block; }
  .detail-preview audio { width: 100%; display: block; }
  .detail-preview .asset-icon-lg { font-size: 64px; padding: 44px 0; }
  /* Rendered Markdown (SKILL.md) */
  .md-body { font-size: 13.5px; line-height: 1.7; color: var(--ink); word-break: break-word; }
  .md-body > :first-child { margin-top: 0; }
  .md-body h1, .md-body h2, .md-body h3, .md-body h4, .md-body h5, .md-body h6 {
    font-weight: 600; line-height: 1.3; margin: 18px 0 8px; letter-spacing: -.2px; }
  .md-body h1 { font-size: 20px; } .md-body h2 { font-size: 17px; }
  .md-body h3 { font-size: 15px; } .md-body h4 { font-size: 14px; }
  .md-body p { margin: 10px 0; }
  .md-body ul, .md-body ol { margin: 10px 0; padding-left: 22px; }
  .md-body li { margin: 4px 0; }
  .md-body code { font-family: var(--mono); font-size: 12px; background: var(--chip); padding: 2px 6px;
    border-radius: 5px; color: #242933; }
  .md-body pre.md-pre { background: var(--surface-soft); border: 1px solid var(--line-soft);
    border-radius: var(--r-btn); padding: 14px 16px; overflow: auto; margin: 12px 0; }
  .md-body pre.md-pre code { background: none; padding: 0; font-size: 12px; line-height: 1.6;
    color: #242933; white-space: pre; }
  .md-body blockquote { margin: 12px 0; padding: 6px 14px; border-left: 3px solid var(--line);
    color: var(--muted); background: var(--surface-soft); border-radius: 0 8px 8px 0; }
  .md-body a { color: var(--blue); text-decoration: none; }
  .md-body a:hover { text-decoration: underline; }
  .md-body hr { border: 0; border-top: 1px solid var(--line-soft); margin: 18px 0; }
  .md-body table.md-table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12.5px; display: block; overflow-x: auto; }
  .md-body table.md-table th, .md-body table.md-table td { border: 1px solid var(--line-soft); padding: 6px 10px; text-align: left; vertical-align: top; }
  .md-body table.md-table th { background: var(--surface-soft); font-weight: 600; white-space: nowrap; }

  /* Modal (new profile) */
  .modal-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(17,17,17,.32);
    display: flex; align-items: center; justify-content: center; padding: 24px; animation: fade .18s ease; }
  .modal-overlay[hidden] { display: none; }
  .modal-card { width: min(420px, 100%); background: var(--surface); border-radius: var(--r-card);
    box-shadow: 0 24px 70px rgba(20,30,60,.28); padding: 26px 26px 20px;
    animation: pop .22s cubic-bezier(.2,.7,.2,1); }
  @keyframes pop { from { transform: translateY(10px) scale(.98); opacity: .5; } to { transform: none; opacity: 1; } }
  .modal-card h3 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -.4px; }
  .modal-sub { margin: 8px 0 18px; font-size: 13px; color: var(--muted); line-height: 1.5; }
  .modal-label { display: block; font-family: var(--mono); font-size: 11px; text-transform: uppercase;
    letter-spacing: .5px; color: var(--muted-2); margin-top: 18px; margin-bottom: 9px; }
  .modal-err { min-height: 16px; margin-top: 8px; font-size: 12px; color: var(--danger); }
  .btn-dark { margin-left: auto; border: 0; background: var(--ink); color: #fff; font-weight: 600;
    font-size: 13px; padding: 9px 18px; border-radius: var(--r-pill); cursor: pointer; white-space: nowrap; }
  .btn-dark:hover { opacity: .88; }
  .btn-xs { padding: 5px 10px; font-size: 12px; }
  .btn-mini { border: 1px solid var(--line); background: var(--surface); color: var(--muted);
    font: inherit; font-size: 12px; padding: 6px 10px; border-radius: var(--r-btn); cursor: pointer; }
  .btn-mini:hover { color: var(--ink); background: var(--surface-soft); }
  .scn-textarea { width: 100%; min-height: 120px; resize: vertical; font: inherit; font-size: 13px;
    line-height: 1.5; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--r-btn);
    background: var(--surface); color: var(--ink); }
  .scn-textarea:focus { outline: none; border-color: var(--blue); background: #fff; }
  .scn-inputs-head { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 8px; }
  .scn-input-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .scn-input-row .scn-k { max-width: 130px; }
  .scn-hint { margin: 10px 0 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .modal-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }

  /* Assets */
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .filter { padding: 6px 14px; border: 1px solid var(--line); border-radius: var(--r-pill); background: var(--surface);
    font: inherit; font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; transition: all var(--t-fast); }
  .filter:hover { background: var(--surface-soft); color: var(--ink); }
  .filter.is-active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .filter .n { margin-left: 6px; font-family: var(--mono); font-size: 11px; opacity: .7; }
  .filter.sort-toggle { margin-left: auto; font-family: var(--mono); font-size: 12px; }
  .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .asset { position: relative; display: flex; flex-direction: column; cursor: pointer; background: var(--surface);
    border: 1px solid var(--line-soft); border-radius: var(--r-card); overflow: hidden;
    transition: transform var(--t-lift), box-shadow var(--t-lift), border-color var(--t-lift); }
  .asset:hover { transform: translateY(-5px); box-shadow: var(--shadow-lift); border-color: transparent; }
  .asset-media { aspect-ratio: 4 / 3; background: var(--surface-soft); display: flex; align-items: center;
    justify-content: center; overflow: hidden; border-bottom: 1px solid var(--line-soft); }
  .asset-media img, .asset-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .asset-media audio { width: 90%; }
  .asset-icon { font-size: 34px; color: var(--muted-2); }
  .asset-cat { position: absolute; top: 10px; left: 10px; font-family: var(--mono); font-size: 10px;
    font-weight: 600; text-transform: uppercase; letter-spacing: .4px; color: #fff; background: rgba(17,17,17,.66);
    border-radius: var(--r-pill); padding: 3px 9px; backdrop-filter: blur(4px); }
  .asset-del { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border: 0; border-radius: 50%;
    background: rgba(17,17,17,.6); color: #fff; cursor: pointer; font-size: 15px; line-height: 1; opacity: 0;
    transition: opacity var(--t-fast), background var(--t-fast); }
  .asset:hover .asset-del { opacity: 1; }
  .asset-del:hover { background: var(--danger); }
  .asset-body { padding: 12px 14px; }
  .asset-name { font-size: 13px; font-weight: 500; word-break: break-all; line-height: 1.4; }
  .asset-name.link { cursor: pointer; }
  .asset-name.link:hover { color: var(--blue); text-decoration: underline; }
  .asset-folder { margin-top: 5px; display: inline-block; max-width: 100%; font-family: var(--mono);
    font-size: 10.5px; color: var(--muted-2); background: var(--surface-soft); border-radius: 6px;
    padding: 2px 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .asset-meta { margin-top: 7px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-family: var(--mono); font-size: 11px; color: var(--muted-2); }

  /* Narrow screens: sidebar becomes a top bar, content stacks and shrinks */
  @media (max-width: 800px) {
    #app { flex-direction: column; }
    #sidebar, #sidebar.is-collapsed { width: 100%; height: auto; position: static; flex-direction: row; align-items: center;
      gap: 10px; padding: 10px 110px 10px 14px; border-right: 0; border-bottom: 1px solid var(--line-soft);
      overflow-x: auto; }
    .nav { flex-direction: row; margin-top: 0; gap: 2px; }
    .nav-group, #sidebar.is-collapsed .nav-group { flex-direction: row; gap: 2px; }
    .nav-group + .nav-group, #sidebar.is-collapsed .nav-group + .nav-group { margin-top: 0; margin-left: 4px; padding-top: 0; border-top: 0; }
    .nav-group-label { display: none; }
    .nav-item, #sidebar.is-collapsed .nav-item { flex: none; width: auto; white-space: nowrap; padding: 7px 10px; justify-content: flex-start; gap: 8px; }
    .nav-text { flex: none; }
    #sidebar.is-collapsed .nav-text { display: inline; }
    #sidebar.is-collapsed .nav-logo-full { display: block; }
    #sidebar.is-collapsed .nav-logo-mini { display: none; }
    .nav-item .badge { display: none; }
    .sidebar-toggle { display: none; }
    .side-foot { display: none; }
    main { padding: 18px 16px 48px; max-width: none; }
    .view-head { position: static; }
    .view-title { font-size: 22px; }
    .account { position: absolute; top: 11px; right: 12px; }
    .acct-login { padding: 7px 16px; font-size: 13px; }
    .avatar { width: 34px; height: 34px; }
    .filter.sort-toggle { margin-left: 0; }
  }
</style>
</head>
<body>
<div id="app">
  <div id="account" class="account" hidden>
    <button id="loginBtn" class="acct-login" type="button" hidden><span>Log in</span></button>
    <button id="avatarBtn" class="avatar" type="button" hidden aria-haspopup="true" aria-expanded="false"></button>
    <div id="acctMenu" class="acct-menu" hidden>
      <div class="acct-menu-head">
        <span id="acctAvatarLg" class="avatar avatar-lg"></span>
        <div class="acct-id">
          <div id="acctMethod" class="acct-method"></div>
          <div id="acctMeta" class="acct-meta"></div>
        </div>
      </div>
      <div id="acctToken" class="acct-token"></div>
      <div class="acct-session">
        <img id="qrImg" class="qr" alt="QR code for this session URL">
        <div class="url-row">
          <a id="urlLink" class="url-link" target="_blank" rel="noopener" title=""></a>
          <button id="copyUrl" class="copy-btn" type="button" title="Copy this URL">Copy</button>
        </div>
      </div>
      <button id="logoutBtn" class="acct-logout" type="button">Log out</button>
    </div>
  </div>
  <aside id="sidebar">
    <a class="nav-brand" href="#" aria-label="Model Studio CLI home">
      <img class="nav-logo nav-logo-full" src="https://img.alicdn.com/imgextra/i1/O1CN01IU2US71Ciicsi3Br3_!!6000000000115-55-tps-357-76.svg" alt="Alibaba Cloud Model Studio">
      <img class="nav-logo-mini" src="data:image/svg+xml,%3csvg%20width='19'%20height='20'%20viewBox='0%200%2019%2020'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cg%20clip-path='url(%23clip0_0_83)'%3e%3cmask%20id='mask0_0_83'%20style='mask-type:luminance'%20maskUnits='userSpaceOnUse'%20x='0'%20y='0'%20width='19'%20height='20'%3e%3cpath%20d='M18.5633%2014.0364V5.96256C18.5633%205.27347%2018.1943%204.63904%2017.5956%204.29352L10.5649%200.258564C9.96621%20-0.0850029%209.22623%20-0.0850029%208.62757%200.258564L1.59681%204.29547C0.998157%204.63904%200.62915%205.27542%200.62915%205.96256V14.0364C0.62915%2014.7235%200.998157%2015.3599%201.59681%2015.7054L8.62757%2019.7423C9.22623%2020.0859%209.96621%2020.0859%2010.5649%2019.7423L17.5956%2015.7054C18.1943%2015.3618%2018.5633%2014.7255%2018.5633%2014.0364Z'%20fill='white'/%3e%3c/mask%3e%3cg%20mask='url(%23mask0_0_83)'%3e%3cpath%20d='M14.0801%202.27495L17.7505%204.38125C18.1117%204.58817%2018.1117%205.10742%2017.7505%205.31629L9.59706%209.99739L5.11401%207.42259L14.0801%202.27299V2.27495Z'%20fill='%23AB9BFF'/%3e%3c/g%3e%3cmask%20id='mask1_0_83'%20style='mask-type:luminance'%20maskUnits='userSpaceOnUse'%20x='0'%20y='0'%20width='19'%20height='20'%3e%3cpath%20d='M18.5633%2014.0364V5.96256C18.5633%205.27347%2018.1943%204.63904%2017.5956%204.29352L10.5649%200.258564C9.96621%20-0.0850029%209.22623%20-0.0850029%208.62757%200.258564L1.59681%204.29547C0.998157%204.63904%200.62915%205.27542%200.62915%205.96256V14.0364C0.62915%2014.7235%200.998157%2015.3599%201.59681%2015.7054L8.62757%2019.7423C9.22623%2020.0859%209.96621%2020.0859%2010.5649%2019.7423L17.5956%2015.7054C18.1943%2015.3618%2018.5633%2014.7255%2018.5633%2014.0364Z'%20fill='white'/%3e%3c/mask%3e%3cg%20mask='url(%23mask1_0_83)'%3e%3cpath%20d='M9.59523%209.99637L14.0802%2012.5712L5.11219%2017.7188L0.62915%2015.146L9.59523%209.99637Z'%20fill='%2300EBD2'/%3e%3c/g%3e%3cmask%20id='mask2_0_83'%20style='mask-type:luminance'%20maskUnits='userSpaceOnUse'%20x='0'%20y='0'%20width='19'%20height='20'%3e%3cpath%20d='M18.5633%2014.0364V5.96256C18.5633%205.27347%2018.1943%204.63904%2017.5956%204.29352L10.5649%200.258564C9.96621%20-0.0850029%209.22623%20-0.0850029%208.62757%200.258564L1.59681%204.29547C0.998157%204.63904%200.62915%205.27542%200.62915%205.96256V14.0364C0.62915%2014.7235%200.998157%2015.3599%201.59681%2015.7054L8.62757%2019.7423C9.22623%2020.0859%209.96621%2020.0859%2010.5649%2019.7423L17.5956%2015.7054C18.1943%2015.3618%2018.5633%2014.7255%2018.5633%2014.0364Z'%20fill='white'/%3e%3c/mask%3e%3cg%20mask='url(%23mask2_0_83)'%3e%3cpath%20d='M18.5651%2015.1461L14.0821%2012.5713L5.11401%2017.719L9.59706%2020.2938L18.5651%2015.1461Z'%20fill='%2300CFCA'/%3e%3c/g%3e%3cmask%20id='mask3_0_83'%20style='mask-type:luminance'%20maskUnits='userSpaceOnUse'%20x='0'%20y='0'%20width='19'%20height='20'%3e%3cpath%20d='M18.5633%2014.0364V5.96256C18.5633%205.27347%2018.1943%204.63904%2017.5956%204.29352L10.5649%200.258564C9.96621%20-0.0850029%209.22623%20-0.0850029%208.62757%200.258564L1.59681%204.29547C0.998157%204.63904%200.62915%205.27542%200.62915%205.96256V14.0364C0.62915%2014.7235%200.998157%2015.3599%201.59681%2015.7054L8.62757%2019.7423C9.22623%2020.0859%209.96621%2020.0859%2010.5649%2019.7423L17.5956%2015.7054C18.1943%2015.3618%2018.5633%2014.7255%2018.5633%2014.0364Z'%20fill='white'/%3e%3c/mask%3e%3cg%20mask='url(%23mask3_0_83)'%3e%3cpath%20d='M0.62915%204.85219L5.11219%207.42504L14.0802%202.27739L9.59523%20-0.297405'%20fill='%237347FF'/%3e%3c/g%3e%3cmask%20id='mask4_0_83'%20style='mask-type:luminance'%20maskUnits='userSpaceOnUse'%20x='0'%20y='0'%20width='19'%20height='20'%3e%3cpath%20d='M18.5633%2014.0364V5.96256C18.5633%205.27347%2018.1943%204.63904%2017.5956%204.29352L10.5649%200.258564C9.96621%20-0.0850029%209.22623%20-0.0850029%208.62757%200.258564L1.59681%204.29547C0.998157%204.63904%200.62915%205.27542%200.62915%205.96256V14.0364C0.62915%2014.7235%200.998157%2015.3599%201.59681%2015.7054L8.62757%2019.7423C9.22623%2020.0859%209.96621%2020.0859%2010.5649%2019.7423L17.5956%2015.7054C18.1943%2015.3618%2018.5633%2014.7255%2018.5633%2014.0364Z'%20fill='white'/%3e%3c/mask%3e%3cg%20mask='url(%23mask4_0_83)'%3e%3cpath%20d='M5.11401%207.42445V12.5741L9.59706%209.99925L5.11401%207.42445Z'%20fill='%231C54E4'/%3e%3c/g%3e%3cmask%20id='mask5_0_83'%20style='mask-type:luminance'%20maskUnits='userSpaceOnUse'%20x='0'%20y='0'%20width='19'%20height='20'%3e%3cpath%20d='M18.5633%2014.0364V5.96256C18.5633%205.27347%2018.1943%204.63904%2017.5956%204.29352L10.5649%200.258564C9.96621%20-0.0850029%209.22623%20-0.0850029%208.62757%200.258564L1.59681%204.29547C0.998157%204.63904%200.62915%205.27542%200.62915%205.96256V14.0364C0.62915%2014.7235%200.998157%2015.3599%201.59681%2015.7054L8.62757%2019.7423C9.22623%2020.0859%209.96621%2020.0859%2010.5649%2019.7423L17.5956%2015.7054C18.1943%2015.3618%2018.5633%2014.7255%2018.5633%2014.0364Z'%20fill='white'/%3e%3c/mask%3e%3cg%20mask='url(%23mask5_0_83)'%3e%3cpath%20d='M18.5516%2010.9186L18.5634%2015.1468L14.0803%2012.572L17.737%2010.454C18.0982%2010.2451%2018.5516%2010.5028%2018.5516%2010.9186Z'%20fill='%2300EBD2'/%3e%3c/g%3e%3cmask%20id='mask6_0_83'%20style='mask-type:luminance'%20maskUnits='userSpaceOnUse'%20x='0'%20y='0'%20width='19'%20height='20'%3e%3cpath%20d='M18.5633%2014.0364V5.96256C18.5633%205.27347%2018.1943%204.63904%2017.5956%204.29352L10.5649%200.258564C9.96621%20-0.0850029%209.22623%20-0.0850029%208.62757%200.258564L1.59681%204.29547C0.998157%204.63904%200.62915%205.27542%200.62915%205.96256V14.0364C0.62915%2014.7235%200.998157%2015.3599%201.59681%2015.7054L8.62757%2019.7423C9.22623%2020.0859%209.96621%2020.0859%2010.5649%2019.7423L17.5956%2015.7054C18.1943%2015.3618%2018.5633%2014.7255%2018.5633%2014.0364Z'%20fill='white'/%3e%3c/mask%3e%3cg%20mask='url(%23mask6_0_83)'%3e%3cpath%20d='M0.62915%204.84948L5.11219%207.42233V12.5719L0.62915%2015.1467V4.84948Z'%20fill='%230423DB'/%3e%3c/g%3e%3c/g%3e%3cdefs%3e%3cclipPath%20id='clip0_0_83'%3e%3crect%20width='19'%20height='20'%20fill='white'/%3e%3c/clipPath%3e%3c/defs%3e%3c/svg%3e" alt="Model Studio" aria-hidden="true">
      <span class="nav-wordmark">CLI</span>
    </a>
    <nav class="nav">
      <div class="nav-group">
        <span class="nav-group-label">Get Started</span>
        <button class="nav-item" data-view="start" title="Quick Start"><span class="nav-ic"><svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" d="M13 3 4 14h7l-1 7 9-11h-7z"/></svg></span><span class="nav-text">Quick Start</span></button>
        <button class="nav-item is-active" data-view="playground" title="Playground"><span class="nav-ic"><svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" d="M9 3h6M10 3v5.5L5.2 17A2 2 0 0 0 7 20h10a2 2 0 0 0 1.8-3L14 8.5V3"/></svg></span><span class="nav-text">Playground</span></button>
      </div>
      <div class="nav-group">
        <span class="nav-group-label">Extensions</span>
        <button class="nav-item" data-view="skills" title="Skills"><span class="nav-ic"><svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" d="M7 10h3V7L6.5 3.5a6 6 0 0 1 8 8l6 6a2.121 2.121 0 1 1-3 3l-6-6a6 6 0 0 1-8-8z"/></svg></span><span class="nav-text">Skills</span><span class="badge" id="cnt-skills"></span></button>
        <button class="nav-item" data-view="mcp" title="MCPs"><span class="nav-ic"><svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" d="m4 12 8 4 8-4M4 16l8 4 8-4M12 4 4 8l8 4 8-4z"/></svg></span><span class="nav-text">MCPs</span><span class="badge" id="cnt-mcp"></span></button>
        <button class="nav-item" data-view="agents" title="Agents"><span class="nav-ic"><svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M6 6h12v12H6zM9.5 9.5h5v5h-5z"/></svg></span><span class="nav-text">Agents</span><span class="badge" id="cnt-agents"></span></button>
      </div>
      <div class="nav-group">
        <span class="nav-group-label">Workspace</span>
        <button class="nav-item" data-view="assets" title="Assets"><span class="nav-ic"><svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 16l4.5-4.5 3 3 4-4L20 15M8.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/></svg></span><span class="nav-text">Assets</span><span class="badge" id="cnt-assets"></span></button>
        <button class="nav-item" data-view="profiles" title="Config"><span class="nav-ic"><svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" d="M10.3 4.3a1 1 0 0 1 1-.8h1.4a1 1 0 0 1 1 .8l.3 1.5q.8.3 1.5.9l1.5-.6a1 1 0 0 1 1.2.4l.7 1.2a1 1 0 0 1-.2 1.3l-1.2 1a6.5 6.5 0 0 1 0 1.8l1.2 1a1 1 0 0 1 .2 1.3l-.7 1.2a1 1 0 0 1-1.2.4l-1.5-.6q-.7.6-1.5.9l-.3 1.5a1 1 0 0 1-1 .8h-1.4a1 1 0 0 1-1-.8l-.3-1.5a6.5 6.5 0 0 1-1.5-.9l-1.5.6a1 1 0 0 1-1.2-.4l-.7-1.2a1 1 0 0 1 .2-1.3l1.2-1a6.5 6.5 0 0 1 0-1.8l-1.2-1a1 1 0 0 1-.2-1.3l.7-1.2a1 1 0 0 1 1.2-.4l1.5.6q.7-.6 1.5-.9z"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65" d="M10 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0"/></svg></span><span class="nav-text">Config</span><span class="badge" id="cnt-profiles"></span></button>
      </div>
    </nav>
    <button id="sidebarToggle" class="sidebar-toggle" type="button" aria-label="Collapse sidebar" title="Collapse sidebar"><svg class="chev" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 8-4 4 4 4"/></svg></button>
  </aside>
  <main>
    <section id="view-start" class="view">
      <div class="view-head">
        <h2 class="view-title"><span class="grad">Quick Start</span></h2>
        <p class="view-sub">Complete a few steps to check your local environment and finish first-time setup: sign in to Bailian, connect a local coding agent, and run your first task. Each circle turns from gray to green as you go.</p>
      </div>
      <div id="qsBody"><div class="loading">Loading…</div></div>
    </section>
    <section id="view-playground" class="view is-active">
      <div class="view-head">
        <h2 class="view-title"><span class="grad">Playground</span></h2>
        <p class="view-sub">Pick a scenario to dispatch a preset task to a connected local coding agent, running in a new terminal. Tasks run in the directory where <code style="font-family:var(--mono)">bl config ui</code> was started.</p>
      </div>
      <div class="toolbar"><input id="scenarioSearch" class="search" type="search" placeholder="Search scenarios…" autocomplete="off"><button id="customScnBtn" class="btn-dark" type="button">+ Custom scenario</button></div>
      <div id="scenarioFilters" class="filters"></div>
      <div id="playgroundBody"><div class="loading">Loading…</div></div>
      <div id="playgroundPager" class="pager"></div>
    </section>

    <section id="view-profiles" class="view">
      <div class="view-head">
        <h2 class="view-title"><span class="grad">Config</span></h2>
        <p class="view-sub">Credentials and default models. The active profile (marked with a star) is used by every bl command. Click a profile to edit its settings.</p>
      </div>
      <div id="profileList" class="grid"></div>
    </section>

    <section id="view-skills" class="view">
      <div class="view-head">
        <h2 class="view-title">Installed <span class="grad">Skills</span></h2>
        <p class="view-sub">Agent skills discovered across every local agent module (~/.agents/skills plus each agent's skills folder). Installed via <code style="font-family:var(--mono)">bl skill add</code>.</p>
      </div>
      <div class="toolbar"><input id="skillSearch" class="search" type="search" placeholder="Search skills…" autocomplete="off"><button id="addSkillBtn" class="btn-dark" type="button">+ Add skill</button></div>
      <div id="skillsBody"><div class="loading">Loading…</div></div>
      <div id="skillsPager" class="pager"></div>
    </section>

    <section id="view-mcp" class="view">
      <div class="view-head">
        <h2 class="view-title"><span class="grad">MCPs</span></h2>
        <p class="view-sub">Model Context Protocol servers declared in your local coding-agent configs.</p>
      </div>
      <div class="toolbar"><input id="mcpSearch" class="search" type="search" placeholder="Search MCP servers…" autocomplete="off"><button id="addMcpBtn" class="btn-dark" type="button">+ Add MCP</button></div>
      <div id="mcpBody"><div class="loading">Loading…</div></div>
      <div id="mcpPager" class="pager"></div>
    </section>

    <section id="view-agents" class="view">
      <div class="view-head">
        <h2 class="view-title">Coding <span class="grad">Agents</span></h2>
        <p class="view-sub">Frameworks bl can configure. "Connected" means the bailian-cli provider is wired into that agent.</p>
      </div>
      <div class="toolbar"><input id="agentSearch" class="search" type="search" placeholder="Search agents…" autocomplete="off"></div>
      <div id="agentFilters" class="filters"></div>
      <div id="agentsBody"><div class="loading">Loading…</div></div>
      <div id="agentsPager" class="pager"></div>
    </section>

    <section id="view-assets" class="view">
      <div class="view-head">
        <h2 class="view-title">Generated <span class="grad">Assets</span></h2>
        <p class="view-sub">Media that bl writes into the output directory, grouped by type (images, videos, audio, files) and generation time. <span id="assetsBase" class="muted"></span></p>
      </div>
      <div class="toolbar"><input id="assetSearch" class="search" type="search" placeholder="Search assets…" autocomplete="off"></div>
      <div id="assetFilters" class="filters"></div>
      <div id="assetsBody"><div class="loading">Loading…</div></div>
      <div id="assetsPager" class="pager"></div>
    </section>
  </main>
  <div id="drawer" class="drawer-overlay" hidden>
    <aside class="drawer-panel" role="dialog" aria-modal="true">
      <div class="drawer-head">
        <h3 id="currentName"></h3>
        <div class="drawer-head-actions">
          <button id="deleteBtn" class="btn-danger">Delete</button>
          <button id="closeBtn" class="drawer-close" aria-label="Close">×</button>
        </div>
      </div>
      <div class="drawer-body">
        <form id="form" onsubmit="return false" autocomplete="off"></form>
      </div>
      <div class="drawer-foot actions">
        <button id="saveBtn" class="btn-primary">Save</button>
        <button id="useBtn" class="btn-soft">Save &amp; Activate</button>
        <span id="status" class="muted"></span>
      </div>
    </aside>
  </div>
  <div id="infoDrawer" class="drawer-overlay" hidden>
    <aside class="drawer-panel" role="dialog" aria-modal="true">
      <div class="drawer-head">
        <h3 id="infoTitle"></h3>
        <div class="drawer-head-actions">
          <button id="infoClose" class="drawer-close" aria-label="Close">×</button>
        </div>
      </div>
      <div class="drawer-body" id="infoBody"></div>
      <div class="drawer-foot drawer-foot-end" id="infoFoot" hidden></div>
    </aside>
  </div>
  <div id="scnDrawer" class="drawer-overlay" hidden>
    <aside class="drawer-panel" role="dialog" aria-modal="true">
      <div class="drawer-head">
        <h3 id="scnDrawerTitle">Custom scenario</h3>
        <div class="drawer-head-actions">
          <button id="scnDelete" class="btn-danger" hidden>Delete</button>
          <button id="scnDrawerClose" class="drawer-close" aria-label="Close">×</button>
        </div>
      </div>
      <div class="drawer-body">
        <label class="modal-label" for="scnTitle">Title</label>
        <input id="scnTitle" type="text" autocomplete="off" placeholder="e.g. Translate docs to English">
        <label class="modal-label" for="scnCategory">Category</label>
        <input id="scnCategory" type="text" autocomplete="off" placeholder="e.g. Image / Custom" list="scnCatList">
        <datalist id="scnCatList"></datalist>
        <label class="modal-label" for="scnDesc">Description</label>
        <input id="scnDesc" type="text" autocomplete="off" placeholder="One-line description (optional)">
        <label class="modal-label" for="scnPrompt">Prompt template</label>
        <textarea id="scnPrompt" class="scn-textarea" placeholder="Use {{key}} placeholders for inputs"></textarea>
        <div class="scn-inputs-head">
          <span class="modal-label" style="margin:0">Inputs</span>
          <button id="scnAddInput" class="btn-soft btn-xs" type="button">+ Add input</button>
        </div>
        <div id="scnInputRows"></div>
        <p class="scn-hint">Inputs become fillable fields when dispatching. Reference each one in the prompt as {{key}}.</p>
        <div id="scnDrawerErr" class="modal-err"></div>
      </div>
      <div class="drawer-foot drawer-foot-end">
        <button id="scnDrawerSave" class="btn-primary">Save scenario</button>
      </div>
    </aside>
  </div>
  <div id="modal" class="modal-overlay" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h3 id="modalTitle">New profile</h3>
      <p class="modal-sub">Create a named profile with its own credentials and default models.</p>
      <label class="modal-label" for="modalInput">Profile name</label>
      <input id="modalInput" type="text" placeholder="e.g. work, intl, test" autocomplete="off" spellcheck="false">
      <div id="modalErr" class="modal-err"></div>
      <div class="modal-foot">
        <button id="modalCancel" class="btn-soft">Cancel</button>
        <button id="modalCreate" class="btn-primary">Create</button>
      </div>
    </div>
  </div>
  <div id="confirm" class="modal-overlay" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
      <h3 id="confirmTitle"></h3>
      <p class="modal-sub" id="confirmMsg"></p>
      <div class="modal-foot">
        <button id="confirmCancel" class="btn-soft">Cancel</button>
        <button id="confirmOk" class="btn-danger-solid">Delete</button>
      </div>
    </div>
  </div>
  <div id="dispatch" class="modal-overlay" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="dispatchTitle">
      <h3 id="dispatchTitle"></h3>
      <p class="modal-sub" id="dispatchDesc"></p>
      <label class="modal-label" for="dispatchAgent">Target agent</label>
      <select id="dispatchAgent" class="select"></select>
      <div id="dispatchInputs"></div>
      <label class="modal-label">Task to dispatch</label>
      <pre id="dispatchPreview" class="dispatch-preview"></pre>
      <div id="dispatchErr" class="modal-err"></div>
      <div class="modal-foot">
        <button id="dispatchCancel" class="btn-soft">Cancel</button>
        <button id="dispatchGo" class="btn-primary">Run it</button>
      </div>
    </div>
  </div>
</div>
<script>
  var token = new URLSearchParams(location.search).get('token') || '';
  var KEYS = [], SECRETS = [], ENUMS = {}, BOOLEANS = [], FIELD_DEFAULTS = {}, MODEL_CATALOG = {}, DATA = { default: {}, named: {} }, CURRENT = '', ACTIVE = 'default';
  var loaded = { skills: false, mcp: false, agents: false, assets: false, playground: false, start: false };
  var SCENARIOS = [], BUILTIN_SCENARIOS = [], DISPATCH_AGENTS = [], SCN_Q = '', SCN_FILTER = 'all', SCN_PAGE = 1, DISPATCH_SCN = null;
  var ASSETS = [], ASSET_FILTER = 'all', ASSET_SORT = 'new', ASSET_Q = '', ASSET_PAGE = 1;
  var AGENTS = [], AGENT_FILTER = 'all', AGENT_Q = '', AGENT_PAGE = 1;
  var SKILLS = [], SKILL_Q = '', SKILL_PAGE = 1;
  var MCPS = [], MCP_Q = '', MCP_PAGE = 1;
  var PAGE_SIZES = [10, 20, 50];
  var PAGE_SIZE_KEY = 'bl.pageSize.';
  function getPageSize(view) {
    try {
      var v = parseInt(localStorage.getItem(PAGE_SIZE_KEY + view), 10);
      if (PAGE_SIZES.indexOf(v) >= 0) return v;
    } catch (e) { /* ignore */ }
    return 20;
  }
  function setPageSize(view, n) { try { localStorage.setItem(PAGE_SIZE_KEY + view, String(n)); } catch (e) { /* ignore */ } }
  var AUTH = null, authPoll = null, HEALTH = null, AUTO_START_CHECKED = false, QS_LOGIN_BTN = null;
    var FIRST_RUN_KEY = 'bl.firstRunDone';
  var SIDEBAR_KEY = 'bl.sidebarCollapsed';
  var PERSON_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  // Signed-in avatar photo. The generated colour + person icon stay as the
  // background fallback while the image loads or if it fails.
  var AVATAR_URL = 'https://oss.aliyuncs.com/aliyun_id_photo_bucket/default_handsome.jpg';
  function setAvatar(elm, seed) {
    elm.style.background = avatarStyle(seed);
    elm.innerHTML = PERSON_SVG;
    var img = document.createElement('img');
    img.alt = '';
    img.onload = function () { elm.innerHTML = ''; elm.appendChild(img); };
    img.src = AVATAR_URL;
  }

  function api(path, opts) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetch(path + sep + 'token=' + encodeURIComponent(token), opts || {});
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function originBadge(origin) {
    var o = origin === 'remote' ? 'remote' : 'local';
    return el('span', 'origin ' + o, o === 'remote' ? 'Remote' : 'Local');
  }
  function setStatus(msg, isErr) {
    var s = document.getElementById('status');
    s.textContent = msg || '';
    s.className = isErr ? 'err' : 'muted';
  }
  function setCount(view, n) {
    var b = document.getElementById('cnt-' + view);
    if (b) b.textContent = n === undefined || n === null ? '' : String(n);
  }

  /* ---------- view switching ---------- */
  function showView(name) {
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-active', items[i].getAttribute('data-view') === name);
    }
    var views = document.querySelectorAll('.view');
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle('is-active', views[j].id === 'view-' + name);
    }
    if (name === 'skills' && !loaded.skills) loadSkills();
    if (name === 'mcp' && !loaded.mcp) loadMcp();
    if (name === 'agents' && !loaded.agents) loadAgents();
    if (name === 'assets' && !loaded.assets) loadAssets();
    if (name === 'playground' && !loaded.playground) loadPlayground();
    if (name === 'start') loadQuickStart();
  }

  /* ---------- quick start ---------- */
  function firstRunDone() { try { return localStorage.getItem(FIRST_RUN_KEY) === '1'; } catch (e) { return false; } }
  function markFirstRun() { try { localStorage.setItem(FIRST_RUN_KEY, '1'); } catch (e) {} }
  function loadQuickStart() {
    loaded.start = true;
    var body = document.getElementById('qsBody');
    Promise.all([
      api('/api/health').then(function (r) { return r.json(); }).catch(function () { return null; }),
      api('/api/auth/status').then(function (r) { return r.json(); }).catch(function () { return null; }),
      api('/api/agents').then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      HEALTH = res[0];
      var auth = res[1] || AUTH || { authenticated: false };
      AUTH = auth;
      var agents = (res[2] && res[2].agents) || [];
      renderQuickStart(HEALTH, auth, agents);
    }).catch(function (e) { renderError(body, e); });
  }
  function qsDesc(html) { var p = el('p', 'qs-desc'); p.innerHTML = html; return p; }
  function qsBtn(label, onclick, primary) {
    var b = el('button', primary ? 'btn-primary' : 'btn-soft', label);
    b.type = 'button'; b.onclick = onclick; return b;
  }
  function qsStep(n, done, locked, title, descNode, actNode) {
    var step = el('div', 'qs-step' + (done ? ' done' : '') + (locked ? ' locked' : ''));
    var head = el('div', 'qs-head');
    head.appendChild(el('span', 'qs-ic', done ? '\u2713' : String(n)));
    if (done) head.appendChild(el('span', 'qs-done-tag', 'Done'));
    step.appendChild(head);
    step.appendChild(el('div', 'qs-title', title));
    if (descNode) step.appendChild(descNode);
    if (actNode && !done) { var wrap = el('div', 'qs-act'); wrap.appendChild(actNode); step.appendChild(wrap); }
    return step;
  }
  function renderQuickStart(health, auth, agents) {
    var body = document.getElementById('qsBody');
    body.innerHTML = '';
    var steps = el('div', 'qs-steps');
    var envOk = !!(health && health.nodeOk);
    var envDesc = health
      ? qsDesc('Runtime Node <code>' + escapeHtml(health.node || '') + '</code> \u00b7 platform <code>' + escapeHtml(health.platform || '') + '</code>' + (envOk ? '' : '<br>Node 18 or newer is recommended.'))
      : qsDesc('Could not read runtime environment info.');
    steps.appendChild(qsStep(1, envOk, false, 'Environment check', envDesc, null));
    var authed = !!(auth && auth.authenticated);
    var loginDesc;
    if (authed) {
      var meta = [];
      if (auth.primary) meta.push(authMethodLabel(auth.primary));
      if (auth.region) meta.push(auth.region);
      if (auth.site) meta.push(auth.site);
      loginDesc = qsDesc('Signed in: ' + escapeHtml(meta.join(' \u00b7 ') || 'Authenticated'));
    } else {
      loginDesc = qsDesc('Sign in to the Bailian console to obtain credentials (opens a login page in your browser).');
    }
    QS_LOGIN_BTN = qsBtn('Log in', function () { startLogin(); }, true);
    steps.appendChild(qsStep(2, authed, false, 'Sign in to Bailian', loginDesc, QS_LOGIN_BTN));
    var connectedAgents = agents.filter(function (a) { return a.installed && a.configured; });
    var installedAgents = agents.filter(function (a) { return a.installed; });
    var connected = connectedAgents.length > 0;
    var agentDesc;
    if (connected) {
      agentDesc = qsDesc('Connected: ' + escapeHtml(connectedAgents.map(function (a) { return a.label; }).join(', ')));
    } else if (installedAgents.length) {
      agentDesc = qsDesc('Installed but not wired into bl: ' + escapeHtml(installedAgents.map(function (a) { return a.label; }).join(', ')) + '. Open the Agents page to finish connecting.');
    } else {
      agentDesc = qsDesc('No connected local coding agent detected (e.g. qwen-code). Open the Agents page to install and connect one.');
    }
    steps.appendChild(qsStep(3, connected, false, 'Connect a local agent', agentDesc, qsBtn('Go to Agents', function () { showView('agents'); }, false)));
    var dispatchable = agents.some(function (a) { return a.dispatchable; });
    var ran = firstRunDone();
    var runDesc;
    if (ran) {
      runDesc = qsDesc('You have dispatched at least one task.');
    } else if (!dispatchable) {
      runDesc = qsDesc('Finish the previous step first (connect a dispatchable agent), then come back to Playground to run your first scenario.');
    } else {
      runDesc = qsDesc('Go to Playground, pick a scenario and click Run it to complete your first dispatch.');
    }
    var runBtn = qsBtn('Go to Playground', function () { showView('playground'); }, true);
    if (!dispatchable) runBtn.disabled = true;
    steps.appendChild(qsStep(4, ran, !ran && !dispatchable, 'Run your first task', runDesc, runBtn));
    body.appendChild(steps);
  }

  /* ---------- profiles ---------- */
  function profileData(name) { return name === '' ? DATA.default : (DATA.named[name] || {}); }

  function loadConfig() {
    api('/api/config').then(function (r) { return r.json(); }).then(function (j) {
      KEYS = j.keys || []; SECRETS = j.secretKeys || [];
      ENUMS = j.enums || {}; BOOLEANS = j.booleanKeys || [];
      FIELD_DEFAULTS = j.fieldDefaults || {};
      MODEL_CATALOG = j.modelCatalog || {};
      DATA = { default: j.default || {}, named: j.named || {} };
      ACTIVE = j.activeProfile || 'default';
      CURRENT = ACTIVE === 'default' ? '' : ACTIVE;
      setCount('profiles', 1 + Object.keys(DATA.named).length);
      renderProfiles(); renderForm();
    }).catch(function (e) { setStatus('Load failed: ' + e, true); });
  }

  function renderProfiles() {
    var grid = document.getElementById('profileList');
    grid.innerHTML = '';
    var names = [''].concat(Object.keys(DATA.named));
    names.forEach(function (name) {
      var displayName = name === '' ? 'default' : name;
      var t = el('div', 'tile clickable profile-tile' + (name === CURRENT ? ' selected' : ''));
      var top = el('div', 'tile-top');
      top.appendChild(el('span', 'tile-name', displayName));
      if (displayName === ACTIVE) top.appendChild(el('span', 'star', '★'));
      top.appendChild(el('span', 'chev', '›'));
      t.appendChild(top);
      t.onclick = function () { CURRENT = name; renderProfiles(); renderForm(); setStatus(''); openDrawer(); };
      grid.appendChild(t);
    });
    var add = el('div', 'tile tile-add', '+ New profile');
    add.onclick = newProfile;
    grid.appendChild(add);
  }

  function openDrawer() {
    var d = document.getElementById('drawer');
    d.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    document.getElementById('drawer').hidden = true;
    document.body.style.overflow = '';
    setStatus('');
  }

  /* ---------- read-only detail drawer (skills, ...) ---------- */
  function openInfoDrawer() {
    var f = document.getElementById('infoFoot');
    if (f) { f.innerHTML = ''; f.hidden = true; }
    document.getElementById('infoDrawer').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeInfoDrawer() {
    document.getElementById('infoDrawer').hidden = true;
    document.body.style.overflow = '';
  }
  function detailSection(label, node, action) {
    var sec = el('div', 'detail-sec');
    var head = el('div', 'detail-label', label);
    if (action) { head.classList.add('detail-label-row'); head.appendChild(action); }
    sec.appendChild(head);
    sec.appendChild(node);
    return sec;
  }

  /* Minimal, XSS-safe Markdown renderer (escape first, then wrap in tags). */
  var BT = String.fromCharCode(96);
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function mdSpans(s) {
    s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    s = s.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
    s = s.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, function (m, txt, url) {
      var safe = /^(https?:|mailto:|#|\\/|\\.)/i.test(url) ? url : '#';
      return '<a href="' + safe + '" target="_blank" rel="noopener">' + txt + '</a>';
    });
    return s;
  }
  function mdInline(text) {
    var segs = text.split(BT);
    var out = '';
    for (var k = 0; k < segs.length; k++) {
      if (k % 2 === 1) out += '<code>' + segs[k] + '</code>';
      else out += mdSpans(segs[k]);
    }
    return out;
  }
  function splitTableRow(line) {
    var s = line.trim().replace(/^\\|/, '').replace(/\\|$/, '');
    return s.split('|').map(function (c) { return c.trim(); });
  }
  function renderMarkdown(md) {
    md = md.replace(/^---\\n[\\s\\S]*?\\n---\\n?/, '');
    var lines = md.split(/\\r?\\n/);
    var html = '';
    var i = 0;
    var listType = null;
    function closeList() { if (listType) { html += '</' + listType + '>'; listType = null; } }
    while (i < lines.length) {
      var line = lines[i];
      if (line.indexOf(BT + BT + BT) === 0) {
        closeList();
        var buf = [];
        i++;
        while (i < lines.length && lines[i].indexOf(BT + BT + BT) !== 0) { buf.push(lines[i]); i++; }
        i++;
        html += '<pre class="md-pre"><code>' + escapeHtml(buf.join('\\n')) + '</code></pre>';
        continue;
      }
      var h = line.match(/^(#{1,6})\\s+(.*)$/);
      if (h) { closeList(); var lvl = h[1].length; html += '<h' + lvl + '>' + mdInline(escapeHtml(h[2])) + '</h' + lvl + '>'; i++; continue; }
      if (/^\\s*(-{3,}|\\*{3,}|_{3,})\\s*$/.test(line)) { closeList(); html += '<hr>'; i++; continue; }
      if (/^>\\s?/.test(line)) {
        closeList();
        var q = [];
        while (i < lines.length && /^>\\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\\s?/, '')); i++; }
        html += '<blockquote>' + mdInline(escapeHtml(q.join(' '))) + '</blockquote>';
        continue;
      }
      var ul = line.match(/^\\s*[-*+]\\s+(.*)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
        html += '<li>' + mdInline(escapeHtml(ul[1])) + '</li>';
        i++; continue;
      }
      var ol = line.match(/^\\s*\\d+\\.\\s+(.*)$/);
      if (ol) {
        if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
        html += '<li>' + mdInline(escapeHtml(ol[1])) + '</li>';
        i++; continue;
      }
      // GFM table: a header row followed by a |---|---| separator line.
      if (line.indexOf('|') >= 0 && i + 1 < lines.length &&
          /^\\s*\\|?\\s*:?-{1,}:?\\s*(\\|\\s*:?-{1,}:?\\s*)+\\|?\\s*$/.test(lines[i + 1])) {
        closeList();
        var headCells = splitTableRow(line);
        i += 2;
        var bodyRows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && !/^\\s*$/.test(lines[i])) {
          bodyRows.push(splitTableRow(lines[i])); i++;
        }
        var thtml = '<table class="md-table"><thead><tr>';
        for (var hc = 0; hc < headCells.length; hc++) thtml += '<th>' + mdInline(escapeHtml(headCells[hc])) + '</th>';
        thtml += '</tr></thead><tbody>';
        for (var br = 0; br < bodyRows.length; br++) {
          thtml += '<tr>';
          for (var td = 0; td < headCells.length; td++) thtml += '<td>' + mdInline(escapeHtml(bodyRows[br][td] || '')) + '</td>';
          thtml += '</tr>';
        }
        thtml += '</tbody></table>';
        html += thtml;
        continue;
      }
      if (/^\\s*$/.test(line)) { closeList(); i++; continue; }
      closeList();
      var para = [line];
      i++;
      while (i < lines.length && !/^\\s*$/.test(lines[i]) && lines[i].indexOf(BT + BT + BT) !== 0 && !/^(#{1,6}\\s|>|\\s*[-*+]\\s|\\s*\\d+\\.\\s)/.test(lines[i]) && !/^\\s*(-{3,}|\\*{3,}|_{3,})\\s*$/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      html += '<p>' + mdInline(escapeHtml(para.join(' '))) + '</p>';
    }
    closeList();
    return html;
  }
  function renderMarkdownInto(container, md) {
    if (!md) { container.appendChild(el('div', 'loading', '(empty)')); return; }
    var wrap = el('div', 'md-body');
    wrap.innerHTML = renderMarkdown(md);
    container.appendChild(wrap);
  }

  var SKILL_TARGETS = [
    { source: 'global', label: 'All agents (~/.agents/skills)' },
    { source: 'claude-code', label: 'Claude Code' },
    { source: 'qwen-code', label: 'Qwen Code' },
    { source: 'codex', label: 'Codex' },
    { source: 'opencode', label: 'OpenCode' },
    { source: 'openclaw', label: 'OpenClaw' },
    { source: 'qoderwork', label: 'QoderWork' },
    { source: 'windsurf', label: 'Windsurf' },
    { source: 'gemini', label: 'Gemini' }
  ];
  function setSkillErr(msg) { var e = document.getElementById('skillErr'); if (e) e.textContent = msg || ''; }
  function openSkillInstall() {
    var title = document.getElementById('infoTitle');
    title.textContent = ''; title.appendChild(el('span', '', 'Add skill'));
    var body = document.getElementById('infoBody'); body.innerHTML = '';
    var sel = el('select', 'select'); sel.id = 'skillNewSource';
    SKILL_TARGETS.forEach(function (s) { var o = el('option', '', s.label); o.value = s.source; sel.appendChild(o); });
    body.appendChild(detailSection('Install to', sel));
    var nameInp = el('input'); nameInp.id = 'skillNewName'; nameInp.type = 'text';
    nameInp.placeholder = 'Optional \u2014 folder name (defaults to the archive folder)'; nameInp.autocomplete = 'off';
    body.appendChild(detailSection('Skill name (optional)', nameInp));
    var fileInp = el('input'); fileInp.id = 'skillFile'; fileInp.type = 'file'; fileInp.accept = '.zip,application/zip';
    fileInp.style.display = 'none';
    var picker = el('div', 'file-picker');
    var pickBtn = el('button', 'file-pick-btn', 'Choose .zip file'); pickBtn.type = 'button';
    var fileName = el('span', 'file-name', 'No file selected');
    pickBtn.onclick = function () { fileInp.click(); };
    fileInp.onchange = function () {
      var f = fileInp.files && fileInp.files[0];
      fileName.textContent = f ? f.name : 'No file selected';
      fileName.classList.toggle('has-file', !!f);
    };
    picker.appendChild(pickBtn); picker.appendChild(fileName); picker.appendChild(fileInp);
    body.appendChild(detailSection('Skill package (.zip)', picker));
    body.appendChild(el('p', 'mcp-note', 'The .zip must contain a SKILL.md at its root or inside a single top-level folder.'));
    var err = el('div', 'modal-err'); err.id = 'skillErr'; body.appendChild(err);
    openInfoDrawer();
    var foot = document.getElementById('infoFoot'); foot.innerHTML = ''; foot.hidden = false;
    var install = el('button', 'btn-primary', 'Install'); install.type = 'button';
    install.onclick = function () { doInstallSkill(install); };
    foot.appendChild(install);
  }
  function doInstallSkill(btn) {
    setSkillErr('');
    var source = document.getElementById('skillNewSource').value;
    var name = (document.getElementById('skillNewName').value || '').trim();
    var fileInput = document.getElementById('skillFile');
    var file = fileInput.files && fileInput.files[0];
    if (!file) { setSkillErr('Please choose a .zip file.'); return; }
    btn.disabled = true;
    file.arrayBuffer().then(function (buf) {
      return api('/api/skill/install?source=' + encodeURIComponent(source) + '&name=' + encodeURIComponent(name),
        { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: buf });
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { setSkillErr((res.j && res.j.error) || 'Install failed'); return; }
        closeInfoDrawer(); loaded.skills = false; loadSkills();
        notify('Installed', 'Skill "' + res.j.installed + '" installed (' + res.j.files + ' files) to ' + source + '.');
      })
      .catch(function (e) { btn.disabled = false; setSkillErr('Install failed: ' + e); });
  }

  function openSkillDetail(s) {
    var title = document.getElementById('infoTitle');
    title.textContent = '';
    title.appendChild(el('span', '', s.name));
    if (s.version) title.appendChild(el('span', 'ver', 'v' + s.version));
    title.appendChild(originBadge(s.origin));
    var body = document.getElementById('infoBody');
    body.innerHTML = '';
    if (s.description) body.appendChild(detailSection('Description', el('div', 'detail-desc', s.description)));
    var chips = el('div', 'detail-chips');
    (s.sources || []).forEach(function (src) { chips.appendChild(el('span', 'chip blue', src)); });
    chips.appendChild(el('span', 'chip', s.fileCount + ' files'));
    body.appendChild(detailSection('Installed in', chips));
    body.appendChild(detailSection('Path', el('div', 'detail-path', s.path)));
    var codeSec = detailSection('SKILL.md', el('div', 'loading', 'Loading…'));
    body.appendChild(codeSec);
    openInfoDrawer();
    api('/api/skill?id=' + encodeURIComponent(s.id)).then(function (r) { return r.json(); }).then(function (j) {
      codeSec.removeChild(codeSec.lastChild);
      renderMarkdownInto(codeSec, (j && j.content) || '');
    }).catch(function (e) {
      codeSec.removeChild(codeSec.lastChild);
      codeSec.appendChild(el('div', 'err', 'Failed to load: ' + e));
    });
  }

  function makeSelect(key, options, current) {
    var sel = document.createElement('select');
    sel.id = 'f_' + key; sel.name = key; sel.className = 'select';
    var blank = document.createElement('option'); blank.value = ''; blank.textContent = '(unset)';
    sel.appendChild(blank);
    options.forEach(function (opt) {
      var o = document.createElement('option'); o.value = opt; o.textContent = opt;
      sel.appendChild(o);
    });
    sel.value = current;
    return sel;
  }

  function renderForm() {
    var form = document.getElementById('form');
    form.innerHTML = '';
    document.getElementById('currentName').textContent = CURRENT === '' ? 'default (top-level)' : CURRENT;
    document.getElementById('deleteBtn').style.display = CURRENT === '' ? 'none' : '';
    var selectedName = CURRENT === '' ? 'default' : CURRENT;
    var useBtn = document.getElementById('useBtn');
    useBtn.disabled = selectedName === ACTIVE;
    useBtn.textContent = selectedName === ACTIVE ? 'Active' : 'Save & Activate';
    var data = profileData(CURRENT);
    KEYS.forEach(function (key) {
      var row = el('div', 'row');
      var label = el('label', '', key); label.htmlFor = 'f_' + key;
      var val = data[key];
      var strVal = (val === undefined || val === null) ? '' : String(val);
      if (SECRETS.indexOf(key) >= 0) {
        var input = el('input'); input.id = 'f_' + key; input.name = key; input.value = strVal;
        input.type = 'password';
        // Prevent the browser password manager from autofilling a previously
        // saved value over the server's current value (e.g. after logout clears
        // the key). 'new-password' reliably suppresses saved-credential autofill.
        input.autocomplete = 'new-password';
        input.setAttribute('autocorrect', 'off'); input.spellcheck = false;
        var toggle = el('button', 'toggle', 'show'); toggle.type = 'button';
        toggle.onclick = function () {
          if (input.type === 'password') { input.type = 'text'; toggle.textContent = 'hide'; }
          else { input.type = 'password'; toggle.textContent = 'show'; }
        };
        var wrap = el('div', 'inputwrap'); wrap.appendChild(input); wrap.appendChild(toggle);
        row.appendChild(label); row.appendChild(wrap);
      } else if (ENUMS[key]) {
        row.appendChild(label); row.appendChild(makeSelect(key, ENUMS[key], strVal));
      } else if (BOOLEANS.indexOf(key) >= 0) {
        row.appendChild(label); row.appendChild(makeSelect(key, ['true', 'false'], strVal));
      } else {
        var textInput = el('input'); textInput.id = 'f_' + key; textInput.name = key;
        textInput.type = 'text';
        textInput.value = strVal || (FIELD_DEFAULTS[key] || '');
        row.appendChild(label); row.appendChild(textInput);
        if (MODEL_CATALOG[key]) row.appendChild(modelCatalogBlock(key, textInput));
      }
      form.appendChild(row);
    });
  }

  function modelCatLabel(key) {
    return key.replace(/^default_/, '').replace(/_model$/, '');
  }
  function modelCatNote(key) {
    if (key === 'default_video_model') {
      return 'Applies to <code>bl video generate</code> only (text/image-to-video). '
        + '<code>bl video ref</code> (multi-image) and <code>bl video edit</code> keep their own '
        + 'fixed models — pass <code>--model</code> to override those per run.';
    }
    return '';
  }
  function modelCatalogBlock(key, input) {
    var opts = MODEL_CATALOG[key] || [];
    var box = el('div', 'model-cat');
    box.appendChild(el('div', 'model-cat-hint', 'Available ' + modelCatLabel(key) + ' models · click to use'));
    var chips = el('div', 'model-chips');
    function mark() {
      var cur = input.value.trim();
      Array.prototype.forEach.call(chips.children, function (c) {
        c.className = c.getAttribute('data-id') === cur ? 'mchip active' : 'mchip';
      });
    }
    opts.forEach(function (o) {
      var chip = el('button', 'mchip', o.id);
      chip.type = 'button';
      chip.title = o.role;
      chip.setAttribute('data-id', o.id);
      chip.onclick = function () { input.value = o.id; mark(); };
      chips.appendChild(chip);
    });
    input.addEventListener('input', mark);
    box.appendChild(chips);
    var note = modelCatNote(key);
    if (note) {
      var noteEl = el('div', 'model-cat-note');
      noteEl.innerHTML = note;
      box.appendChild(noteEl);
    }
    setTimeout(mark, 0);
    return box;
  }

  function collect() {
    var data = {};
    KEYS.forEach(function (key) { var e = document.getElementById('f_' + key); data[key] = e ? e.value : ''; });
    return data;
  }

  function saveProfile(name, data) {
    var payload = data === undefined ? collect() : data;
    return api('/api/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, data: payload })
    }).then(function (resp) {
      return resp.json().then(function (json) { return { ok: resp.ok, json: json }; });
    }).then(function (result) {
      if (!result.ok) throw new Error((result.json && result.json.error) || 'error');
      var saved = result.json.saved || {};
      if (name === '') DATA.default = saved; else DATA.named[name] = saved;
      return saved;
    });
  }

  function save() {
    saveProfile(CURRENT).then(function () { renderForm(); setStatus('Saved.'); })
      .catch(function (err) { setStatus('Save failed: ' + err.message, true); });
  }

  function newProfile() {
    var input = document.getElementById('modalInput');
    input.value = '';
    setModalErr('');
    document.getElementById('modal').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { input.focus(); }, 30);
  }

  function closeModal() {
    document.getElementById('modal').hidden = true;
    document.body.style.overflow = '';
  }

  function setModalErr(msg) {
    document.getElementById('modalErr').textContent = msg || '';
  }

  var _confirmOnOk = null;
  function openConfirm(opts) {
    opts = opts || {};
    document.getElementById('confirmTitle').textContent = opts.title || 'Are you sure?';
    document.getElementById('confirmMsg').textContent = opts.message || '';
    var ok = document.getElementById('confirmOk');
    var cancel = document.getElementById('confirmCancel');
    ok.textContent = opts.okLabel || 'Delete';
    ok.className = opts.danger === false ? 'btn-primary' : 'btn-danger-solid';
    cancel.hidden = !!opts.hideCancel;
    _confirmOnOk = opts.onConfirm || null;
    document.getElementById('confirm').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { (opts.hideCancel ? ok : cancel).focus(); }, 30);
  }
  function closeConfirm() {
    document.getElementById('confirm').hidden = true;
    document.body.style.overflow = '';
    _confirmOnOk = null;
  }
  function confirmOk() {
    var cb = _confirmOnOk;
    closeConfirm();
    if (cb) cb();
  }
  function notify(title, message) {
    openConfirm({ title: title, message: message, okLabel: 'OK', danger: false, hideCancel: true });
  }

  function submitNewProfile() {
    var name = (document.getElementById('modalInput').value || '').trim();
    if (!name) { setModalErr('Please enter a profile name.'); return; }
    if (!/^[A-Za-z0-9_-]+$/.test(name)) { setModalErr('Only letters, numbers, - and _ are allowed.'); return; }
    if (name === 'default') { setModalErr('"default" is reserved for the top-level profile.'); return; }
    if (DATA.named[name] !== undefined) { setModalErr('A profile named "' + name + '" already exists.'); return; }
    var btn = document.getElementById('modalCreate');
    btn.disabled = true; setModalErr('');
    saveProfile(name, {}).then(function () {
      btn.disabled = false;
      CURRENT = name; setCount('profiles', 1 + Object.keys(DATA.named).length);
      renderProfiles(); renderForm(); closeModal(); openDrawer(); setStatus('Profile created and saved.');
    }).catch(function (err) {
      btn.disabled = false;
      setModalErr('Create failed: ' + err.message);
    });
  }

  function saveAndActivateProfile() {
    var name = CURRENT === '' ? 'default' : CURRENT;
    setStatus('Saving…');
    saveProfile(CURRENT).then(function () {
      return api('/api/active', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      });
    }).then(function (resp) {
      return resp.json().then(function (json) { return { ok: resp.ok, json: json }; });
    }).then(function (result) {
      if (!result.ok) throw new Error('Saved, but activation failed: ' + ((result.json && result.json.error) || 'error'));
      ACTIVE = result.json.activeProfile || 'default';
      renderProfiles(); renderForm(); setStatus('Saved and activated.');
    }).catch(function (err) { setStatus(err.message || String(err), true); });
  }

  function deleteProfile() {
    if (CURRENT === '') return;
    openConfirm({
      title: 'Delete profile',
      message: 'Delete profile "' + CURRENT + '"? This permanently removes its credentials and default models.',
      okLabel: 'Delete profile',
      onConfirm: function () {
        api('/api/profile?name=' + encodeURIComponent(CURRENT), { method: 'DELETE' }).then(function (r) {
          if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'error'); });
          return r.json();
        }).then(function (result) {
          delete DATA.named[CURRENT];
          ACTIVE = result.activeProfile || 'default'; CURRENT = '';
          setCount('profiles', 1 + Object.keys(DATA.named).length);
          renderProfiles(); renderForm(); closeDrawer();
        }).catch(function (e) { setStatus('Delete failed: ' + e, true); });
      }
    });
  }

  /* ---------- inventory views ---------- */
  function renderEmpty(container, msg, hint) {
    container.innerHTML = '';
    var box = el('div', 'empty');
    box.appendChild(el('div', '', msg));
    if (hint) { var p = el('p', 'muted'); p.style.marginTop = '10px'; p.innerHTML = hint; box.appendChild(p); }
    container.appendChild(box);
  }
  function renderError(container, e) { renderEmpty(container, 'Failed to load: ' + e); }

  /* ---------- search + pagination helpers ---------- */
  function matchQ(hay, q) {
    if (!q) return true;
    return String(hay || '').toLowerCase().indexOf(q.toLowerCase()) >= 0;
  }
  function pageSlice(list, page, size) {
    var pages = Math.max(1, Math.ceil(list.length / size));
    var p = Math.min(Math.max(1, page), pages);
    return { items: list.slice((p - 1) * size, p * size), page: p, pages: pages, total: list.length };
  }
  function pageList(cur, total) {
    var pages = [];
    if (total <= 7) { for (var i = 1; i <= total; i++) pages.push(i); return pages; }
    var left = Math.max(2, cur - 2), right = Math.min(total - 1, cur + 2);
    if (cur - 1 <= 3) { left = 2; right = 5; }
    if (total - cur <= 3) { left = total - 4; right = total - 1; }
    pages.push(1);
    if (left > 2) pages.push('jp');
    for (var j = left; j <= right; j++) pages.push(j);
    if (right < total - 1) pages.push('jn');
    pages.push(total);
    return pages;
  }
  function renderPager(id, info, view, onGo) {
    var bar = document.getElementById(id);
    if (!bar) return;
    bar.innerHTML = '';
    if (info.total <= PAGE_SIZES[0]) return;
    function navBtn(label, target, disabled) {
      var b = el('button', 'pg pg-nav', label); b.type = 'button'; b.disabled = !!disabled;
      if (!disabled) b.onclick = function () { onGo(target); };
      return b;
    }
    bar.appendChild(navBtn('\u2039', info.page - 1, info.page <= 1));
    pageList(info.page, info.pages).forEach(function (it) {
      if (it === 'jp' || it === 'jn') {
        var jump = el('button', 'pg pg-jump', '\u00b7\u00b7\u00b7'); jump.type = 'button';
        jump.title = it === 'jp' ? 'Jump backward 5 pages' : 'Jump forward 5 pages';
        jump.onclick = function () {
          var t = it === 'jp' ? info.page - 5 : info.page + 5;
          onGo(Math.min(Math.max(1, t), info.pages));
        };
        bar.appendChild(jump);
      } else {
        var pg = el('button', 'pg' + (it === info.page ? ' is-active' : ''), String(it)); pg.type = 'button';
        if (it !== info.page) pg.onclick = function () { onGo(it); };
        bar.appendChild(pg);
      }
    });
    bar.appendChild(navBtn('\u203a', info.page + 1, info.page >= info.pages));
    var sel = el('select', 'pg-size'); sel.title = 'Items per page';
    PAGE_SIZES.forEach(function (s) {
      var o = el('option', '', s + ' / page'); o.value = String(s);
      if (s === getPageSize(view)) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { setPageSize(view, parseInt(sel.value, 10) || 20); onGo(1); };
    bar.appendChild(sel);
  }
  function bindSearch(id, fn) {
    var inp = document.getElementById(id);
    if (inp) inp.addEventListener('input', function () { fn(inp.value.trim()); });
  }
  function initSearches() {
    bindSearch('scenarioSearch', function (v) { SCN_Q = v; SCN_PAGE = 1; renderScenarios(); });
    bindSearch('skillSearch', function (v) { SKILL_Q = v; SKILL_PAGE = 1; renderSkills(); });
    bindSearch('mcpSearch', function (v) { MCP_Q = v; MCP_PAGE = 1; renderMcp(); });
    bindSearch('agentSearch', function (v) { AGENT_Q = v; AGENT_PAGE = 1; renderAgents(); });
    bindSearch('assetSearch', function (v) { ASSET_Q = v; ASSET_PAGE = 1; renderAssets(); });
  }

  function loadSkills() {
    loaded.skills = true;
    var body = document.getElementById('skillsBody');
    api('/api/skills').then(function (r) { return r.json(); }).then(function (j) {
      SKILLS = j.skills || [];
      setCount('skills', SKILLS.length);
      renderSkills();
    }).catch(function (e) { renderError(body, e); });
  }

  function skillMatches(s, q) {
    return matchQ(s.name, q) || matchQ(s.description, q) || matchQ((s.sources || []).join(' '), q) || matchQ(s.path, q);
  }

  function renderSkills() {
    var body = document.getElementById('skillsBody');
    var pager = document.getElementById('skillsPager');
    if (!SKILLS.length) { pager.innerHTML = ''; renderEmpty(body, 'No skills installed.', 'Install with <code>bl skill add --name all</code>'); return; }
    var list = SKILLS.filter(function (s) { return skillMatches(s, SKILL_Q); });
    if (!list.length) { pager.innerHTML = ''; renderEmpty(body, 'No skills match "' + SKILL_Q + '".', ''); return; }
    var info = pageSlice(list, SKILL_PAGE, getPageSize('skills')); SKILL_PAGE = info.page;
    body.innerHTML = '';
    var grid = el('div', 'grid');
    info.items.forEach(function (s) {
      var t = el('div', 'tile clickable');
      t.onclick = function () { openSkillDetail(s); };
      var top = el('div', 'tile-top');
      top.appendChild(el('span', 'tile-name', s.name));
      top.appendChild(originBadge(s.origin));
      if (s.version) top.appendChild(el('span', 'ver', 'v' + s.version));
      t.appendChild(top);
      if (s.description) t.appendChild(el('p', 'tile-desc', s.description));
      var srcRow = el('div', 'tile-foot');
      (s.sources || []).forEach(function (src) { srcRow.appendChild(el('span', 'chip blue', src)); });
      srcRow.appendChild(el('span', 'chip', s.fileCount + ' files'));
      t.appendChild(srcRow);
      grid.appendChild(t);
    });
    body.appendChild(grid);
    renderPager('skillsPager', info, 'skills', function (p) { SKILL_PAGE = p; renderSkills(); });
  }

  function loadMcp() {
    loaded.mcp = true;
    var body = document.getElementById('mcpBody');
    api('/api/mcp').then(function (r) { return r.json(); }).then(function (j) {
      MCPS = j.servers || [];
      setCount('mcp', MCPS.length);
      renderMcp();
    }).catch(function (e) { renderError(body, e); });
  }

  function mcpMatches(m, q) {
    return matchQ(m.name, q) || matchQ(m.detail, q) || matchQ(m.source, q) || matchQ(m.transport, q) || matchQ(m.scope, q);
  }

  function renderMcp() {
    var body = document.getElementById('mcpBody');
    var pager = document.getElementById('mcpPager');
    if (!MCPS.length) { pager.innerHTML = ''; renderEmpty(body, 'No local MCP servers found.', 'MCP servers configured in Claude Code, Codex, Qwen Code or OpenCode will appear here.'); return; }
    var list = MCPS.filter(function (m) { return mcpMatches(m, MCP_Q); });
    if (!list.length) { pager.innerHTML = ''; renderEmpty(body, 'No MCP servers match "' + MCP_Q + '".', ''); return; }
    var info = pageSlice(list, MCP_PAGE, getPageSize('mcp')); MCP_PAGE = info.page;
    body.innerHTML = '';
    var grid = el('div', 'grid');
    info.items.forEach(function (m) {
      var t = el('div', 'tile clickable');
      t.onclick = function () { openMcpDetail(m); };
      var top = el('div', 'tile-top');
      top.appendChild(el('span', 'tile-name', m.name));
      top.appendChild(originBadge(m.origin));
      top.appendChild(el('span', 'pill neutral', m.source));
      t.appendChild(top);
      if (m.detail) { var d = el('p', 'tile-desc', m.detail); d.style.fontFamily = 'var(--mono)'; d.style.fontSize = '12px'; t.appendChild(d); }
      var foot = el('div', 'tile-foot');
      foot.appendChild(el('span', 'chip blue', m.transport));
      if (m.scope && m.scope !== 'global') { var sc = el('span', '', m.scope); sc.title = m.scope; foot.appendChild(sc); }
      else foot.appendChild(el('span', '', 'global'));
      t.appendChild(foot);
      grid.appendChild(t);
    });
    body.appendChild(grid);
    renderPager('mcpPager', info, 'mcp', function (p) { MCP_PAGE = p; renderMcp(); });
  }

  function openMcpDetail(m) {
    var title = document.getElementById('infoTitle');
    title.textContent = '';
    title.appendChild(el('span', '', m.name));
    title.appendChild(originBadge(m.origin));
    var body = document.getElementById('infoBody');
    body.innerHTML = '';
    var meta = el('div', 'detail-chips');
    meta.appendChild(el('span', 'chip blue', m.transport));
    meta.appendChild(el('span', 'chip', m.source));
    body.appendChild(detailSection('Transport / Source', meta));
    body.appendChild(detailSection('Scope', el('div', 'detail-path', m.scope || 'global')));
    var cfg = (m.config && typeof m.config === 'object') ? m.config : {};
    var json = JSON.stringify(cfg, null, 2);
    var editable = !!m.editable;
    var block;
    if (editable) {
      block = el('textarea', 'detail-code code-edit'); block.id = 'mcpEdit';
      block.spellcheck = false; block.setAttribute('autocomplete', 'off'); block.value = json;
    } else {
      block = el('pre', 'detail-code', json);
    }
    body.appendChild(detailSection('Configuration' + (editable ? ' (editable)' : ''), block, copyButton(function () {
      return editable ? document.getElementById('mcpEdit').value : json;
    })));
    if (!editable) body.appendChild(el('p', 'mcp-note', 'This source is read-only here (its config is TOML). Edit it directly in ' + (m.source || 'its config file') + '.'));
    var err = el('div', 'modal-err'); err.id = 'mcpErr'; body.appendChild(err);
    openInfoDrawer();
    if (editable) {
      var foot = document.getElementById('infoFoot'); foot.innerHTML = ''; foot.hidden = false;
      var del = el('button', 'btn-danger', 'Delete'); del.type = 'button';
      del.onclick = function () {
        openConfirm({ title: 'Delete MCP server?', message: 'Remove "' + m.name + '" from ' + m.source + '? This rewrites the source config file.', onConfirm: function () { doDeleteMcp(m); } });
      };
      var save = el('button', 'btn-primary', 'Save'); save.type = 'button';
      save.onclick = function () { doSaveMcp(m, save); };
      foot.appendChild(del); foot.appendChild(save);
    }
  }

  var MCP_SOURCES = [
    { id: 'claude-code', label: 'Claude Code' },
    { id: 'claude-desktop', label: 'Claude Desktop' },
    { id: 'qwen-code', label: 'Qwen Code' },
    { id: 'cursor', label: 'Cursor' },
    { id: 'windsurf', label: 'Windsurf' },
    { id: 'gemini', label: 'Gemini' },
    { id: 'opencode', label: 'OpenCode' },
    { id: 'openclaw', label: 'OpenClaw' },
    { id: 'qoderwork', label: 'QoderWork' }
  ];
  function copyButton(getText) {
    var b = el('button', 'copy-btn', 'Copy'); b.type = 'button';
    b.onclick = function () {
      var text = getText();
      var done = function () { b.classList.add('copied'); b.textContent = 'Copied'; setTimeout(function () { b.classList.remove('copied'); b.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); }); }
      else { fallbackCopy(text); done(); }
    };
    return b;
  }
  function setMcpErr(msg) { var e = document.getElementById('mcpErr'); if (e) e.textContent = msg || ''; }
  function parseMcpEditor() {
    var parsed = JSON.parse(document.getElementById('mcpEdit').value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Config must be a JSON object.');
    return parsed;
  }
  function doSaveMcp(m, btn) {
    setMcpErr('');
    var parsed;
    try { parsed = parseMcpEditor(); } catch (e) { setMcpErr('Invalid JSON: ' + (e.message || e)); return; }
    btn.disabled = true;
    api('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: m.source, scope: m.scope, name: m.name, config: parsed }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { setMcpErr((res.j && res.j.error) || 'Save failed'); return; }
        closeInfoDrawer(); loaded.mcp = false; loadMcp();
        notify('Saved', 'MCP server "' + m.name + '" was updated.');
      })
      .catch(function (e) { btn.disabled = false; setMcpErr('Save failed: ' + e); });
  }
  function doDeleteMcp(m) {
    api('/api/mcp?source=' + encodeURIComponent(m.source) + '&scope=' + encodeURIComponent(m.scope) + '&name=' + encodeURIComponent(m.name), { method: 'DELETE' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { notify('Delete failed', (res.j && res.j.error) || 'Could not delete this server.'); return; }
        closeInfoDrawer(); loaded.mcp = false; loadMcp();
      })
      .catch(function (e) { notify('Delete failed', String(e)); });
  }
  function openMcpCreate() {
    var title = document.getElementById('infoTitle');
    title.textContent = ''; title.appendChild(el('span', '', 'New MCP server'));
    var body = document.getElementById('infoBody'); body.innerHTML = '';
    var sel = el('select', 'select'); sel.id = 'mcpNewSource';
    MCP_SOURCES.forEach(function (s) { var o = el('option', '', s.label); o.value = s.id; sel.appendChild(o); });
    body.appendChild(detailSection('Target agent config', sel));
    var nameInp = el('input'); nameInp.id = 'mcpNewName'; nameInp.type = 'text'; nameInp.placeholder = 'e.g. amap-maps'; nameInp.autocomplete = 'off';
    body.appendChild(detailSection('Server name', nameInp));
    var ta = el('textarea', 'detail-code code-edit'); ta.id = 'mcpEdit'; ta.spellcheck = false;
    ta.value = JSON.stringify({ command: 'npx', args: ['-y', '@scope/package'], env: { API_KEY: '' } }, null, 2);
    body.appendChild(detailSection('Configuration', ta));
    var err = el('div', 'modal-err'); err.id = 'mcpErr'; body.appendChild(err);
    openInfoDrawer();
    var foot = document.getElementById('infoFoot'); foot.innerHTML = ''; foot.hidden = false;
    var create = el('button', 'btn-primary', 'Create'); create.type = 'button';
    create.onclick = function () { doCreateMcp(create); };
    foot.appendChild(create);
  }
  function doCreateMcp(btn) {
    setMcpErr('');
    var source = document.getElementById('mcpNewSource').value;
    var name = (document.getElementById('mcpNewName').value || '').trim();
    if (!name) { setMcpErr('Please enter a server name.'); return; }
    var parsed;
    try { parsed = parseMcpEditor(); } catch (e) { setMcpErr('Invalid JSON: ' + (e.message || e)); return; }
    btn.disabled = true;
    api('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: source, scope: 'global', name: name, config: parsed }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { setMcpErr((res.j && res.j.error) || 'Create failed'); return; }
        closeInfoDrawer(); loaded.mcp = false; loadMcp();
        notify('Created', 'MCP server "' + name + '" was added to ' + source + '.');
      })
      .catch(function (e) { btn.disabled = false; setMcpErr('Create failed: ' + e); });
  }

  function loadAgents() {
    loaded.agents = true;
    var body = document.getElementById('agentsBody');
    api('/api/agents').then(function (r) { return r.json(); }).then(function (j) {
      AGENTS = j.agents || [];
      var installed = AGENTS.filter(function (a) { return a.installed; }).length;
      setCount('agents', installed);
      renderAgentFilters();
      renderAgents();
    }).catch(function (e) { renderError(body, e); });
  }

  function renderAgentFilters() {
    var bar = document.getElementById('agentFilters');
    bar.innerHTML = '';
    var counts = {
      all: AGENTS.length,
      local: AGENTS.filter(function (a) { return a.origin !== 'remote'; }).length,
      remote: AGENTS.filter(function (a) { return a.origin === 'remote'; }).length
    };
    var labels = { all: 'All', local: 'Local', remote: 'Remote' };
    ['all', 'local', 'remote'].forEach(function (cat) {
      var b = el('button', 'filter' + (cat === AGENT_FILTER ? ' is-active' : ''));
      b.appendChild(el('span', '', labels[cat]));
      b.appendChild(el('span', 'n', String(counts[cat] || 0)));
      b.onclick = function () { AGENT_FILTER = cat; AGENT_PAGE = 1; renderAgentFilters(); renderAgents(); };
      bar.appendChild(b);
    });
  }

  function agentMatches(a, q) {
    return matchQ(a.label, q) || matchQ(a.id, q) || matchQ(a.model, q) || matchQ((a.paths || []).join(' '), q);
  }
  function renderAgents() {
    var body = document.getElementById('agentsBody');
    var pager = document.getElementById('agentsPager');
    var base = AGENT_FILTER === 'all'
      ? AGENTS
      : AGENTS.filter(function (a) { return (a.origin === 'remote' ? 'remote' : 'local') === AGENT_FILTER; });
    var list = base.filter(function (a) { return agentMatches(a, AGENT_Q); });
    if (!list.length) {
      pager.innerHTML = '';
      if (AGENT_Q) renderEmpty(body, 'No agents match "' + AGENT_Q + '".', '');
      else if (AGENT_FILTER === 'remote') renderEmpty(body, 'No remote agents yet.', 'Remote agents loaded from a URL will appear here.');
      else renderEmpty(body, 'No agents in this category.', '');
      return;
    }
    var info = pageSlice(list, AGENT_PAGE, getPageSize('agents')); AGENT_PAGE = info.page;
    body.innerHTML = '';
    var grid = el('div', 'grid');
    info.items.forEach(function (a) {
      var t = el('div', 'tile clickable');
      t.onclick = function () { openAgentDetail(a); };
      var top = el('div', 'tile-top');
      var nm = el('span', 'tile-name', a.label); nm.title = a.label;
      top.appendChild(nm);
      t.appendChild(top);
      var meta = el('div', 'tile-meta');
      meta.appendChild(originBadge(a.origin));
      var pill;
      if (a.installed && a.configured) pill = el('span', 'pill ok', 'Connected');
      else if (a.installed) pill = el('span', 'pill neutral', 'Installed');
      else pill = el('span', 'pill off', 'Not installed');
      meta.appendChild(pill);
      t.appendChild(meta);
      var foot = el('div', 'tile-foot');
      foot.appendChild(el('span', 'chip', a.id));
      if (a.model) foot.appendChild(el('span', 'chip blue', a.model));
      t.appendChild(foot);
      if (a.paths && a.paths.length) {
        var path = el('div', 'tile-path', a.paths.join('\\n'));
        path.title = a.paths.join('\\n');
        t.appendChild(path);
      }
      var actions = el('div', 'tile-actions');
      var launch = el('button', 'icon-run');
      launch.innerHTML = PLAY_SVG;
      launch.setAttribute('aria-label', 'Quick launch');
      var connected = a.installed && a.configured;
      var st = el('span', 'launch-status');
      if (connected && a.launchable) {
        launch.title = 'Open a new terminal and start this agent';
        launch.onclick = function (e) { e.stopPropagation(); launchAgentCli(a, launch, st); };
      } else {
        launch.disabled = true;
        if (!a.installed) launch.title = 'Install this agent before launching';
        else if (!connected) launch.title = 'Connect this agent to bailian-cli before launching';
        else launch.title = 'The CLI for this agent was not found on your PATH — install it before launching';
      }
      actions.appendChild(st);
      actions.appendChild(launch);
      t.appendChild(actions);
      grid.appendChild(t);
    });
    body.appendChild(grid);
    renderPager('agentsPager', info, 'agents', function (p) { AGENT_PAGE = p; renderAgents(); });
  }
  
  function launchAgentCli(a, btn, st) {
    btn.disabled = true;
    st.textContent = 'Launching…'; st.className = 'launch-status';
    api('/api/agent/launch?id=' + encodeURIComponent(a.id), { method: 'POST' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { st.textContent = (res.j && res.j.error) || 'Launch failed'; st.className = 'launch-status err'; return; }
        st.textContent = 'Launched → ' + (res.j.command || a.id); st.className = 'launch-status ok';
      })
      .catch(function (e) { btn.disabled = false; st.textContent = 'Launch failed: ' + e; st.className = 'launch-status err'; });
  }

  function openAgentDetail(a) {
    var title = document.getElementById('infoTitle');
    title.textContent = '';
    title.appendChild(el('span', '', a.label));
    title.appendChild(originBadge(a.origin));
    var body = document.getElementById('infoBody');
    body.innerHTML = '<div class="loading">Loading…</div>';
    openInfoDrawer();
    api('/api/agent?id=' + encodeURIComponent(a.id)).then(function (r) { return r.json(); })
      .then(function (d) { renderAgentDetail(d); })
      .catch(function (e) { renderError(body, e); });
  }
  function renderAgentDetail(d) {
    var body = document.getElementById('infoBody');
    body.innerHTML = '';
    var chips = el('div', 'detail-chips');
    chips.appendChild(el('span', 'chip', d.id));
    var pill;
    if (d.installed && d.configured) pill = el('span', 'pill ok', 'Connected');
    else if (d.installed) pill = el('span', 'pill neutral', 'Installed');
    else pill = el('span', 'pill off', 'Not installed');
    chips.appendChild(pill);
    body.appendChild(detailSection('Status', chips));
    if (d.fields && d.fields.length) {
      var kv = el('div', 'detail-kv');
      d.fields.forEach(function (f) {
        var row = el('div', 'kv-row');
        row.appendChild(el('span', 'kv-key', f.label));
        var val = el('span', 'kv-val' + (f.secret ? ' secret' : ''), f.value);
        row.appendChild(val);
        if (f.secret && f.raw) {
          var shown = false;
          var btn = el('button', 'kv-reveal', 'Show');
          btn.type = 'button';
          btn.onclick = function () {
            shown = !shown;
            val.textContent = shown ? f.raw : f.value;
            if (shown) { val.classList.remove('secret'); } else { val.classList.add('secret'); }
            btn.textContent = shown ? 'Hide' : 'Show';
          };
          row.appendChild(btn);
        }
        kv.appendChild(row);
      });
      body.appendChild(detailSection('Configuration', kv));
    } else if (d.installed) {
      body.appendChild(detailSection('Configuration', el('div', 'detail-path', 'bailian-cli is not wired into this agent yet.')));
    } else {
      body.appendChild(detailSection('Configuration', el('div', 'detail-path', 'This agent is not installed yet.')));
    }
    if (d.files && d.files.length) {
      var wrap = el('div', '');
      d.files.forEach(function (fl) {
        var p = el('div', 'detail-path', fl.path + (fl.exists ? '' : '  (missing)'));
        p.title = fl.path;
        wrap.appendChild(p);
      });
      body.appendChild(detailSection('Config files', wrap));
    }
    if (d.settings && d.settings.length) {
      var sw = el('div', '');
      d.settings.forEach(function (fl) {
        var item = el('div', 'settings-item');
        var lbl = el('div', 'detail-path', fl.path);
        lbl.title = fl.path;
        item.appendChild(lbl);
        item.appendChild(el('pre', 'detail-code', fl.text));
        sw.appendChild(item);
      });
      var openBtn = el('button', 'kv-reveal', 'Open');
      openBtn.type = 'button';
      openBtn.title = 'Open the config file with the system default app';
      openBtn.onclick = function () { openAgentSettings(d); };
      body.appendChild(detailSection('Settings', sw, openBtn));
    }
  }
  function openAgentSettings(d) {
    (d.settings || []).forEach(function (fl) {
      api('/api/agent/open?id=' + encodeURIComponent(d.id) + '&path=' + encodeURIComponent(fl.path), { method: 'POST' })
        .then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'error'); }); })
        .catch(function (e) { notify('Open failed', String(e)); });
    });
  }

  /* ---------- playground ---------- */
  function loadPlayground() {
    loaded.playground = true;
    var body = document.getElementById('playgroundBody');
    api('/api/scenarios').then(function (r) { return r.json(); }).then(function (j) {
      BUILTIN_SCENARIOS = j.scenarios || [];
      SCENARIOS = composeScenarios();
      DISPATCH_AGENTS = j.agents || [];
      renderScenarioFilters();
      renderScenarios();
    }).catch(function (e) { renderError(body, e); });
  }
  var SCN_ORDER = ['图像', '音频', '视频', '多模态', '代码', '文档'];
  function scenarioCategories() {
    var present = {};
    SCENARIOS.forEach(function (s) { if (s.category) present[s.category] = true; });
    var cats = SCN_ORDER.filter(function (c) { return present[c]; });
    Object.keys(present).forEach(function (c) { if (SCN_ORDER.indexOf(c) < 0) cats.push(c); });
    return cats;
  }
  function renderScenarioFilters() {
    var bar = document.getElementById('scenarioFilters');
    bar.innerHTML = '';
    var defs = [{ key: 'all', label: 'All', n: SCENARIOS.length }];
    scenarioCategories().forEach(function (c) {
      defs.push({ key: c, label: c, n: SCENARIOS.filter(function (s) { return s.category === c; }).length });
    });
    defs.forEach(function (d) {
      var b = el('button', 'filter' + (d.key === SCN_FILTER ? ' is-active' : ''));
      b.appendChild(el('span', '', d.label));
      b.appendChild(el('span', 'n', String(d.n)));
      b.onclick = function () { SCN_FILTER = d.key; SCN_PAGE = 1; renderScenarioFilters(); renderScenarios(); };
      bar.appendChild(b);
    });
  }
  function scenarioMatches(s, q) {
    return matchQ(s.title, q) || matchQ(s.description, q) || matchQ(s.category, q);
  }
  function pgWarnNode() {
    return el('div', 'pg-warn', 'No connected agent can accept tasks yet. Install and connect qwen-code (or another supported agent) first, and make sure its CLI is on your PATH.');
  }
  function renderScenarios() {
    var body = document.getElementById('playgroundBody');
    var pager = document.getElementById('playgroundPager');
    var base = SCN_FILTER === 'all' ? SCENARIOS : SCENARIOS.filter(function (s) { return s.category === SCN_FILTER; });
    var list = base.filter(function (s) { return scenarioMatches(s, SCN_Q); });
    if (!list.length) {
      pager.innerHTML = '';
      renderEmpty(body, SCN_Q ? 'No scenarios match "' + SCN_Q + '".' : 'No scenarios in this category.', '');
      if (!DISPATCH_AGENTS.length) body.insertBefore(pgWarnNode(), body.firstChild);
      return;
    }
    var info = pageSlice(list, SCN_PAGE, getPageSize('playground')); SCN_PAGE = info.page;
    body.innerHTML = '';
    if (!DISPATCH_AGENTS.length) {
      body.appendChild(pgWarnNode());
    }
    var grid = el('div', 'grid');
    info.items.forEach(function (s) {
      var t = el('div', 'tile clickable');
      t.title = 'Click to edit this scenario';
      t.onclick = function () { openScnDrawer(s); };
      var top = el('div', 'tile-top');
      top.appendChild(el('span', 'tile-name', s.title));
      if (s.category) top.appendChild(el('span', 'chip', s.category));
      if (s.custom) top.appendChild(el('span', 'chip blue', 'custom'));
      else if (s.edited) top.appendChild(el('span', 'chip blue', 'edited'));
      t.appendChild(top);
      t.appendChild(el('p', 'scn-desc', s.description));
      var actions = el('div', 'tile-actions');
      var run = el('button', 'icon-run');
      run.innerHTML = PLAY_SVG;
      run.setAttribute('aria-label', 'Run it');
      if (DISPATCH_AGENTS.length) {
        run.title = 'Dispatch this task to a local agent';
        run.onclick = function (e) { e.stopPropagation(); openDispatch(s); };
      } else {
        run.disabled = true; run.title = 'No connected agent available';
      }
      actions.appendChild(run);
      t.appendChild(actions);
      grid.appendChild(t);
    });
    body.appendChild(grid);
    renderPager('playgroundPager', info, 'playground', function (p) { SCN_PAGE = p; renderScenarios(); });
  }
  function fillPrompt(s, values) {
    var out = s.prompt;
    (s.inputs || []).forEach(function (inp) {
      var v = values[inp.key];
      v = (v && String(v).trim()) ? String(v).trim() : ('{{' + inp.key + '}}');
      out = out.split('{{' + inp.key + '}}').join(v);
    });
    return out;
  }
  function dispatchValues() {
    var v = {};
    ((DISPATCH_SCN && DISPATCH_SCN.inputs) || []).forEach(function (inp) {
      var e = document.getElementById('dsp_' + inp.key);
      v[inp.key] = e ? e.value : '';
    });
    return v;
  }
  function updateDispatchPreview() {
    if (!DISPATCH_SCN) return;
    document.getElementById('dispatchPreview').textContent = fillPrompt(DISPATCH_SCN, dispatchValues());
  }
  function setDispatchErr(m) { document.getElementById('dispatchErr').textContent = m || ''; }
  var LAST_AGENT_KEY = 'bl.lastDispatchAgent';
  function openDispatch(s) {
    DISPATCH_SCN = s;
    document.getElementById('dispatchTitle').textContent = s.title;
    document.getElementById('dispatchDesc').textContent = s.description;
    var sel = document.getElementById('dispatchAgent');
    sel.innerHTML = '';
    var last = '';
    try { last = localStorage.getItem(LAST_AGENT_KEY) || ''; } catch (e) { /* ignore */ }
    var preferred = DISPATCH_AGENTS.some(function (a) { return a.id === last; }) ? last : 'qwen-code';
    DISPATCH_AGENTS.forEach(function (a) {
      var o = el('option', '', a.label + ' (' + a.id + ')'); o.value = a.id;
      if (a.id === preferred) o.selected = true;
      sel.appendChild(o);
    });
    var wrap = document.getElementById('dispatchInputs');
    wrap.innerHTML = '';
    (s.inputs || []).forEach(function (inp) {
      var lab = el('label', 'modal-label', inp.label); lab.htmlFor = 'dsp_' + inp.key;
      var input = el('input'); input.id = 'dsp_' + inp.key; input.type = 'text';
      input.placeholder = inp.placeholder || ''; input.autocomplete = 'off'; input.spellcheck = false;
      input.addEventListener('input', updateDispatchPreview);
      wrap.appendChild(lab); wrap.appendChild(input);
    });
    setDispatchErr('');
    updateDispatchPreview();
    document.getElementById('dispatch').hidden = false;
    document.body.style.overflow = 'hidden';
    var first = wrap.querySelector('input');
    setTimeout(function () { if (first) first.focus(); }, 30);
  }
  function closeDispatch() {
    document.getElementById('dispatch').hidden = true;
    document.body.style.overflow = '';
    DISPATCH_SCN = null;
  }
  function doDispatch() {
    var s = DISPATCH_SCN; if (!s) return;
    var agent = document.getElementById('dispatchAgent').value;
    var values = dispatchValues();
    var missing = (s.inputs || []).filter(function (inp) { return !values[inp.key] || !values[inp.key].trim(); });
    if (missing.length) { setDispatchErr('Please fill in: ' + missing.map(function (m) { return m.label; }).join(', ')); return; }
    var btn = document.getElementById('dispatchGo');
    btn.disabled = true; setDispatchErr('');
    var payload = (s.custom || s.edited)
      ? { agent: agent, values: values, custom: { title: s.title, prompt: s.prompt, inputs: s.inputs || [] } }
      : { scenario: s.id, agent: agent, values: values };
    api('/api/agent/dispatch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { setDispatchErr((res.j && res.j.error) || 'Dispatch failed'); return; }
        try { localStorage.setItem(LAST_AGENT_KEY, agent); } catch (err) { /* ignore */ }
        closeDispatch();
        notify('Dispatched', 'Task sent to ' + agent + '. Check the newly opened terminal window.');
        markFirstRun();
        if (loaded.start) loadQuickStart();
      })
      .catch(function (e) { btn.disabled = false; setDispatchErr('Dispatch failed: ' + e); });
  }

  /* ---------- custom scenarios ---------- */
  var CUSTOM_KEY = 'bl.customScenarios';
  var OVERRIDE_KEY = 'bl.scenarioOverrides';
  var HIDDEN_KEY = 'bl.scenarioHidden';
  var SCN_EDIT_ID = null;
  var SCN_EDIT_KIND = null;
  function loadOverrides() {
    try { var o = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
  }
  function saveOverrides(o) { try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o)); } catch (e) {} }
  function loadHidden() {
    try { var a = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveHidden(a) { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(a)); } catch (e) {} }
  function isBuiltin(id) {
    for (var i = 0; i < BUILTIN_SCENARIOS.length; i++) { if (BUILTIN_SCENARIOS[i].id === id) return true; }
    return false;
  }
  function composeScenarios() {
    var ov = loadOverrides(), hidden = loadHidden();
    var builtins = BUILTIN_SCENARIOS
      .filter(function (s) { return hidden.indexOf(s.id) < 0; })
      .map(function (s) {
        var o = ov[s.id];
        if (!o) return s;
        return {
          id: s.id,
          title: o.title != null ? o.title : s.title,
          description: o.description != null ? o.description : s.description,
          category: o.category != null ? o.category : s.category,
          prompt: o.prompt != null ? o.prompt : s.prompt,
          inputs: Array.isArray(o.inputs) ? o.inputs : (s.inputs || []),
          edited: true
        };
      });
    return builtins.concat(loadCustomScenarios());
  }
  function loadCustomScenarios() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (s) { return s && s.id && s.title && s.prompt; }).map(function (s) {
        return {
          id: s.id, title: s.title, description: s.description || '',
          category: s.category || 'Custom', prompt: s.prompt,
          inputs: Array.isArray(s.inputs) ? s.inputs : [], custom: true
        };
      });
    } catch (e) { return []; }
  }
  function saveCustomScenarios(arr) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function refreshScenarioViews() {
    SCENARIOS = composeScenarios();
    renderScenarioFilters();
    renderScenarios();
  }
  function scnInputRow(inp) {
    var row = el('div', 'scn-input-row');
    var k = el('input'); k.className = 'scn-k'; k.placeholder = 'key'; k.autocomplete = 'off'; k.spellcheck = false;
    var l = el('input'); l.className = 'scn-l'; l.placeholder = 'label'; l.autocomplete = 'off'; l.spellcheck = false;
    var p = el('input'); p.className = 'scn-p'; p.placeholder = 'placeholder (optional)'; p.autocomplete = 'off'; p.spellcheck = false;
    if (inp) { k.value = inp.key || ''; l.value = inp.label || ''; p.value = inp.placeholder || ''; }
    var del = el('button', 'btn-mini', '\u00d7'); del.type = 'button'; del.title = 'Remove'; del.onclick = function () { row.remove(); };
    row.appendChild(k); row.appendChild(l); row.appendChild(p); row.appendChild(del);
    return row;
  }
  function addScnInputRow(inp) { document.getElementById('scnInputRows').appendChild(scnInputRow(inp)); }
  function setScnErr(m) { document.getElementById('scnDrawerErr').textContent = m || ''; }
  function fillScnCatList() {
    var dl = document.getElementById('scnCatList'); dl.innerHTML = '';
    scenarioCategories().forEach(function (c) { var o = document.createElement('option'); o.value = c; dl.appendChild(o); });
  }
  function openScnDrawer(existing) {
    SCN_EDIT_ID = existing ? existing.id : null;
    SCN_EDIT_KIND = existing ? (existing.custom ? 'custom' : 'builtin') : 'new';
    var isEdit = !!existing;
    document.getElementById('scnDrawerTitle').textContent = isEdit ? (existing.custom ? 'Edit scenario' : 'Edit preset scenario') : 'Custom scenario';
    document.getElementById('scnTitle').value = existing ? existing.title : '';
    document.getElementById('scnCategory').value = existing ? (existing.category || '') : 'Custom';
    document.getElementById('scnDesc').value = existing ? (existing.description || '') : '';
    document.getElementById('scnPrompt').value = existing ? existing.prompt : '';
    var rows = document.getElementById('scnInputRows'); rows.innerHTML = '';
    ((existing && existing.inputs) || []).forEach(function (inp) { addScnInputRow(inp); });
    fillScnCatList();
    var del = document.getElementById('scnDelete');
    del.hidden = !isEdit;
    del.textContent = 'Delete';
    setScnErr('');
    document.getElementById('scnDrawer').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { document.getElementById('scnTitle').focus(); }, 30);
  }
  function closeScnDrawer() {
    document.getElementById('scnDrawer').hidden = true;
    document.body.style.overflow = '';
    SCN_EDIT_ID = null;
    SCN_EDIT_KIND = null;
  }
  function collectScnInputs() {
    var out = [], seen = {};
    var rows = document.getElementById('scnInputRows').querySelectorAll('.scn-input-row');
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].querySelector('.scn-k').value.trim();
      if (!key) continue;
      if (!/^[a-zA-Z0-9_]+$/.test(key)) return { error: 'Input key "' + key + '" may only use letters, digits, underscore.' };
      if (seen[key]) return { error: 'Duplicate input key: ' + key };
      seen[key] = 1;
      var label = rows[i].querySelector('.scn-l').value.trim() || key;
      var ph = rows[i].querySelector('.scn-p').value.trim();
      var o = { key: key, label: label }; if (ph) o.placeholder = ph;
      out.push(o);
    }
    return { inputs: out };
  }
  function saveScnDrawer() {
    var title = document.getElementById('scnTitle').value.trim();
    var prompt = document.getElementById('scnPrompt').value.trim();
    if (!title) { setScnErr('Title is required.'); return; }
    if (!prompt) { setScnErr('Prompt template is required.'); return; }
    var res = collectScnInputs();
    if (res.error) { setScnErr(res.error); return; }
    var cat = document.getElementById('scnCategory').value.trim() || 'Custom';
    var desc = document.getElementById('scnDesc').value.trim();
    if (SCN_EDIT_KIND === 'builtin' && SCN_EDIT_ID && isBuiltin(SCN_EDIT_ID)) {
      var ov = loadOverrides();
      ov[SCN_EDIT_ID] = { title: title, description: desc, category: cat, prompt: prompt, inputs: res.inputs };
      saveOverrides(ov);
    } else {
      var scn = {
        id: SCN_EDIT_ID || ('custom-' + Date.now().toString(36)),
        title: title, description: desc, category: cat, prompt: prompt, inputs: res.inputs, custom: true
      };
      var arr = loadCustomScenarios(), idx = -1;
      for (var i = 0; i < arr.length; i++) { if (arr[i].id === scn.id) { idx = i; break; } }
      if (idx >= 0) arr[idx] = scn; else arr.push(scn);
      saveCustomScenarios(arr);
    }
    closeScnDrawer();
    refreshScenarioViews();
  }
  function deleteScnDrawer() {
    if (!SCN_EDIT_ID) return;
    var id = SCN_EDIT_ID;
    if (SCN_EDIT_KIND === 'builtin' && isBuiltin(id)) {
      var hidden = loadHidden();
      if (hidden.indexOf(id) < 0) hidden.push(id);
      saveHidden(hidden);
      var ov = loadOverrides();
      if (ov[id]) { delete ov[id]; saveOverrides(ov); }
    } else {
      saveCustomScenarios(loadCustomScenarios().filter(function (s) { return s.id !== id; }));
    }
    closeScnDrawer();
    refreshScenarioViews();
  }

  /* ---------- assets ---------- */
  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  function fmtTime(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function assetIcon(kind) {
    if (kind === 'audio') return '\uD83C\uDFB5';
    if (kind === 'video') return '\uD83C\uDFAC';
    if (kind === 'image') return '\uD83D\uDDBC';
    return '\uD83D\uDCC4';
  }
  function assetKindLabel(kind) {
    if (kind === 'image') return 'Image';
    if (kind === 'video') return 'Video';
    if (kind === 'audio') return 'Audio';
    return 'File';
  }

  function fmtDim(w, h) { return w && h ? w + ' \u00d7 ' + h : ''; }
  function assetFolder(rel) {
    if (!rel) return '';
    var norm = String(rel).replace(/\\\\/g, '/');
    var i = norm.lastIndexOf('/');
    return i > 0 ? norm.slice(0, i) : '';
  }
  function setDim(span, a, w, h) {
    var t = fmtDim(w, h);
    if (!t) return;
    a.dim = t;
    span.textContent = t;
    span.hidden = false;
  }
  function wireDim(mediaEl, a, span) {
    if (a.dim) { span.textContent = a.dim; span.hidden = false; return; }
    if (a.kind === 'image') {
      if (mediaEl.complete && mediaEl.naturalWidth) setDim(span, a, mediaEl.naturalWidth, mediaEl.naturalHeight);
      else mediaEl.addEventListener('load', function () { setDim(span, a, mediaEl.naturalWidth, mediaEl.naturalHeight); });
    } else if (a.kind === 'video') {
      if (mediaEl.videoWidth) setDim(span, a, mediaEl.videoWidth, mediaEl.videoHeight);
      else mediaEl.addEventListener('loadedmetadata', function () { setDim(span, a, mediaEl.videoWidth, mediaEl.videoHeight); });
    }
  }

  function loadAssets() {
    loaded.assets = true;
    var body = document.getElementById('assetsBody');
    api('/api/assets').then(function (r) { return r.json(); }).then(function (j) {
      ASSETS = j.assets || [];
      setCount('assets', ASSETS.length);
      var baseEl = document.getElementById('assetsBase');
      if (baseEl) baseEl.textContent = j.base ? '— ' + j.base : '';
      renderAssetFilters();
      renderAssets();
    }).catch(function (e) { renderError(body, e); });
  }

  function renderAssetFilters() {
    var bar = document.getElementById('assetFilters');
    bar.innerHTML = '';
    var counts = { all: ASSETS.length };
    ASSETS.forEach(function (a) { counts[a.kind] = (counts[a.kind] || 0) + 1; });
    var tabs = [['all', 'All']].concat(
      [['image', 'Images'], ['video', 'Videos'], ['audio', 'Audio'], ['other', 'Files']]
        .filter(function (t) { return counts[t[0]]; })
    );
    tabs.forEach(function (t) {
      var cat = t[0];
      var b = el('button', 'filter' + (cat === ASSET_FILTER ? ' is-active' : ''));
      b.appendChild(el('span', '', t[1]));
      b.appendChild(el('span', 'n', String(counts[cat] || 0)));
      b.onclick = function () { ASSET_FILTER = cat; ASSET_PAGE = 1; renderAssetFilters(); renderAssets(); };
      bar.appendChild(b);
    });
    var sort = el('button', 'filter sort-toggle');
    sort.title = 'Toggle sort by generation time';
    sort.textContent = ASSET_SORT === 'new' ? '↓ Newest first' : '↑ Oldest first';
    sort.onclick = function () { ASSET_SORT = ASSET_SORT === 'new' ? 'old' : 'new'; ASSET_PAGE = 1; renderAssetFilters(); renderAssets(); };
    bar.appendChild(sort);
  }

  function assetMatches(a, q) {
    return matchQ(a.name, q) || matchQ(a.relPath, q) || matchQ(a.ext, q) || matchQ(assetKindLabel(a.kind), q);
  }
  function renderAssets() {
    var body = document.getElementById('assetsBody');
    var pager = document.getElementById('assetsPager');
    if (!ASSETS.length) {
      pager.innerHTML = '';
      renderEmpty(body, 'No generated assets yet.', 'Assets from <code>bl image</code>, <code>bl video</code>, <code>bl speech</code> and <code>bl omni</code> will appear here.');
      return;
    }
    var list = ASSET_FILTER === 'all' ? ASSETS : ASSETS.filter(function (a) { return a.kind === ASSET_FILTER; });
    list = list.filter(function (a) { return assetMatches(a, ASSET_Q); });
    list = list.slice().sort(function (a, b) { return ASSET_SORT === 'new' ? b.mtime - a.mtime : a.mtime - b.mtime; });
    if (!list.length) {
      pager.innerHTML = '';
      renderEmpty(body, ASSET_Q ? 'No assets match "' + ASSET_Q + '".' : 'No assets in this category.', '');
      return;
    }
    var info = pageSlice(list, ASSET_PAGE, getPageSize('assets')); ASSET_PAGE = info.page;
    body.innerHTML = '';
    var grid = el('div', 'asset-grid');
    info.items.forEach(function (a) {
      var card = el('div', 'asset');
      card.onclick = function () { openAssetDetail(a); };
      var media = el('div', 'asset-media');
      var src = '/api/asset/file?path=' + encodeURIComponent(a.relPath) + '&token=' + encodeURIComponent(token);
      var mediaEl = null;
      if (a.kind === 'image') {
        var img = el('img'); img.src = src; img.loading = 'lazy'; img.alt = a.name;
        img.title = 'View details';
        media.appendChild(img); mediaEl = img;
      } else if (a.kind === 'video') {
        var vid = el('video'); vid.src = src; vid.controls = true; vid.preload = 'metadata';
        vid.onclick = function (e) { e.stopPropagation(); };
        media.appendChild(vid); mediaEl = vid;
      } else if (a.kind === 'audio') {
        var au = el('audio'); au.src = src; au.controls = true; au.preload = 'none';
        au.onclick = function (e) { e.stopPropagation(); };
        media.appendChild(au);
      } else {
        var icon = el('span', 'asset-icon', assetIcon(a.kind));
        icon.title = 'View details';
        media.appendChild(icon);
      }
      card.appendChild(media);
      card.appendChild(el('span', 'asset-cat', assetKindLabel(a.kind)));
      var del = el('button', 'asset-del', '×'); del.title = 'Delete';
      del.onclick = function (e) { e.stopPropagation(); deleteAsset(a); };
      card.appendChild(del);
      var b = el('div', 'asset-body');
      var nm = el('div', 'asset-name link', a.name); nm.title = 'View details — ' + a.relPath;
      b.appendChild(nm);
      var folder = assetFolder(a.relPath);
      if (folder) {
        var fol = el('div', 'asset-folder', folder); fol.title = folder;
        b.appendChild(fol);
      }
      var meta = el('div', 'asset-meta');
      meta.appendChild(el('span', '', fmtTime(a.mtime)));
      if (a.ext) meta.appendChild(el('span', 'chip', a.ext));
      if (a.kind === 'image' || a.kind === 'video') {
        var dimSpan = el('span', 'chip', ''); dimSpan.hidden = true;
        if (mediaEl) wireDim(mediaEl, a, dimSpan);
        meta.appendChild(dimSpan);
      }
      meta.appendChild(el('span', '', fmtBytes(a.size)));
      b.appendChild(meta);
      card.appendChild(b);
      grid.appendChild(card);
    });
    body.appendChild(grid);
    renderPager('assetsPager', info, 'assets', function (p) { ASSET_PAGE = p; renderAssets(); });
  }

  function openAsset(a) {
    api('/api/asset/open?path=' + encodeURIComponent(a.relPath), { method: 'POST' }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'error'); });
    }).catch(function (e) { notify('Open failed', String(e)); });
  }

  function openAssetDetail(a) {
    var title = document.getElementById('infoTitle');
    title.textContent = '';
    title.appendChild(el('span', '', a.name));
    var body = document.getElementById('infoBody');
    body.innerHTML = '';
    var src = '/api/asset/file?path=' + encodeURIComponent(a.relPath) + '&token=' + encodeURIComponent(token);
    var prev = el('div', 'detail-preview');
    var mediaEl = null;
    if (a.kind === 'image') { var img = el('img'); img.src = src; img.alt = a.name; prev.appendChild(img); mediaEl = img; }
    else if (a.kind === 'video') { var vid = el('video'); vid.src = src; vid.controls = true; vid.preload = 'metadata'; prev.appendChild(vid); mediaEl = vid; }
    else if (a.kind === 'audio') { var au = el('audio'); au.src = src; au.controls = true; prev.appendChild(au); }
    else { prev.appendChild(el('span', 'asset-icon-lg', assetIcon(a.kind))); }
    body.appendChild(prev);
    body.appendChild(detailSection('Type', el('div', 'detail-desc', assetKindLabel(a.kind))));
    var chips = el('div', 'detail-chips');
    if (a.ext) chips.appendChild(el('span', 'chip', a.ext));
    if (a.kind === 'image' || a.kind === 'video') {
      var dimChip = el('span', 'chip', ''); dimChip.hidden = true;
      if (mediaEl) wireDim(mediaEl, a, dimChip);
      chips.appendChild(dimChip);
    }
    chips.appendChild(el('span', 'chip', fmtBytes(a.size)));
    chips.appendChild(el('span', 'chip', fmtTime(a.mtime)));
    body.appendChild(detailSection('Details', chips));
    body.appendChild(detailSection('Path', el('div', 'detail-path', a.relPath)));
    openInfoDrawer();
    var openBtn = el('button', 'btn-primary', 'Open locally');
    openBtn.onclick = function () { openAsset(a); };
    var delBtn = el('button', 'btn-danger', 'Delete');
    delBtn.onclick = function () { deleteAsset(a, true); };
    var foot = document.getElementById('infoFoot');
    foot.appendChild(openBtn); foot.appendChild(delBtn);
    foot.hidden = false;
  }

  function deleteAsset(a, fromDrawer) {
    openConfirm({
      title: 'Delete asset',
      message: 'Delete asset "' + a.name + '"? This removes the file from disk.',
      okLabel: 'Delete asset',
      onConfirm: function () {
        api('/api/asset?path=' + encodeURIComponent(a.relPath), { method: 'DELETE' }).then(function (r) {
          if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'error'); });
          return r.json();
        }).then(function () {
          ASSETS = ASSETS.filter(function (x) { return x.relPath !== a.relPath; });
          setCount('assets', ASSETS.length);
          if (fromDrawer) closeInfoDrawer();
          renderAssetFilters();
          renderAssets();
        }).catch(function (e) { notify('Delete failed', String(e)); });
      }
    });
  }

  /* ---------- wiring ---------- */
  var navItems = document.querySelectorAll('.nav-item');
  for (var n = 0; n < navItems.length; n++) {
    navItems[n].onclick = function () { showView(this.getAttribute('data-view')); };
  }
  (function () {
    var sidebar = document.getElementById('sidebar');
    var toggle = document.getElementById('sidebarToggle');
    if (!sidebar || !toggle) return;
    function apply(collapsed) {
      sidebar.classList.toggle('is-collapsed', collapsed);
      var label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
    var collapsed = false;
    try { collapsed = localStorage.getItem(SIDEBAR_KEY) === '1'; } catch (e) { /* ignore */ }
    apply(collapsed);
    toggle.onclick = function () {
      collapsed = !collapsed;
      apply(collapsed);
      try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    };
  })();
  document.getElementById('saveBtn').onclick = save;
  document.getElementById('useBtn').onclick = saveAndActivateProfile;
  document.getElementById('deleteBtn').onclick = deleteProfile;
  document.getElementById('closeBtn').onclick = closeDrawer;
  document.getElementById('drawer').onclick = function (e) { if (e.target === this) closeDrawer(); };
  document.getElementById('infoClose').onclick = closeInfoDrawer;
  document.getElementById('infoDrawer').onclick = function (e) { if (e.target === this) closeInfoDrawer(); };
  document.getElementById('modalCancel').onclick = closeModal;
  document.getElementById('modalCreate').onclick = submitNewProfile;
  document.getElementById('modal').onclick = function (e) { if (e.target === this) closeModal(); };
  document.getElementById('modalInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitNewProfile(); }
  });
  document.getElementById('confirmCancel').onclick = closeConfirm;
  document.getElementById('confirmOk').onclick = confirmOk;
  document.getElementById('confirm').onclick = function (e) { if (e.target === this) closeConfirm(); };
  document.getElementById('dispatchCancel').onclick = closeDispatch;
  document.getElementById('dispatchGo').onclick = doDispatch;
  document.getElementById('dispatch').onclick = function (e) { if (e.target === this) closeDispatch(); };
  document.getElementById('customScnBtn').onclick = function () { openScnDrawer(null); };
  document.getElementById('addMcpBtn').onclick = function () { openMcpCreate(); };
  document.getElementById('addSkillBtn').onclick = function () { openSkillInstall(); };
  document.getElementById('scnDrawerClose').onclick = closeScnDrawer;
  document.getElementById('scnDrawerSave').onclick = saveScnDrawer;
  document.getElementById('scnAddInput').onclick = function () { addScnInputRow(); };
  document.getElementById('scnDelete').onclick = deleteScnDrawer;
  document.getElementById('scnDrawer').onclick = function (e) { if (e.target === this) closeScnDrawer(); };
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('confirm').hidden) closeConfirm();
    else if (!document.getElementById('dispatch').hidden) closeDispatch();
    else if (!document.getElementById('scnDrawer').hidden) closeScnDrawer();
    else if (!document.getElementById('acctMenu').hidden) closeAcctMenu();
    else if (!document.getElementById('modal').hidden) closeModal();
    else if (!document.getElementById('infoDrawer').hidden) closeInfoDrawer();
    else if (!document.getElementById('drawer').hidden) closeDrawer();
  });
  initSessionFooter();
  initAccount();
  initSearches();
  loadConfig();
  loadPlayground();

  function initSessionFooter() {
    var url = location.href;
    var img = document.getElementById('qrImg');
    img.src = '/api/qr?token=' + encodeURIComponent(token) + '&data=' + encodeURIComponent(url);
    var link = document.getElementById('urlLink');
    link.href = url; link.textContent = url; link.title = url;
    var btn = document.getElementById('copyUrl');
    btn.onclick = function () {
      var done = function () {
        btn.textContent = 'Copied'; btn.classList.add('copied');
        setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url); done(); });
      } else { fallbackCopy(url); done(); }
    };
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function authMethodLabel(p) {
    if (p === 'console') return 'Console gateway';
    if (p === 'apiKey') return 'API key';
    if (p === 'openapi') return 'OpenAPI (AK/SK)';
    return 'Account';
  }
  function acctHue(seed) {
    var h = 0, s = seed || 'bl';
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 360; }
    return h;
  }
  function avatarStyle(seed) {
    var h = acctHue(seed);
    return 'linear-gradient(135deg, hsl(' + h + ' 68% 56%), hsl(' + ((h + 40) % 360) + ' 68% 46%))';
  }
  function initAccount() {
    document.getElementById('loginBtn').onclick = startLogin;
    document.getElementById('logoutBtn').onclick = doLogout;
    document.getElementById('avatarBtn').onclick = function (e) { e.stopPropagation(); toggleAcctMenu(); };
    document.getElementById('acctMenu').onclick = function (e) { e.stopPropagation(); };
    document.addEventListener('click', function () { closeAcctMenu(); });
    loadAuthStatus().then(function (st) {
      if (AUTO_START_CHECKED) return;
      AUTO_START_CHECKED = true;
      if (st && !st.authenticated) showView('start');
    });
  }
  function loadAuthStatus() {
    return api('/api/auth/status').then(function (r) { return r.json(); }).then(function (st) {
      AUTH = st; renderAccount(st); return st;
    }).catch(function () { return null; });
  }
  function renderAccount(st) {
    var wrap = document.getElementById('account');
    var loginBtn = document.getElementById('loginBtn');
    var avatar = document.getElementById('avatarBtn');
    wrap.hidden = false;
    if (st && st.authenticated) {
      loginBtn.hidden = true;
      var seed = st.masked || st.primary || st.site || 'bl';
      avatar.hidden = false;
      setAvatar(avatar, seed);
      avatar.title = authMethodLabel(st.primary);
      var lg = document.getElementById('acctAvatarLg');
      setAvatar(lg, seed);
      document.getElementById('acctMethod').textContent = authMethodLabel(st.primary);
      var meta = [];
      if (st.region) meta.push(st.region);
      if (st.site) meta.push(st.site);
      document.getElementById('acctMeta').textContent = meta.join(' · ') || 'Authenticated';
      var tok = document.getElementById('acctToken');
      tok.textContent = st.masked || '';
      tok.hidden = !st.masked;
    } else {
      avatar.hidden = true;
      closeAcctMenu();
      loginBtn.hidden = false;
      loginBtn.disabled = false;
      loginBtn.querySelector('span').textContent = 'Log in';
    }
  }
  function toggleAcctMenu() {
    var m = document.getElementById('acctMenu');
    var willOpen = m.hidden;
    m.hidden = !willOpen;
    document.getElementById('avatarBtn').setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }
  function closeAcctMenu() {
    var m = document.getElementById('acctMenu');
    if (m && !m.hidden) {
      m.hidden = true;
      document.getElementById('avatarBtn').setAttribute('aria-expanded', 'false');
    }
  }
  function setLoginUi(busy, label) {
    var b = document.getElementById('loginBtn');
    if (b) { b.disabled = busy; b.querySelector('span').textContent = label; }
    if (QS_LOGIN_BTN && document.body.contains(QS_LOGIN_BTN)) { QS_LOGIN_BTN.disabled = busy; QS_LOGIN_BTN.textContent = label; }
  }
  function startLogin() {
    setLoginUi(true, 'Opening browser…');
    api('/api/auth/login', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.started) {
        setLoginUi(true, 'Waiting for login…');
        pollAuth();
      } else {
        setLoginUi(false, 'Log in');
      }
    }).catch(function () {
      setLoginUi(false, 'Log in');
    });
  }
  function pollAuth() {
    if (authPoll) clearInterval(authPoll);
    var tries = 0;
    authPoll = setInterval(function () {
      tries++;
      loadAuthStatus().then(function (st) {
        if (st && st.authenticated) {
          clearInterval(authPoll); authPoll = null;
          // Reload so every view reflects the freshly stored credentials
          // (Profiles, base_url, console fields). Same effect as a restart, but
          // keeps the session token in the URL and the server process alive.
          setLoginUi(true, 'Signed in…');
          location.reload();
        } else if (tries >= 150) {
          clearInterval(authPoll); authPoll = null;
          setLoginUi(false, 'Log in');
          notify('Login timed out', 'The login was not completed in time. Click "Log in" to try again.');
        }
      });
    }, 2500);
  }
  function doLogout() {
    closeAcctMenu();
    // Reload after logout so every view reflects the cleared credentials
    // (Profiles, base_url, console fields), keeping the session token in the URL.
    api('/api/auth/logout', { method: 'POST' }).then(function () { location.reload(); }).catch(function () { loadAuthStatus(); });
  }
</script>
</body>
</html>
`;
