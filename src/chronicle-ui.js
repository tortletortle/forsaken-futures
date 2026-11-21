/* Presentation layer for the counterfactual archive and compact research index. */
const ChronicleUI = (() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const symbols = { B: "▰", P: "ϟ", W: "◈" };

  function impactMarkup(branch) {
    if (!branch.ok) return '<p class="chronicle-muted">此分支暂时无法计算：当前关卡可能已经完成，或缺少对应的历史决策记录。</p>';
    if (!branch.impacts.length) return '<p class="chronicle-muted">该设施已由其他选择提供；这次选择不会额外降低通行消耗。</p>';
    const visible = branch.impacts.slice(0, 3);
    const extra = branch.impacts.length - visible.length;
    const rows = visible.map(item =>
      '<li><span>' + esc(item.name) + '</span><b>' + esc(item.beforeText) + ' → ' + esc(item.afterText) + '</b></li>'
    ).join("");
    return '<ul class="chronicle-impact-list">' + rows + '</ul>' +
      (extra > 0 ? '<p class="chronicle-muted">另有 ' + extra + ' 条通道的消耗发生变化。</p>' : "");
  }

  function branchMarkup(station, branch) {
    const actual = station.selectedOption === branch.option;
    const label = station.selectedOption >= 0
      ? (actual ? "已发生" : "未发生的分支")
      : "可能的未来";
    const typeName = Chronicle.names[branch.abilityType] || branch.abilityType;
    const facilityName = Chronicle.names[branch.facilityType] || branch.facilityType;
    const remote = branch.remoteImpacts ? branch.remoteImpacts.length : 0;
    const stateClass = actual ? "is-actual" : "is-counterfactual";
    const mergeNote = branch.merged
      ? '<p class="chronicle-muted">该设施已存在；本次来源将合并记录，不重复叠加效果。</p>'
      : "";
    return '<article class="chronicle-branch ' + stateClass + '">' +
      '<div class="chronicle-branch-top"><span>未来 ' + (branch.option === 0 ? "A" : "B") + '</span><b>' + label + '</b></div>' +
      '<div class="chronicle-outcome"><span class="chronicle-symbol">' + (symbols[branch.abilityType] || "◇") + '</span><div><small>带走的未来</small><strong>' + esc(typeName) + '能力 ×1</strong></div></div>' +
      '<div class="chronicle-outcome"><span class="chronicle-symbol">' + (symbols[branch.facilityType] || "◇") + '</span><div><small>凝结成的世界</small><strong>' + esc(facilityName) + '设施</strong><small>' + esc(branch.facilityName) + '</small></div></div>' +
      '<div class="chronicle-impact"><small>世界影响' + (branch.ok ? ' · ' + branch.impacts.length + ' 条通道变化 · ' + remote + ' 条远端共鸣' : "") + '</small>' + impactMarkup(branch) + '</div>' +
      '<button class="chronicle-locate" type="button" data-chronicle-focus="' + station.index + ':' + branch.option + '">在航图中定位这条未来</button>' +
      mergeNote +
      '</article>';
  }

  function render() {
    const root = $("chronicle-cards");
    if (!root || typeof level === "undefined" || typeof state === "undefined") return;
    const archive = Chronicle.build(level, state, log, history);
    const summary = $("chronicle-summary");
    if (summary) summary.textContent =
      "已编织 " + archive.selectedCount + " / " + archive.stations.length +
      " · 尚有 " + archive.pendingCount + " 个未来";
    root.innerHTML = archive.stations.map(station =>
      '<section class="chronicle-station">' +
        '<header class="chronicle-station-head"><div><small>分岔 S' + (station.index + 1) + '</small><strong>' + esc(station.nodeName) + '</strong></div>' +
        '<span class="chronicle-state ' + (station.selectedOption >= 0 ? "is-done" : "") + '">' +
          (station.selectedOption >= 0 ? "已作出选择" : "尚未抵达 / 待决定") + '</span></header>' +
        '<div class="chronicle-branches">' + station.branches.map(branch => branchMarkup(station, branch)).join("") + '</div>' +
      '</section>'
    ).join("") || '<p class="chronicle-muted">本关没有可记录的未来分岔。</p>';
  }

  function focusFuture(stationIndex, option) {
    const station = level.stations[stationIndex];
    if (!station) return;
    const edge = station[2 - option][1];
    const group = document.querySelector('#world [data-edge="' + edge + '"]');
    const node = document.querySelector('#world [data-node="' + station[0] + '"]');
    document.querySelectorAll("#world .chronicle-focus, #world .chronicle-node-focus").forEach(el => {
      el.classList.remove("chronicle-focus", "chronicle-node-focus");
    });
    if (group) {
      group.classList.remove("chronicle-focus");
      void group.getBoundingClientRect();
      group.classList.add("chronicle-focus");
      group.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
    if (node) node.classList.add("chronicle-node-focus");
  }

  function init() {
    const research = $("research-dialog");
    $("research-open")?.addEventListener("click", () => research?.showModal());
    $("research-close")?.addEventListener("click", () => research?.close());
    research?.addEventListener("click", event => {
      if (event.target.closest(".research-actions button")) research.close();
    }, true);
    $("chronicle-cards")?.addEventListener("click", event => {
      const button = event.target.closest("[data-chronicle-focus]");
      if (!button) return;
      const parts = button.dataset.chronicleFocus.split(":").map(Number);
      focusFuture(parts[0], parts[1]);
    });
  }

  return { init, render, focusFuture };
})();
