const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const TEXT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

const FORM_LABELS = {
  'narrative-history': 'Narrative history',
  fiction: 'Fiction',
  'found-document': 'Found document',
  scene: 'Scene',
  testimony: 'Testimony'
};

const DOMAIN_LABELS = {
  vr: 'VR',
  'digital-media': 'Digital Media',
  'silicon-valley': 'Silicon Valley',
  'world-war-ii': 'World War II',
  'cold-war': 'The Cold War'
};

const WIN_ANSI = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85],
  ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a],
  ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92],
  ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
  ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c],
  ['ž', 0x9e], ['Ÿ', 0x9f]
]);

function winAnsiBytes(value) {
  const bytes = [];
  for (const character of String(value ?? '')) {
    const code = character.codePointAt(0);
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else bytes.push(WIN_ANSI.get(character) ?? 0x3f);
  }
  return Buffer.from(bytes);
}

function pdfHex(value) {
  return `<${winAnsiBytes(value).toString('hex').toUpperCase()}>`;
}

function characterWidth(character) {
  if (" ilI.,'`:;!|".includes(character)) return 0.28;
  if ('mwMW@%&'.includes(character)) return 0.86;
  if (/[A-Z0-9]/.test(character)) return 0.62;
  return 0.5;
}

function textWidth(value, size) {
  return [...value].reduce((width, character) => width + characterWidth(character), 0) * size;
}

function splitLongWord(word, maxWidth, size) {
  const parts = [];
  let part = '';
  for (const character of word) {
    if (part && textWidth(part + character, size) > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part += character;
    }
  }
  if (part) parts.push(part);
  return parts;
}

function wrapText(value, maxWidth, size) {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const originalWord of words) {
    const parts = textWidth(originalWord, size) > maxWidth
      ? splitLongWord(originalWord, maxWidth, size)
      : [originalWord];
    for (const word of parts) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(candidate, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textCommand(text, { x, y, size, font = 'F1', color = '0.15 0.14 0.13' }) {
  return `BT\n/${font} ${size} Tf\n${color} rg\n1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm\n${pdfHex(text)} Tj\nET\n`;
}

function plainText(value) {
  return String(value ?? '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/([*_])(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function contentBlocks(text) {
  const blocks = [];
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: plainText(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const sourceLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
    const line = sourceLine.trim();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: plainText(heading[2]) });
    } else if (/^---+$/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'rule' });
    } else if (!line) {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

function composePages(artifact) {
  const pages = [[]];
  let pageIndex = 0;
  let y = PAGE_HEIGHT - MARGIN;

  const currentPage = () => pages[pageIndex];
  const addText = (text, options) => currentPage().push(textCommand(text, options));
  const addRule = ruleY => currentPage().push(
    `0.78 0.73 0.68 RG\n0.6 w\n${MARGIN} ${ruleY.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${ruleY.toFixed(2)} l\nS\n`
  );
  const addContinuationHeader = () => {
    y = PAGE_HEIGHT - MARGIN;
    const header = wrapText(artifact.worldTitle || 'Rendered text', TEXT_WIDTH - 70, 8.5)[0] || 'Rendered text';
    addText(header, { x: MARGIN, y, size: 8.5, font: 'F2', color: '0.42 0.38 0.34' });
    addRule(y - 10);
    y -= 31;
  };
  const newPage = () => {
    pages.push([]);
    pageIndex += 1;
    addContinuationHeader();
  };

  for (const line of wrapText(artifact.worldTitle || 'Rendered text', TEXT_WIDTH, 20)) {
    addText(line, { x: MARGIN, y, size: 20, font: 'F2', color: '0.12 0.10 0.09' });
    y -= 24;
  }
  y -= 2;

  const form = FORM_LABELS[artifact.form] || String(artifact.form || 'Rendered text');
  const metadata = [
    form,
    artifact.domain
      ? (DOMAIN_LABELS[artifact.domain] || String(artifact.domain).replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()))
      : '',
    artifact.horizonYear ? `ending year ${artifact.horizonYear}` : ''
  ].filter(Boolean).join('  |  ');
  for (const line of wrapText(metadata, TEXT_WIDTH, 9.5)) {
    addText(line, { x: MARGIN, y, size: 9.5, font: 'F1', color: '0.42 0.38 0.34' });
    y -= 13;
  }
  addRule(y - 2);
  y -= 25;

  const bodySize = 11.25;
  const leading = 16.3;
  for (const block of contentBlocks(artifact.text)) {
    if (block.type === 'rule') {
      if (y < MARGIN + 45) newPage();
      y -= 3;
      addRule(y);
      y -= 18;
      continue;
    }
    if (block.type === 'heading') {
      const size = block.level === 1 ? 15.5 : 13.25;
      const headingLeading = size + 4;
      if (y < MARGIN + 55) newPage();
      y -= block.level === 1 ? 5 : 2;
      for (const line of wrapText(block.text, TEXT_WIDTH, size)) {
        if (y < MARGIN + 30) newPage();
        addText(line, { x: MARGIN, y, size, font: 'F2', color: '0.17 0.14 0.12' });
        y -= headingLeading;
      }
      y -= 7;
      continue;
    }
    const lines = wrapText(block.text, TEXT_WIDTH, bodySize);
    for (const line of lines) {
      if (y < MARGIN + 30) newPage();
      addText(line, { x: MARGIN, y, size: bodySize });
      y -= leading;
    }
    y -= 7;
  }

  const total = pages.length;
  pages.forEach((commands, index) => {
    commands.push(textCommand(`${index + 1} / ${total}`, {
      x: PAGE_WIDTH - MARGIN - 26,
      y: 27,
      size: 8,
      color: '0.48 0.44 0.40'
    }));
  });
  return pages.map(commands => Buffer.from(commands.join(''), 'ascii'));
}

function pdfObject(id, body) {
  return Buffer.concat([
    Buffer.from(`${id} 0 obj\n`, 'ascii'),
    Buffer.isBuffer(body) ? body : Buffer.from(body, 'ascii'),
    Buffer.from('\nendobj\n', 'ascii')
  ]);
}

export function artifactPdfFilename(artifact) {
  const title = String(artifact?.worldTitle || 'rendered-text')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'rendered-text';
  const form = String(artifact?.form || '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${title}${form ? `-${form}` : ''}.pdf`;
}

export function createArtifactPdf(artifact) {
  if (!artifact || typeof artifact !== 'object') throw new Error('A saved artifact is required.');
  if (!String(artifact.text || '').trim()) throw new Error('The artifact has no rendered text.');

  const pageStreams = composePages(artifact);
  const pageIds = pageStreams.map((_, index) => 5 + (index * 2));
  const infoId = 5 + (pageStreams.length * 2);
  const objects = new Map([
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`],
    [3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'],
    [4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']
  ]);

  pageStreams.forEach((stream, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'),
      stream,
      Buffer.from('endstream', 'ascii')
    ]));
  });
  objects.set(infoId, `<< /Title ${pdfHex(artifact.worldTitle || 'Rendered text')} /Creator ${pdfHex('Monte-Carlo-Fiction')} >>`);

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  let length = chunks[0].length;
  for (let id = 1; id <= infoId; id += 1) {
    offsets[id] = length;
    const object = pdfObject(id, objects.get(id));
    chunks.push(object);
    length += object.length;
  }

  const xrefOffset = length;
  const xref = [
    `xref\n0 ${infoId + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  ].join('');
  chunks.push(Buffer.from(xref, 'ascii'));
  return Buffer.concat(chunks);
}
