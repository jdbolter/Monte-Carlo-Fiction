# World contract: `alternate-history.v1`

The saved World is the durable boundary between counterfactual generation and rendering. A renderer
does not receive the full history corpus or reconsider the causal path; it receives compact excerpts
of only the historical events cited by the World.

```text
World {
  schema: "alternate-history.v1"
  id, kind: "alternate-history", domain, createdAt
  startYear, horizonYear, title, summary

  premise {
    divergence { year, historicalAnchor?, change }
    targetCondition?
    scope[]
  }

  assumptions[] { id, claim, timing, plausibility }

  historicalForces[] { sourceRefs[], legacy, effect }

  timeline[] {
    id, year, development, consequence
    causedBy[]
    status: "retained" | "altered" | "invented"
    sourceRefs[]
  }

  endpoint {
    technicalSystem[]
    entertainment[]
    socialMedia[]
    institutionsAndEconomy[]
    accessAndConflict[]
  }

  continuities[]
  tensions[] { issue, description }

  validation {
    status: "valid" | "warnings"
    warnings[]
    diagnosticFile?
  }

  provenance {
    historyCorpus, historyCorpusHash, scenarioBrief
    generatorModel, promptVersion, generatedAt
    batchIndex, batchSize
    usage {
      inputTokens, cacheCreationInputTokens
      cacheReadInputTokens, outputTokens
    }
  }
}
```

## Why these sections exist

- **Premise** preserves what was stipulated, separate from what the model inferred.
- **Assumptions** expose the supporting miracles or stretches instead of hiding them in prose.
- **Historical forces** interpret how inherited systems, practices, and remembered failures make
  some paths easier and others harder.
- **Timeline** provides the causal spine required by narrative history.
- **Endpoint** records conditions in the chosen ending year rather than assuming that year is the
  actual present or asking every renderer to reinvent it.
- **Continuities** prevent totalizing worlds in which one innovation replaces all media and social
  practices.
- **Tensions** prevent automatic utopia or dystopia.
- **Validation** preserves semantic audit warnings without discarding an otherwise renderable World
  or purchasing an automatic corrective generation.
- **Provenance** makes a costly, nondeterministic generation auditable.

## Compactness

Compactness comes from bounded item counts, factual phrases, and avoiding duplicated prose, not
abbreviated keys. The target is three or four assumptions, exactly four historical forces, exactly
nine timeline events, preferably
two or three phrases per endpoint section (four when needed for a distinct fact), exactly three
continuities, and exactly three tensions. The
timeline records change; `endpoint` records conditions in the ending year and must not repeat the timeline.

## Model output versus application output

The model produces only the content from `startYear` through `tensions`. The application
adds the schema, ID, kind, domain, creation time, validation audit, and provenance. The original scenario brief is
saved verbatim even though the model also normalizes it under `premise`.

Future speculation uses the separate but parallel [`FUTURE-CONTRACT.md`](FUTURE-CONTRACT.md).

Loaders and renderers continue to accept legacy `alternate-present.v1` Worlds, mapping their
`present` field to the normalized endpoint and grouping them under Alternate History.
