# Components

How individual parts of cue work today: their flow, inputs and outputs, rules, settings,
failure behaviour and known limits. These docs change with the code; when a component's
behaviour changes, its doc changes in the same commit.

They complement the other docs:

- [architecture.md](../architecture.md) is the map: which parts exist and how they connect.
- [decisions](../decisions/README.md) record why something was chosen and are never rewritten.
- Component docs explain how a part works now, in enough detail to change it safely.

| Component           | What it covers                                                  |
| ------------------- | --------------------------------------------------------------- |
| [Rerank](rerank.md) | Gemini Flash reranking of fused search hits, text and keyframes |
