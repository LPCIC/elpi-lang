The pipeline for processing a trace into renderable data consists of the
following steps:

- [Parsing](./parsing.mts)
- [Elaboration](./elaboration.mts)
- [Analysis](./analysis.mts)
- [Rendering](./presentation.mts)

Parsing accepts a string, parses it into version-specific items, and groups them
into a map indexed by "step keys" (a combination of a step index and a runtime
index). The item parser is generated from the ATD files, which come from the
[elpi repo](https://github.com/LPCIC/elpi). It is the parser's responsibility to
decide which version of the trace it's reading: it returns a tagged union.

Elaboration then takes this map and turns it into version-independent semantic
information, decoding the grouped items. Analysis does some further global
semantic analysis, and rendering processes the analyzed trace into MVVM-style
viewmodel (data that the frontend can easily render).

Currently the internal semantic and presentation types are taken from the v2
trace. The plan for the future is to make something more built for purpose, but
it would probably be wise to do this refactoring after `main.js` is turned into
`main.mts` and has access to this information.
