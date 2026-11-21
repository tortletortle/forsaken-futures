# 未被选择的世界 / Forsaken Futures

V1.8 development branch: counterfactual decision archive and a cleaner separation between the main game and research tools.

## Run

Run python build.py, then open dist/index.html in a browser. The game has no external API dependency.

Run the focused V1.8 logic tests with node tests/v18.test.cjs.

## V1.8 changes

- Compare both possible outcomes at every future station: the portable ability gained and the permanent facility left behind.
- Show direct and remote gate-cost changes caused by each facility.
- Reconstruct already-made decisions from their pre-choice history state.
- Locate a branch's facility edge and station on the world map.
- Move 14 research-lab launchers into one grouped Research Archive dialog without changing their DOM IDs.

## Verification boundary

The focused V1.8 Node tests cover counterfactual evaluation and state immutability. Full build, Chromium/browser regression, mobile-device testing, and human playtesting remain pending. See DESIGN_V18.md, TEST_REPORT_V18.md, and REGRESSION_REPORT_V18.md.
