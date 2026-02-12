/**
 * Large Dataset Seed Script — Sprint 13 (Team 06: QA & Compliance)
 *
 * Seeds a realistic dataset for load testing:
 *   - 5 tenants (1 vendor + 4 lawfirms)
 *   - 5 users per tenant (25 total)
 *   - 1000 clauses with 1000 published versions
 *   - 50 templates with 50 published versions
 *   - 200 contract instances across all lawfirm tenants
 *
 * Uses realistic German legal clause content with varied tags,
 * jurisdictions, and legal areas.
 *
 * Run:  npx tsx apps/api/src/__tests__/load/seed-large-dataset.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JURISDICTIONS = ['DE', 'AT', 'CH', 'DE-BY', 'DE-NW', 'DE-HE', 'DE-BE', 'DE-HH'];

const LEGAL_AREAS = [
  'Kaufrecht',
  'Mietrecht',
  'Arbeitsrecht',
  'Gesellschaftsrecht',
  'Erbrecht',
  'Familienrecht',
  'Handelsrecht',
  'IT-Recht',
  'Datenschutzrecht',
  'Baurecht',
  'Vergaberecht',
  'Versicherungsrecht',
  'Bankrecht',
  'Insolvenzrecht',
  'Wettbewerbsrecht',
];

const CLAUSE_TAGS = [
  'standard',
  'premium',
  'branchenspezifisch',
  'allgemein',
  'individuell',
  'gesetzlich',
  'dispositiv',
  'zwingend',
  'AGB',
  'Individualvereinbarung',
  'Haftung',
  'Gewährleistung',
  'Kündigung',
  'Datenschutz',
  'Vertraulichkeit',
  'Gerichtsstand',
  'Schiedsklausel',
  'Salvatorische Klausel',
  'Schriftform',
  'Vertragsstrafe',
];

const CLAUSE_TITLES = [
  'Präambel',
  'Vertragsgegenstand',
  'Vergütung und Zahlungsbedingungen',
  'Lieferung und Leistungserbringung',
  'Gewährleistung',
  'Haftungsbeschränkung',
  'Vertraulichkeit und Geheimhaltung',
  'Datenschutzbestimmungen',
  'Kündigungsregelungen',
  'Vertragsstrafe',
  'Höhere Gewalt (Force Majeure)',
  'Gerichtsstand und anwendbares Recht',
  'Schlussbestimmungen',
  'Salvatorische Klausel',
  'Schriftformerfordernis',
  'Abtretungsverbot',
  'Aufrechnung und Zurückbehaltungsrecht',
  'Wettbewerbsverbot',
  'Abwerbeverbot',
  'Geistiges Eigentum',
  'Nutzungsrechte',
  'Lizenzbestimmungen',
  'Wartung und Support',
  'Service Level Agreement',
  'Eskalationsverfahren',
  'Mitwirkungspflichten',
  'Abnahme',
  'Mängelrüge',
  'Nacherfüllung',
  'Rücktritt und Minderung',
  'Schadensersatz',
  'Versicherungspflicht',
  'Compliance-Klausel',
  'Anti-Korruptions-Klausel',
  'Subunternehmer',
  'Auftragsdatenverarbeitung',
  'Berichtspflichten',
  'Audit-Rechte',
  'Eigentumsvorbehalte',
  'Besicherung',
];

const TEMPLATE_TITLES = [
  'Kaufvertrag über bewegliche Sachen',
  'Mietvertrag Gewerbeimmobilie',
  'Arbeitsvertrag Vollzeit',
  'Arbeitsvertrag Teilzeit',
  'Geschäftsführervertrag GmbH',
  'Gesellschaftsvertrag GmbH',
  'Kooperationsvertrag',
  'Rahmenvertrag IT-Dienstleistungen',
  'Software-Lizenzvertrag',
  'SaaS-Vertrag',
  'Freelancer-Vertrag',
  'Werkvertrag',
  'Dienstvertrag',
  'Beratervertrag',
  'Geheimhaltungsvereinbarung (NDA)',
  'Letter of Intent',
  'Aufhebungsvertrag',
  'Darlehensvertrag',
  'Bürgschaftsvertrag',
  'Mietvertrag Wohnraum',
  'Pachtvertrag',
  'Franchisevertrag',
  'Vertriebsvertrag',
  'Handelsvertretervertrag',
  'Agenturvertrag',
  'Generalunternehmervertrag Bau',
  'Architektenvertrag',
  'Wartungsvertrag',
  'Support-Vertrag',
  'Auftragsverarbeitungsvertrag (AVV)',
  'Datenschutz-Folgenabschätzung',
  'Betriebsvereinbarung',
  'Testamentsentwurf',
  'Ehevertrag',
  'Erbvertrag',
  'Gesellschafterbeschluss',
  'Vollmacht',
  'Schiedsvereinbarung',
  'Mediationsvereinbarung',
  'Vergleichsvereinbarung',
  'Treuhandvertrag',
  'Escrow-Vereinbarung',
  'Joint-Venture-Vertrag',
  'Konsortialvertrag',
  'Beteiligungsvertrag',
  'Unternehmenskaufvertrag (SPA)',
  'Due-Diligence-Checkliste',
  'Term Sheet',
  'Wandeldarlehen',
  'SAFE-Vertrag',
];

/**
 * Generates realistic German legal clause content.
 * Produces varied paragraphs that look like actual legal text.
 */
function generateClauseContent(title: string, index: number): string {
  const paragraphs = [
    `§ ${index + 1} ${title}\n\n(1) Die Parteien vereinbaren die nachfolgenden Bestimmungen im Rahmen dieses Vertragsverhältnisses. Soweit nicht ausdrücklich abweichend geregelt, gelten die gesetzlichen Vorschriften ergänzend.`,
    `(2) Der Auftragnehmer verpflichtet sich, die vereinbarten Leistungen mit der Sorgfalt eines ordentlichen Kaufmanns zu erbringen. Dabei sind die anerkannten Regeln der jeweiligen Fachrichtung sowie die einschlägigen gesetzlichen und behördlichen Bestimmungen zu beachten.`,
    `(3) Änderungen und Ergänzungen dieser Vereinbarung bedürfen der Schriftform. Dies gilt auch für die Aufhebung des Schriftformerfordernisses selbst. Mündliche Nebenabreden bestehen nicht.`,
    `(4) Sollte eine Bestimmung dieses Vertrages ganz oder teilweise unwirksam sein oder werden, so wird die Wirksamkeit der übrigen Bestimmungen hierdurch nicht berührt. Die Parteien verpflichten sich, die unwirksame Bestimmung durch eine wirksame zu ersetzen, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung am nächsten kommt.`,
    `(5) Die Rechte und Pflichten aus diesem Vertrag sind ohne vorherige schriftliche Zustimmung der anderen Partei nicht übertragbar. § 354a HGB bleibt unberührt.`,
    `(6) Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesem Vertrag ist, soweit gesetzlich zulässig, der Sitz des Auftraggebers. Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG).`,
  ];

  // Use varying number of paragraphs based on index
  const numParagraphs = 3 + (index % 4);
  const selectedParagraphs = paragraphs.slice(0, numParagraphs);

  return selectedParagraphs.join('\n\n');
}

/**
 * Picks random elements from an array.
 */
function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Main Seed Function
// ---------------------------------------------------------------------------

async function seed() {
  console.log('Starting large dataset seed...');
  const startTime = Date.now();

  // --- Step 1: Create Tenants ---
  console.log('Creating 5 tenants...');
  const vendorTenantId = randomUUID();
  const lawfirmTenantIds: string[] = [];

  await prisma.tenant.create({
    data: {
      id: vendorTenantId,
      name: 'Servanda Verlag (Load-Test)',
      type: 'vendor',
      slug: `load-test-vendor-${Date.now()}`,
      defaultJurisdiction: 'DE',
      status: 'active',
    },
  });

  for (let i = 0; i < 4; i++) {
    const id = randomUUID();
    lawfirmTenantIds.push(id);
    await prisma.tenant.create({
      data: {
        id,
        name: `Load-Test Kanzlei ${i + 1}`,
        type: 'lawfirm',
        slug: `load-test-kanzlei-${i + 1}-${Date.now()}`,
        defaultJurisdiction: pickOne(JURISDICTIONS.slice(0, 3)),
        addressCity: pickOne(['Berlin', 'München', 'Hamburg', 'Frankfurt']),
        addressCountry: 'DE',
        status: 'active',
      },
    });
  }

  const allTenantIds = [vendorTenantId, ...lawfirmTenantIds];
  console.log(`  Created: vendor=${vendorTenantId}, lawfirms=${lawfirmTenantIds.join(', ')}`);

  // --- Step 2: Create Users (5 per tenant) ---
  console.log('Creating 25 users (5 per tenant)...');
  const usersByTenant: Record<string, string[]> = {};

  for (const tenantId of allTenantIds) {
    usersByTenant[tenantId] = [];
    const roles = ['admin', 'editor', 'editor', 'user', 'user'];
    for (let i = 0; i < 5; i++) {
      const userId = randomUUID();
      usersByTenant[tenantId].push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          tenantId,
          email: `load-test-user-${i + 1}-${tenantId.substring(0, 8)}@servanda.test`,
          displayName: `Load Test User ${i + 1}`,
          role: roles[i],
          status: 'active',
        },
      });
    }
  }

  // --- Step 3: Create 1000 Clauses with Published Versions ---
  console.log('Creating 1000 clauses with published versions...');
  const clauseIds: string[] = [];
  const clauseVersionIds: string[] = [];
  const BATCH_SIZE = 50;

  for (let batch = 0; batch < 1000 / BATCH_SIZE; batch++) {
    const clauseData = [];
    const versionData = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const globalIndex = batch * BATCH_SIZE + i;
      const clauseId = randomUUID();
      const versionId = randomUUID();
      const tenantId = vendorTenantId;
      const authorId = usersByTenant[tenantId][1]; // editor
      const title = `${CLAUSE_TITLES[globalIndex % CLAUSE_TITLES.length]} (${globalIndex + 1})`;
      const tags = pickRandom(CLAUSE_TAGS, 2 + (globalIndex % 4));
      const jurisdiction = JURISDICTIONS[globalIndex % JURISDICTIONS.length];
      const legalArea = LEGAL_AREAS[globalIndex % LEGAL_AREAS.length];

      clauseIds.push(clauseId);
      clauseVersionIds.push(versionId);

      clauseData.push({
        id: clauseId,
        tenantId,
        title,
        tags,
        jurisdiction,
        legalArea,
        currentPublishedVersionId: versionId,
      });

      versionData.push({
        id: versionId,
        clauseId,
        tenantId,
        versionNumber: 1,
        content: generateClauseContent(title, globalIndex),
        parameters: globalIndex % 3 === 0
          ? { kaufpreis: { type: 'number', label: 'Kaufpreis (EUR)' } }
          : null,
        rules: [],
        status: 'published',
        authorId,
        publishedAt: new Date(),
      });
    }

    // Bulk create clauses
    await prisma.clause.createMany({ data: clauseData });
    // Bulk create versions
    await prisma.clauseVersion.createMany({ data: versionData });

    if ((batch + 1) % 4 === 0) {
      console.log(`  Clauses: ${(batch + 1) * BATCH_SIZE} / 1000`);
    }
  }

  // --- Step 4: Create 50 Templates with Published Versions ---
  console.log('Creating 50 templates with published versions...');
  const templateVersionIds: string[] = [];

  for (let i = 0; i < 50; i++) {
    const templateId = randomUUID();
    const versionId = randomUUID();
    const tenantId = vendorTenantId;
    const authorId = usersByTenant[tenantId][1]; // editor
    const title = TEMPLATE_TITLES[i % TEMPLATE_TITLES.length];
    const jurisdiction = JURISDICTIONS[i % JURISDICTIONS.length];
    const legalArea = LEGAL_AREAS[i % LEGAL_AREAS.length];

    // Build structure referencing existing clauses (5-15 clauses per template)
    const numSections = 2 + (i % 4);
    const structure = [];
    for (let s = 0; s < numSections; s++) {
      const numSlots = 2 + (s % 3);
      const slots = [];
      for (let sl = 0; sl < numSlots; sl++) {
        const clauseIndex = (i * 10 + s * 3 + sl) % clauseIds.length;
        slots.push({
          clauseId: clauseIds[clauseIndex],
          type: sl === 0 ? 'required' : (sl % 3 === 0 ? 'alternative' : 'optional'),
          alternativeClauseIds: sl % 3 === 0
            ? [clauseIds[(clauseIndex + 1) % clauseIds.length]]
            : [],
        });
      }
      structure.push({
        title: `Abschnitt ${s + 1}`,
        slots,
      });
    }

    await prisma.template.create({
      data: {
        id: templateId,
        tenantId,
        title,
        description: `Vorlage für ${title} — automatisch generiert für Lasttest.`,
        category: legalArea,
        jurisdiction,
        legalArea,
        tags: pickRandom(CLAUSE_TAGS, 3),
        currentPublishedVersionId: versionId,
      },
    });

    await prisma.templateVersion.create({
      data: {
        id: versionId,
        templateId,
        tenantId,
        versionNumber: 1,
        structure,
        status: 'published',
        authorId,
        publishedAt: new Date(),
      },
    });

    templateVersionIds.push(versionId);

    if ((i + 1) % 10 === 0) {
      console.log(`  Templates: ${i + 1} / 50`);
    }
  }

  // --- Step 5: Create 200 Contract Instances ---
  console.log('Creating 200 contract instances across 4 lawfirm tenants...');

  for (let i = 0; i < 200; i++) {
    const tenantId = lawfirmTenantIds[i % lawfirmTenantIds.length];
    const creatorId = usersByTenant[tenantId][Math.floor(Math.random() * usersByTenant[tenantId].length)];
    const templateVersionId = templateVersionIds[i % templateVersionIds.length];

    // Pick some clause versions to pin
    const numClauses = 3 + (i % 8);
    const pinnedClauseVersionIds = [];
    for (let c = 0; c < numClauses; c++) {
      pinnedClauseVersionIds.push(clauseVersionIds[(i * 5 + c) % clauseVersionIds.length]);
    }

    const isCompleted = i % 5 === 0;

    await prisma.contractInstance.create({
      data: {
        tenantId,
        creatorId,
        title: `Lasttest-Vertrag ${i + 1} — ${TEMPLATE_TITLES[i % TEMPLATE_TITLES.length]}`,
        templateVersionId,
        clauseVersionIds: pinnedClauseVersionIds,
        answers: {
          kaufpreis: Math.floor(Math.random() * 500000) + 1000,
          gewaehrleistungsfrist: pickOne([6, 12, 24, 36]),
          gerichtsort: pickOne(['Berlin', 'Hamburg', 'München', 'Frankfurt', 'Köln', 'Stuttgart']),
          haftungsbeschraenkung: Math.random() > 0.5,
        },
        selectedSlots: {},
        validationState: 'valid',
        status: isCompleted ? 'completed' : 'draft',
        completedAt: isCompleted ? new Date() : null,
        tags: pickRandom(['lasttest', 'automatisch', 'entwurf', 'wichtig'], 2),
      },
    });

    if ((i + 1) % 50 === 0) {
      console.log(`  Contracts: ${i + 1} / 200`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(60));
  console.log('  LARGE DATASET SEED COMPLETE');
  console.log('='.repeat(60));
  console.log(`  Tenants:            5 (1 vendor + 4 lawfirms)`);
  console.log(`  Users:              25`);
  console.log(`  Clauses:            1000`);
  console.log(`  Clause Versions:    1000 (all published)`);
  console.log(`  Templates:          50`);
  console.log(`  Template Versions:  50 (all published)`);
  console.log(`  Contracts:          200`);
  console.log(`  Time:               ${elapsed}s`);
  console.log('='.repeat(60));

  // Print useful IDs for load tests
  console.log('');
  console.log('  Useful IDs for load tests:');
  console.log(`    Vendor Tenant:           ${vendorTenantId}`);
  console.log(`    Lawfirm Tenants:         ${lawfirmTenantIds.join(', ')}`);
  console.log(`    First Lawfirm Admin:     ${usersByTenant[lawfirmTenantIds[0]][0]}`);
  console.log(`    First Lawfirm Editor:    ${usersByTenant[lawfirmTenantIds[0]][1]}`);
  console.log(`    First Template Version:  ${templateVersionIds[0]}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

seed()
  .then(() => {
    console.log('Seed completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
