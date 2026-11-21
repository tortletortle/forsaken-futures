/* Counterfactual decision archive. Pure state analysis; never mutates the live game state. */
const ChronicleEngine = typeof Engine !== "undefined" ? Engine : require("./engine.js");
const Chronicle = (() => {
  const names = { B: "桥梁", P: "能源", W: "重力" };
  const copyState = s => ({
    node: s.node,
    inventory: [...s.inventory],
    choices: [...s.choices],
    relicMask: s.relicMask
  });
  const edgeName = (level, index) => {
    const edge = level.edges[index];
    if (!edge) return "未知通道 E" + (index + 1);
    return level.nodes[edge[0]].name + " ↔ " + level.nodes[edge[1]].name;
  };
  const costText = cost => {
    const types = ["B", "P", "W"];
    const parts = cost.map((n, i) => n ? names[types[i]] + " ×" + n : "").filter(Boolean);
    return parts.length ? parts.join(" + ") : "免费";
  };

  function evaluate(level, baseState, stationIndex, option) {
    const station = level.stations[stationIndex];
    if (!station || ![0, 1].includes(option)) return { ok: false, reason: "INVALID_STATION" };
    const ability = station[1 + option];
    const facility = station[2 - option];
    const base = copyState(baseState);
    base.node = station[0];
    const merged = ChronicleEngine.echoes(level, base).has(facility[1]);
    const result = ChronicleEngine.step(level, base, { kind: "choose", index: stationIndex, option });
    const common = {
      option,
      abilityType: ability[0],
      facilityType: facility[0],
      facilityEdge: facility[1],
      facilityName: edgeName(level, facility[1]),
      merged,
      impacts: [],
      remoteImpacts: []
    };
    if (!result.ok) return { ...common, ok: false, reason: result.reason };

    for (let edge = 0; edge < level.edges.length; edge++) {
      const before = ChronicleEngine.moveCost(level, base, edge);
      const after = ChronicleEngine.moveCost(level, result.state, edge);
      if (before.some((value, i) => value !== after[i])) {
        const impact = {
          edge,
          name: edgeName(level, edge),
          before,
          after,
          beforeText: costText(before),
          afterText: costText(after),
          saved: before.reduce((n, value, i) => n + Math.max(0, value - after[i]), 0)
        };
        common.impacts.push(impact);
        if (edge !== facility[1]) common.remoteImpacts.push(impact);
      }
    }
    return { ...common, ok: true, addedSupport: common.impacts.length > 0, resultingState: result.state };
  }

  function build(level, state, log = [], history = []) {
    const stations = level.stations.map((station, index) => {
      const selectedOption = Number.isInteger(state.choices[index]) ? state.choices[index] : -1;
      const decisionStep = selectedOption >= 0
        ? log.findIndex(action => action.kind === "choose" && action.index === index)
        : -1;
      let baseState = null;
      let source = "current-world-projection";
      if (selectedOption >= 0 && decisionStep >= 0 && history[decisionStep]) {
        baseState = copyState(history[decisionStep]);
        source = "recorded-decision-state";
      } else if (selectedOption < 0) {
        baseState = copyState(state);
        baseState.node = station[0];
      }
      const branches = [0, 1].map(option => {
        const evaluated = baseState
          ? evaluate(level, baseState, index, option)
          : { ok: false, reason: "HISTORY_UNAVAILABLE", option };
        const ability = station[1 + option];
        const facility = station[2 - option];
        return {
          ...evaluated,
          option,
          abilityType: ability[0],
          facilityType: facility[0],
          facilityEdge: facility[1],
          facilityName: edgeName(level, facility[1])
        };
      });
      return {
        index,
        node: station[0],
        nodeName: level.nodes[station[0]].name,
        selectedOption,
        decisionStep,
        source,
        branches
      };
    });
    return {
      stations,
      selectedCount: stations.filter(station => station.selectedOption >= 0).length,
      pendingCount: stations.filter(station => station.selectedOption < 0).length,
      facilities: ChronicleEngine.entities(level, state)
    };
  }

  return { build, evaluate, edgeName, costText, names };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Chronicle;
