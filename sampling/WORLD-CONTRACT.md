# World contract: `alternate-present.v1`

The saved World is the durable boundary between counterfactual generation and rendering. A renderer
does not receive the full history corpus and does not reconsider the causal path.

```text
World {
  schema: "alternate-present.v1"
  id, kind: "alternate-present", domain, createdAt
  horizonYear, title, summary

  premise {
    divergence { year, historicalAnchor?, change }
    targetCondition?
    scope[]
  }

  assumptions[] { id, claim, timing, plausibility }

  timeline[] {
    id, year, development, consequence
    causedBy[]
    status: "retained" | "altered" | "invented"
    sourceRefs[]
  }

  present {
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
- **Timeline** provides the causal spine required by narrative history.
- **Present** records the mature endpoint rather than asking every renderer to reinvent it.
- **Continuities** prevent totalizing worlds in which one innovation replaces all media and social
  practices.
- **Tensions** prevent automatic utopia or dystopia.
- **Validation** preserves semantic audit warnings without discarding an otherwise renderable World
  or purchasing an automatic corrective generation.
- **Provenance** makes a costly, nondeterministic generation auditable.

## Compactness

Compactness comes from bounded item counts, factual phrases, and avoiding duplicated prose, not
abbreviated keys. The target is three or four assumptions, exactly nine timeline events, preferably
two or three phrases per endpoint section (four when needed for a distinct fact), exactly three
continuities, and exactly three tensions. The
timeline records change; `present` records endpoint conditions and must not repeat the timeline.

## Model output versus application output

The model produces only the content from `horizonYear` through `tensions`. The application
adds the schema, ID, kind, domain, creation time, validation audit, and provenance. The original scenario brief is
saved verbatim even though the model also normalizes it under `premise`.

Future speculation uses the separate but parallel [`FUTURE-CONTRACT.md`](FUTURE-CONTRACT.md).
