import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactPdfFilename, createArtifactPdf } from '../sampling/artifact-pdf.js';

const artifact = {
  id: 'world-1--fiction',
  worldTitle: 'A “Different” Café',
  domain: 'digital-media',
  horizonYear: 2045,
  form: 'fiction',
  text: `${'This is a rendered paragraph with ordinary words and a mature alternate world. '.repeat(35)}

${'A second paragraph makes the document long enough to exercise wrapping and pagination. '.repeat(80)}`
};

test('artifact PDF is a valid-looking multi-page PDF with stable metadata', () => {
  const pdf = createArtifactPdf(artifact);
  const source = pdf.toString('latin1');
  assert.ok(Buffer.isBuffer(pdf));
  assert.match(source, /^%PDF-1\.4/);
  assert.match(source, /\/Type \/Pages/);
  assert.match(source, /\/Count [2-9]/);
  assert.match(source, /\/Title <[0-9A-F]+>/);
  assert.match(source, /startxref\n\d+\n%%EOF\n$/);
});

test('artifact PDF filenames are filesystem-safe and descriptive', () => {
  assert.equal(artifactPdfFilename(artifact), 'A-Different-Cafe-fiction.pdf');
});

test('artifact PDF refuses empty rendered text', () => {
  assert.throws(() => createArtifactPdf({ worldTitle: 'Empty', text: '  ' }), /no rendered text/i);
});
