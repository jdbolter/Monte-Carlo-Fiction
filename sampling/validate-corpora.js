import { listCorpora } from './history.js';

try {
  const corpora = listCorpora();
  for (const corpus of corpora) {
    console.log(`${corpus.id}: ${corpus.eventCount} events, ${corpus.firstYear}–${corpus.lastYear}, ${corpus.experiments.join(' + ')}`);
  }
  console.log(`Validated ${corpora.length} history corpora.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
