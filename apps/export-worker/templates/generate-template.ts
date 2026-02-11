/**
 * DOCX Reference Template Generator — Sprint 6 (Team 03 + 05)
 *
 * Generates the default.docx template for docxtemplater rendering.
 * Run: npx tsx apps/export-worker/templates/generate-template.ts
 *
 * Template variables:
 * - {{contractTitle}} — Contract title
 * - {{clientReference}} — Client reference / Aktenzeichen
 * - {{createdDate}} — Generation date (dd.MM.yyyy)
 * - {{#sections}} / {{/sections}} — Section loop
 *   - {{sectionNumber}} — §-Number
 *   - {{sectionTitle}} — Section heading
 *   - {{#clauses}} / {{/clauses}} — Clause loop
 *     - {{clauseNumber}} — e.g. "1.1"
 *     - {{clauseContent}} — Clause text with parameters substituted
 */

import PizZip from 'pizzip';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const OUTPUT_PATH = resolve(__dirname, 'default.docx');

// Minimal DOCX structure (OpenXML)
// A .docx is a ZIP with specific XML files

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:sz w:val="28"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/>
      <w:sz w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`;

// Document template with docxtemplater tags
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <!-- Title -->
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>{{contractTitle}}</w:t></w:r>
    </w:p>

    <!-- Metadata -->
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/><w:color w:val="666666"/></w:rPr>
        <w:t xml:space="preserve">Aktenzeichen: {{clientReference}} | Erstellt am: {{createdDate}}</w:t>
      </w:r>
    </w:p>

    <!-- Separator -->
    <w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>

    <!-- Sections Loop -->
    {#sections}
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t xml:space="preserve">§ {sectionNumber} {sectionTitle}</w:t></w:r>
    </w:p>

    {#clauses}
    <w:p>
      <w:pPr><w:spacing w:after="120"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">({clauseNumber}) </w:t></w:r>
      <w:r><w:t>{clauseContent}</w:t></w:r>
    </w:p>
    {/clauses}

    {/sections}

    <!-- Footer -->
    <w:p><w:pPr><w:spacing w:before="400"/></w:pPr></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="999999"/></w:rPr>
        <w:t>Generiert mit Servanda Office</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

function generate(): void {
  const zip = new PizZip();

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/_rels/document.xml.rels', wordRelsXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/document.xml', documentXml);

  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, buf);

  console.log(`Generated reference template: ${OUTPUT_PATH} (${buf.length} bytes)`);
}

generate();
