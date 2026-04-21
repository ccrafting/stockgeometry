(function attachRelationalReadoutBlock(globalObj) {
  "use strict";

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function renderRelationalReadoutBlock(root, snapshot) {
    if (!root) {
      return;
    }
    clearNode(root);
    const block = document.createElement("section");
    block.className = "pf-legend-block";
    const heading = document.createElement("h3");
    heading.className = "pf-legend-block-title";
    heading.textContent = "Relational readout";
    block.appendChild(heading);

    const body = document.createElement("p");
    body.className = "pf-relational-text";
    const generator = globalObj.generateRelationalReadout;
    if (typeof generator === "function") {
      body.textContent = generator(snapshot || {});
    } else {
      body.textContent = "No relational readout generator is available.";
    }
    block.appendChild(body);
    root.appendChild(block);
  }

  globalObj.renderRelationalReadoutBlock = renderRelationalReadoutBlock;
})(typeof window !== "undefined" ? window : globalThis);

