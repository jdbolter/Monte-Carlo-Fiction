# Future World contract: `future.v1`

The future contract is separate from `alternate-present.v1` but preserves the same durable boundary
between World construction and rendering.

```text
World {
  schema: "future.v1"
  id, kind: "future", domain, createdAt
  baseYear, horizonYear, title, summary

  premise {
    mode: "pivot-forward" | "endpoint-backcast" |
          "bounded-corridor" | "open-exploration"
    question
    pivot { year, change, source: "supplied" | "inferred" }
    targetCondition { description, source: "supplied" | "inferred" }
    scope[]
  }

  assumptions[] { id, claim, timing, plausibility }

  timeline[] {
    id, year, development, consequence
    causedBy[]
    status: "continuation" | "adaptation" | "novel"
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
  validation { status, warnings[], diagnosticFile? }
  provenance { historyCorpus, historyCorpusHash, scenarioBrief, generationInput, model, usage... }
}
```

## Mode semantics

- **Pivot forward:** pivot supplied; target supplied or inferred.
- **Endpoint backcast:** target supplied; pivot supplied or inferred. Output remains chronological.
- **Bounded corridor:** both pivot and target supplied.
- **Open exploration:** both pivot and target inferred from the brief and lineage.

The general brief and historical lineage are always present. Modes only determine which corridor
boundaries the user stipulates and which the model must infer.

## Audit policy

Structured output guarantees the record shape. Semantic checks—years, chronology, backward causal
references, lineage ids, counts, and correct supplied/inferred labels—are advisory. A World with
warnings is saved and rendered; the complete response is retained under `outputs/diagnostics/`.
