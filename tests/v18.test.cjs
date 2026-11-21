const assert = require("node:assert/strict");
const Engine = require("../src/engine.js");
const Chronicle = require("../src/chronicle.js");

const level = {
  id: "T18", title: "测试世界",
  nodes: [
    { id: 0, name: "分岔站", x: 0, y: 0 },
    { id: 1, name: "桥址", x: 100, y: 0 },
    { id: 2, name: "能源井", x: 0, y: 100 },
    { id: 3, name: "远端出口", x: 100, y: 100 }
  ],
  edges: [[0, 1, "B"], [0, 2, "P"], [1, 3, "B"]],
  stations: [[0, ["B", 0], ["P", 1]]],
  goal: 3,
  relics: [2],
  gates: { "2": [{ type: "P", sources: [1] }] }
};

const initial = Engine.initial(level);
const untouched = JSON.stringify(initial);
const pending = Chronicle.build(level, initial, [], [initial]);
assert.equal(pending.pendingCount, 1);
assert.equal(pending.selectedCount, 0);
assert.equal(pending.stations[0].branches[0].abilityType, "B");
assert.equal(pending.stations[0].branches[0].facilityType, "P");
assert.equal(pending.stations[0].branches[0].facilityEdge, 1);
assert.deepEqual(pending.stations[0].branches[0].impacts.map(x => x.edge), [1, 2]);
assert.equal(pending.stations[0].branches[0].remoteImpacts.length, 1);
assert.equal(pending.stations[0].branches[0].remoteImpacts[0].beforeText, "桥梁 ×1 + 能源 ×1");
assert.equal(pending.stations[0].branches[0].remoteImpacts[0].afterText, "桥梁 ×1");
assert.equal(pending.stations[0].branches[1].abilityType, "P");
assert.equal(pending.stations[0].branches[1].facilityType, "B");
assert.deepEqual(pending.stations[0].branches[1].impacts.map(x => x.edge), [0]);
assert.equal(JSON.stringify(initial), untouched, "chronicle must not mutate the live state");

const chosenAction = { kind: "choose", index: 0, option: 0 };
const chosenState = Engine.step(level, initial, chosenAction).state;
const chosenHistory = [initial, chosenState];
const actual = Chronicle.build(level, chosenState, [chosenAction], chosenHistory);
assert.equal(actual.selectedCount, 1);
assert.equal(actual.pendingCount, 0);
assert.equal(actual.stations[0].selectedOption, 0);
assert.equal(actual.stations[0].decisionStep, 0);
assert.equal(actual.stations[0].branches[0].impacts.length, 2);
assert.equal(actual.stations[0].branches[1].facilityType, "B");

const mergedLevel = {
  ...level,
  nodes: [...level.nodes, { id: 4, name: "第二分岔", x: 200, y: 0 }],
  edges: [...level.edges, [1, 4, "B"]],
  stations: [...level.stations, [1, ["B", 0], ["P", 1]]]
};
const afterFirst = Engine.step(mergedLevel, Engine.initial(mergedLevel), { kind: "choose", index: 0, option: 0 }).state;
const secondArchive = Chronicle.build(mergedLevel, afterFirst,
  [{ kind: "choose", index: 0, option: 0 }],
  [Engine.initial(mergedLevel), afterFirst]);
assert.equal(secondArchive.stations[1].branches[0].merged, true);
assert.equal(secondArchive.stations[1].branches[0].impacts.some(x => x.edge === 1), false);

assert.equal(Chronicle.costText([0, 0, 0]), "免费");
assert.equal(Chronicle.costText([1, 2, 0]), "桥梁 ×1 + 能源 ×2");
assert.equal(Chronicle.evaluate(level, initial, 99, 0).ok, false);
console.log("V1.8 Chronicle tests: 18 assertions passed.");
