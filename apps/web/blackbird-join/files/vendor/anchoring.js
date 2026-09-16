// The anchoring engine, addressable as a URL so a prototype frame can import
// it. Same reasoning as the React vendor modules: a frame is its own realm and
// must import what it uses. This one is ours rather than a third party, so a
// star re-export is safe — it is real ESM, not a CJS interop shim.
export * from "@drydock/anchoring";
