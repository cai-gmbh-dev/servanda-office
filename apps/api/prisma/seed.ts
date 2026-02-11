/**
 * Seed Script — Sprint 5
 *
 * Creates development data:
 * - 1 Vendor Tenant (Servanda Verlag) with author + reviewer
 * - 1 Lawfirm Tenant (Musterkanzlei) with admin + editor + user
 * - Sample clauses with versions (draft + published)
 * - Sample template with structure + interview flow
 * - Sample contract instance (draft)
 *
 * Run: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding development database...');

  // --- Vendor Tenant ---
  const vendor = await prisma.tenant.upsert({
    where: { slug: 'servanda-verlag' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Servanda Verlag',
      type: 'vendor',
      slug: 'servanda-verlag',
      defaultJurisdiction: 'DE',
      defaultLanguage: 'de',
      settings: { plan: 'enterprise' },
    },
  });

  const vendorAuthor = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: vendor.id, email: 'autor@servanda.de' } },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000001',
      tenantId: vendor.id,
      email: 'autor@servanda.de',
      displayName: 'Dr. Anna Klausel',
      role: 'editor',
      status: 'active',
    },
  });

  const vendorReviewer = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: vendor.id, email: 'review@servanda.de' } },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000002',
      tenantId: vendor.id,
      email: 'review@servanda.de',
      displayName: 'Prof. Max Prüfer',
      role: 'admin',
      status: 'active',
    },
  });

  // --- Lawfirm Tenant ---
  const lawfirm = await prisma.tenant.upsert({
    where: { slug: 'musterkanzlei' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Musterkanzlei Schmidt & Partner',
      type: 'lawfirm',
      slug: 'musterkanzlei',
      addressStreet: 'Friedrichstr. 123',
      addressZip: '10117',
      addressCity: 'Berlin',
      addressCountry: 'DE',
      defaultJurisdiction: 'DE',
      defaultLanguage: 'de',
      settings: { plan: 'pro' },
    },
  });

  const lawfirmAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: lawfirm.id, email: 'admin@musterkanzlei.de' } },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000001',
      tenantId: lawfirm.id,
      email: 'admin@musterkanzlei.de',
      displayName: 'RA Thomas Schmidt',
      role: 'admin',
      status: 'active',
    },
  });

  const lawfirmEditor = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: lawfirm.id, email: 'editor@musterkanzlei.de' } },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000002',
      tenantId: lawfirm.id,
      email: 'editor@musterkanzlei.de',
      displayName: 'RA Lisa Müller',
      role: 'editor',
      status: 'active',
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: lawfirm.id, email: 'user@musterkanzlei.de' } },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000003',
      tenantId: lawfirm.id,
      email: 'user@musterkanzlei.de',
      displayName: 'Maria Weber',
      role: 'user',
      status: 'active',
    },
  });

  // --- Sample Clauses (Vendor) ---
  const clauseVertragsgegenstand = await prisma.clause.upsert({
    where: { id: '00000000-0000-0000-0010-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0010-000000000001',
      tenantId: vendor.id,
      title: 'Vertragsgegenstand',
      tags: ['allgemein', 'kaufvertrag'],
      jurisdiction: 'DE',
      legalArea: 'Vertragsrecht',
    },
  });

  const cvVertragsgegenstand = await prisma.clauseVersion.upsert({
    where: { clauseId_versionNumber: { clauseId: clauseVertragsgegenstand.id, versionNumber: 1 } },
    update: {},
    create: {
      id: '00000000-0000-0000-0011-000000000001',
      clauseId: clauseVertragsgegenstand.id,
      tenantId: vendor.id,
      versionNumber: 1,
      content:
        'Der Verkäufer verkauft dem Käufer den in Anlage 1 näher bezeichneten Gegenstand zum vereinbarten Kaufpreis von {kaufpreis} EUR.',
      parameters: { kaufpreis: { type: 'currency', label: 'Kaufpreis (EUR)', required: true } },
      rules: [],
      status: 'published',
      authorId: vendorAuthor.id,
      reviewerId: vendorReviewer.id,
      publishedAt: new Date(),
    },
  });

  await prisma.clause.update({
    where: { id: clauseVertragsgegenstand.id },
    data: { currentPublishedVersionId: cvVertragsgegenstand.id },
  });

  const clauseGewaehrleistung = await prisma.clause.upsert({
    where: { id: '00000000-0000-0000-0010-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0010-000000000002',
      tenantId: vendor.id,
      title: 'Gewährleistung',
      tags: ['allgemein', 'kaufvertrag', 'gewaehrleistung'],
      jurisdiction: 'DE',
      legalArea: 'Vertragsrecht',
    },
  });

  const cvGewaehrleistung = await prisma.clauseVersion.upsert({
    where: { clauseId_versionNumber: { clauseId: clauseGewaehrleistung.id, versionNumber: 1 } },
    update: {},
    create: {
      id: '00000000-0000-0000-0011-000000000002',
      clauseId: clauseGewaehrleistung.id,
      tenantId: vendor.id,
      versionNumber: 1,
      content:
        'Die Gewährleistungsfrist beträgt {gewaehrleistungsfrist} Monate ab Übergabe des Kaufgegenstandes. Die gesetzlichen Regelungen der §§ 434 ff. BGB finden Anwendung.',
      parameters: {
        gewaehrleistungsfrist: { type: 'number', label: 'Gewährleistungsfrist (Monate)', required: true, default: 24 },
      },
      rules: JSON.parse(JSON.stringify([
        {
          type: 'requires',
          targetClauseId: clauseVertragsgegenstand.id,
          severity: 'hard',
          message: 'Gewährleistung erfordert Vertragsgegenstand-Klausel.',
        },
      ])),
      status: 'published',
      authorId: vendorAuthor.id,
      reviewerId: vendorReviewer.id,
      publishedAt: new Date(),
    },
  });

  await prisma.clause.update({
    where: { id: clauseGewaehrleistung.id },
    data: { currentPublishedVersionId: cvGewaehrleistung.id },
  });

  const clauseHaftungsbeschraenkung = await prisma.clause.upsert({
    where: { id: '00000000-0000-0000-0010-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0010-000000000003',
      tenantId: vendor.id,
      title: 'Haftungsbeschränkung',
      tags: ['allgemein', 'kaufvertrag', 'haftung'],
      jurisdiction: 'DE',
      legalArea: 'Vertragsrecht',
    },
  });

  const cvHaftungsbeschraenkung = await prisma.clauseVersion.upsert({
    where: { clauseId_versionNumber: { clauseId: clauseHaftungsbeschraenkung.id, versionNumber: 1 } },
    update: {},
    create: {
      id: '00000000-0000-0000-0011-000000000003',
      clauseId: clauseHaftungsbeschraenkung.id,
      tenantId: vendor.id,
      versionNumber: 1,
      content:
        'Die Haftung des Verkäufers ist auf Vorsatz und grobe Fahrlässigkeit beschränkt. Die Haftung für leichte Fahrlässigkeit ist ausgeschlossen, soweit gesetzlich zulässig.',
      parameters: {},
      rules: JSON.parse(JSON.stringify([
        {
          type: 'incompatible_with',
          targetClauseId: '00000000-0000-0000-0010-000000000004',
          severity: 'hard',
          message: 'Haftungsbeschränkung ist unvereinbar mit Vollhaftungsklausel.',
        },
      ])),
      status: 'published',
      authorId: vendorAuthor.id,
      reviewerId: vendorReviewer.id,
      publishedAt: new Date(),
    },
  });

  await prisma.clause.update({
    where: { id: clauseHaftungsbeschraenkung.id },
    data: { currentPublishedVersionId: cvHaftungsbeschraenkung.id },
  });

  const clauseGerichtsstand = await prisma.clause.upsert({
    where: { id: '00000000-0000-0000-0010-000000000004' },
    update: {},
    create: {
      id: '00000000-0000-0000-0010-000000000004',
      tenantId: vendor.id,
      title: 'Gerichtsstand',
      tags: ['allgemein', 'gerichtsstand'],
      jurisdiction: 'DE',
      legalArea: 'Vertragsrecht',
    },
  });

  const cvGerichtsstand = await prisma.clauseVersion.upsert({
    where: { clauseId_versionNumber: { clauseId: clauseGerichtsstand.id, versionNumber: 1 } },
    update: {},
    create: {
      id: '00000000-0000-0000-0011-000000000004',
      clauseId: clauseGerichtsstand.id,
      tenantId: vendor.id,
      versionNumber: 1,
      content: 'Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesem Vertrag ist {gerichtsort}.',
      parameters: { gerichtsort: { type: 'text', label: 'Gerichtsort', required: true, default: 'Berlin' } },
      rules: [],
      status: 'published',
      authorId: vendorAuthor.id,
      reviewerId: vendorReviewer.id,
      publishedAt: new Date(),
    },
  });

  await prisma.clause.update({
    where: { id: clauseGerichtsstand.id },
    data: { currentPublishedVersionId: cvGerichtsstand.id },
  });

  // --- Interview Flow ---
  const interviewFlow = await prisma.interviewFlow.upsert({
    where: { id: '00000000-0000-0000-0020-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0020-000000000001',
      tenantId: vendor.id,
      title: 'Kaufvertrag Interview',
      questions: JSON.parse(JSON.stringify([
        {
          key: 'kaufpreis',
          type: 'currency',
          label: 'Wie hoch ist der Kaufpreis?',
          required: true,
          helpText: 'Geben Sie den vereinbarten Kaufpreis in Euro ein.',
        },
        {
          key: 'gewaehrleistungsfrist',
          type: 'number',
          label: 'Wie lange soll die Gewährleistungsfrist gelten (in Monaten)?',
          required: true,
          default: 24,
          helpText: 'Gesetzlich: 24 Monate. Kann vertraglich angepasst werden.',
        },
        {
          key: 'haftungsbeschraenkung',
          type: 'yes_no',
          label: 'Soll eine Haftungsbeschränkung aufgenommen werden?',
          required: true,
          default: false,
        },
        {
          key: 'gerichtsort',
          type: 'text',
          label: 'Welcher Gerichtsstand soll vereinbart werden?',
          required: true,
          default: 'Berlin',
          helpText: 'Ort des zuständigen Gerichts.',
        },
      ])),
    },
  });

  // --- Sample Template ---
  const template = await prisma.template.upsert({
    where: { id: '00000000-0000-0000-0030-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0030-000000000001',
      tenantId: vendor.id,
      title: 'Kaufvertrag (Standard)',
      description: 'Standardmuster für einen Kaufvertrag nach deutschem Recht.',
      category: 'Kaufverträge',
      jurisdiction: 'DE',
      legalArea: 'Vertragsrecht',
      tags: ['kaufvertrag', 'standard', 'deutsch'],
    },
  });

  const templateVersion = await prisma.templateVersion.upsert({
    where: { templateId_versionNumber: { templateId: template.id, versionNumber: 1 } },
    update: {},
    create: {
      id: '00000000-0000-0000-0031-000000000001',
      templateId: template.id,
      tenantId: vendor.id,
      versionNumber: 1,
      structure: JSON.parse(JSON.stringify([
        {
          title: 'Vertragsgegenstand',
          slots: [{ clauseId: clauseVertragsgegenstand.id, type: 'required' }],
        },
        {
          title: 'Gewährleistung',
          slots: [{ clauseId: clauseGewaehrleistung.id, type: 'required' }],
        },
        {
          title: 'Haftung',
          slots: [
            { clauseId: clauseHaftungsbeschraenkung.id, type: 'optional' },
          ],
        },
        {
          title: 'Schlussbestimmungen',
          slots: [{ clauseId: clauseGerichtsstand.id, type: 'required' }],
        },
      ])),
      interviewFlowId: interviewFlow.id,
      status: 'published',
      authorId: vendorAuthor.id,
      reviewerId: vendorReviewer.id,
      publishedAt: new Date(),
    },
  });

  await prisma.template.update({
    where: { id: template.id },
    data: { currentPublishedVersionId: templateVersion.id },
  });

  // --- Sample Contract Instance (Lawfirm) ---
  await prisma.contractInstance.upsert({
    where: { id: '00000000-0000-0000-0040-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0040-000000000001',
      tenantId: lawfirm.id,
      creatorId: lawfirmEditor.id,
      title: 'Kaufvertrag Mandant Müller',
      clientReference: 'AZ-2026-001',
      tags: ['mueller', 'kaufvertrag'],
      templateVersionId: templateVersion.id,
      clauseVersionIds: [
        cvVertragsgegenstand.id,
        cvGewaehrleistung.id,
        cvGerichtsstand.id,
      ],
      answers: { kaufpreis: 50000, gewaehrleistungsfrist: 24, haftungsbeschraenkung: false, gerichtsort: 'Berlin' },
      selectedSlots: {},
      validationState: 'valid',
      status: 'draft',
    },
  });

  // --- Style Template (System Default) ---
  await prisma.styleTemplate.upsert({
    where: { id: '00000000-0000-0000-0050-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0050-000000000001',
      tenantId: vendor.id,
      name: 'Standard (Servanda)',
      description: 'Standard-Formatvorlage des Servanda Verlags.',
      type: 'system',
      templateFile: 'templates/default-style.docx',
      headerConfig: { showLogo: false, showTenantName: true },
      footerConfig: { showPageNumbers: true, showDate: true },
      isDefault: true,
    },
  });

  console.log('Seed completed successfully.');
  console.log(`  Vendor tenant: ${vendor.name} (${vendor.slug})`);
  console.log(`  Lawfirm tenant: ${lawfirm.name} (${lawfirm.slug})`);
  console.log(`  Clauses: 4, Template: 1, Contract: 1`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
