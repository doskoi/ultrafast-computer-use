import { JevPolicy, snapshotFromAccessibility } from "../dist/index.js";

const snapshot = snapshotFromAccessibility("Preview", `AXWindow "Reports"
  AXButton "Open report" [element_index=17]
  AXButton "Settings" [element_index=24]
  AXScrollArea "Report list" [element_index=51]`);

const decision = await new JevPolicy().decide(
  snapshot,
  "Open the report. Stop when the report content is visible.",
  [],
);

console.log(JSON.stringify(decision, null, 2));
