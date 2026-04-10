/**
 * EvidentIS Database Seed Script
 * Creates demo data for development and testing
 * 
 * Usage: SEED_DEMO_DATA=true npm run db:seed
 * WARNING: Never run in production!
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEMO_PASSWORD = 'EvidentIS2026Demo!';
const SALT_ROUNDS = 10;

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const CLAUSE_TYPES = [
  'indemnification', 'limitation_of_liability', 'termination_for_convenience',
  'termination_for_cause', 'confidentiality', 'non_compete', 'non_solicitation',
  'intellectual_property', 'governing_law', 'arbitration', 'jury_waiver',
  'class_action_waiver', 'force_majeure', 'assignment', 'notice_requirements',
  'amendment', 'severability', 'entire_agreement', 'warranty_disclaimer',
  'data_privacy', 'insurance_requirements', 'compliance_with_laws', 'audit_rights',
  'most_favored_nation'
];

// ============================================================================
// DEMO DATA DEFINITIONS
// ============================================================================

interface DemoTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  barState: string;
}

interface DemoAttorney {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: string;
  practiceGroup?: string;
  barNumber?: string;
  barState?: string;
}

interface DemoMatter {
  id: string;
  tenantId: string;
  matterCode: string;
  matterName: string;
  matterType: string;
  clientName: string;
  counterpartyName?: string;
  governingLawState: string;
  status: string;
  priority: string;
  healthScore: number;
  dealValueCents?: number;
}

// ============================================================================
// SEED DATA
// ============================================================================

const demoTenants: DemoTenant[] = [
  { id: randomUUID(), name: 'Acme Legal Partners LLP', slug: 'acme-legal', plan: 'professional', barState: 'NY' },
  { id: randomUUID(), name: 'Pacific Coast Law Group', slug: 'pacific-coast', plan: 'growth', barState: 'CA' },
  { id: randomUUID(), name: 'Midwest Corporate Counsel', slug: 'midwest-corp', plan: 'starter', barState: 'IL' },
];

function createDemoAttorneys(tenants: DemoTenant[]): DemoAttorney[] {
  const attorneys: DemoAttorney[] = [];
  
  tenants.forEach(tenant => {
    // Admin
    attorneys.push({
      id: randomUUID(),
      tenantId: tenant.id,
      email: `admin@${tenant.slug}.com`,
      displayName: 'Admin User',
      role: 'admin',
      practiceGroup: 'Administration',
    });
    
    // Partner
    attorneys.push({
      id: randomUUID(),
      tenantId: tenant.id,
      email: `partner@${tenant.slug}.com`,
      displayName: 'Senior Partner',
      role: 'partner',
      practiceGroup: 'Corporate',
      barNumber: `${tenant.barState}123456`,
      barState: tenant.barState,
    });
    
    // Associates
    ['corporate', 'litigation', 'ip'].forEach((group, i) => {
      attorneys.push({
        id: randomUUID(),
        tenantId: tenant.id,
        email: `${group}.associate@${tenant.slug}.com`,
        displayName: `${group.charAt(0).toUpperCase() + group.slice(1)} Associate`,
        role: 'attorney',
        practiceGroup: group.charAt(0).toUpperCase() + group.slice(1),
        barNumber: `${tenant.barState}${100000 + i}`,
        barState: tenant.barState,
      });
    });
    
    // Paralegal
    attorneys.push({
      id: randomUUID(),
      tenantId: tenant.id,
      email: `paralegal@${tenant.slug}.com`,
      displayName: 'Paralegal Staff',
      role: 'paralegal',
      practiceGroup: 'Corporate',
    });
  });
  
  return attorneys;
}

function createDemoMatters(tenants: DemoTenant[], attorneys: DemoAttorney[]): DemoMatter[] {
  const matters: DemoMatter[] = [];
  
  const matterTemplates = [
    { name: 'TechCorp Acquisition', type: 'ma_transaction', client: 'TechCorp Industries', counterparty: 'InnovateSoft LLC', value: 5000000000 },
    { name: 'CloudService SaaS Agreement', type: 'commercial_contract', client: 'CloudService Inc', counterparty: 'DataPro Systems', value: 120000000 },
    { name: 'Downtown Office Lease', type: 'real_estate', client: 'Metro Properties', counterparty: 'Building Partners', value: 2500000000 },
    { name: 'Patent Dispute - Widget Tech', type: 'litigation', client: 'Widget Technologies', counterparty: 'CompetitorCo', value: 1000000000 },
    { name: 'Software License Negotiation', type: 'ip', client: 'SoftDev Corp', counterparty: 'Enterprise Systems', value: 50000000 },
    { name: 'Executive Employment Package', type: 'employment', client: 'FinanceGroup', counterparty: null, value: 5000000 },
    { name: 'FDA Compliance Review', type: 'regulatory', client: 'PharmaCo', counterparty: null, value: null },
    { name: 'Series B Financing', type: 'ma_transaction', client: 'StartupXYZ', counterparty: 'Venture Capital Partners', value: 25000000000 },
    { name: 'Distribution Agreement - APAC', type: 'commercial_contract', client: 'GlobalDistrib', counterparty: 'APAC Partners', value: 80000000 },
    { name: 'Data Center Lease', type: 'real_estate', client: 'DataHost Inc', counterparty: 'Industrial Properties', value: 1500000000 },
  ];
  
  const statuses = ['open', 'open', 'open', 'under_review', 'closed'];
  const priorities = ['normal', 'normal', 'high', 'urgent', 'low'];
  
  tenants.forEach((tenant, ti) => {
    matterTemplates.forEach((template, mi) => {
      const state = US_STATES[(ti * 10 + mi) % US_STATES.length];
      
      matters.push({
        id: randomUUID(),
        tenantId: tenant.id,
        matterCode: `M-2026-${String(ti * 100 + mi + 1).padStart(3, '0')}`,
        matterName: template.name,
        matterType: template.type,
        clientName: template.client,
        counterpartyName: template.counterparty || undefined,
        governingLawState: state,
        status: statuses[mi % statuses.length],
        priority: priorities[mi % priorities.length],
        healthScore: 60 + Math.floor(Math.random() * 40),
        dealValueCents: template.value || undefined,
      });
    });
  });
  
  return matters;
}

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedTenants(pool: Pool, tenants: DemoTenant[]): Promise<void> {
  console.log('  Seeding tenants...');
  
  for (const tenant of tenants) {
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, bar_state, subscription_status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', NOW())
       ON CONFLICT (slug) DO NOTHING`,
      [tenant.id, tenant.name, tenant.slug, tenant.plan, tenant.barState]
    );
  }
  
  console.log(`    ✓ Created ${tenants.length} tenants`);
}

async function seedAttorneys(pool: Pool, attorneys: DemoAttorney[]): Promise<void> {
  console.log('  Seeding attorneys...');
  
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  
  for (const attorney of attorneys) {
    await pool.query(
      `INSERT INTO attorneys (
        id, tenant_id, email, display_name, role, practice_group,
        bar_number, bar_state, password_hash, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
      ON CONFLICT (tenant_id, email) DO NOTHING`,
      [
        attorney.id, attorney.tenantId, attorney.email, attorney.displayName,
        attorney.role, attorney.practiceGroup, attorney.barNumber,
        attorney.barState, passwordHash
      ]
    );
  }
  
  console.log(`    ✓ Created ${attorneys.length} attorneys`);
  console.log(`    ℹ Demo password: ${DEMO_PASSWORD}`);
}

async function seedMatters(pool: Pool, matters: DemoMatter[], attorneys: DemoAttorney[]): Promise<void> {
  console.log('  Seeding matters...');
  
  for (const matter of matters) {
    const leadAttorney = attorneys.find(a => a.tenantId === matter.tenantId && a.role === 'partner');
    const creator = attorneys.find(a => a.tenantId === matter.tenantId && a.role === 'admin');
    
    await pool.query(
      `INSERT INTO matters (
        id, tenant_id, matter_code, matter_name, matter_type, client_name,
        counterparty_name, governing_law_state, status, priority, health_score,
        deal_value_cents, lead_attorney_id, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [
        matter.id, matter.tenantId, matter.matterCode, matter.matterName,
        matter.matterType, matter.clientName, matter.counterpartyName,
        matter.governingLawState, matter.status, matter.priority, matter.healthScore,
        matter.dealValueCents, leadAttorney?.id, creator?.id
      ]
    );
  }
  
  console.log(`    ✓ Created ${matters.length} matters`);
}

async function seedPlaybooks(pool: Pool, tenants: DemoTenant[]): Promise<void> {
  console.log('  Seeding playbooks...');
  
  const playbookTemplates = [
    { name: 'M&A Standard Playbook', matterTypes: ['ma_transaction'], description: 'Standard due diligence and negotiation playbook for M&A transactions' },
    { name: 'Commercial Contracts', matterTypes: ['commercial_contract'], description: 'Standard terms for commercial agreements' },
    { name: 'Employment Agreements', matterTypes: ['employment'], description: 'Compliance-focused playbook for employment matters' },
    { name: 'IP Licensing', matterTypes: ['ip'], description: 'Intellectual property licensing standards' },
  ];
  
  let count = 0;
  for (const tenant of tenants) {
    for (const template of playbookTemplates) {
      const playbookId = randomUUID();
      
      await pool.query(
        `INSERT INTO playbooks (id, tenant_id, name, description, matter_types, is_default, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT DO NOTHING`,
        [playbookId, tenant.id, template.name, template.description, template.matterTypes, count === 0]
      );
      
      // Add some rules
      const rules = [
        { ruleId: 'r001', clauseType: 'indemnification', condition: 'missing', severity: 'high', description: 'Indemnification clause is required' },
        { ruleId: 'r002', clauseType: 'limitation_of_liability', condition: 'missing', severity: 'high', description: 'Liability cap must be specified' },
        { ruleId: 'r003', clauseType: 'governing_law', condition: 'missing', severity: 'medium', description: 'Governing law must be specified' },
        { ruleId: 'r004', clauseType: 'termination_for_cause', condition: 'missing', severity: 'medium', description: 'Termination provisions required' },
      ];
      
      for (const rule of rules) {
        await pool.query(
          `INSERT INTO playbook_rules (id, playbook_id, rule_id, clause_type, condition, severity, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT DO NOTHING`,
          [randomUUID(), playbookId, rule.ruleId, rule.clauseType, rule.condition, rule.severity, rule.description]
        );
      }
      
      count++;
    }
  }
  
  console.log(`    ✓ Created ${count} playbooks with rules`);
}

async function seedObligations(pool: Pool, matters: DemoMatter[], attorneys: DemoAttorney[]): Promise<void> {
  console.log('  Seeding obligations...');
  
  const obligationTemplates = [
    { description: 'Execute final agreement', daysFromNow: 30, status: 'pending' },
    { description: 'Deliver closing documents', daysFromNow: 45, status: 'pending' },
    { description: 'Complete due diligence review', daysFromNow: -5, status: 'overdue' },
    { description: 'Submit regulatory filing', daysFromNow: 15, status: 'acknowledged' },
    { description: 'Obtain board approval', daysFromNow: 7, status: 'pending' },
  ];
  
  let count = 0;
  for (const matter of matters.slice(0, 15)) {
    const assignee = attorneys.find(a => a.tenantId === matter.tenantId && a.role === 'attorney');
    
    const template = obligationTemplates[count % obligationTemplates.length];
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + template.daysFromNow);
    
    await pool.query(
      `INSERT INTO obligations (
        id, tenant_id, matter_id, description, deadline, status,
        assigned_attorney_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT DO NOTHING`,
      [
        randomUUID(), matter.tenantId, matter.id, template.description,
        deadline.toISOString(), template.status, assignee?.id
      ]
    );
    
    count++;
  }
  
  console.log(`    ✓ Created ${count} obligations`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║        EvidentIS Demo Data Seeding            ║');
  console.log('╚═══════════════════════════════════════════╝\n');
  
  // Safety check
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
    console.error('❌ ERROR: Cannot seed demo data in production!');
    console.error('   Set SEED_DEMO_DATA=true to override (not recommended)');
    process.exit(1);
  }
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    console.log('📊 Generating demo data...\n');
    
    const attorneys = createDemoAttorneys(demoTenants);
    const matters = createDemoMatters(demoTenants, attorneys);
    
    console.log('💾 Inserting into database...\n');
    
    await seedTenants(pool, demoTenants);
    await seedAttorneys(pool, attorneys);
    await seedMatters(pool, matters, attorneys);
    await seedPlaybooks(pool, demoTenants);
    await seedObligations(pool, matters, attorneys);
    
    console.log('\n✅ Demo data seeded successfully!\n');
    
    console.log('📝 Demo Login Credentials:');
    console.log('   ─────────────────────────');
    demoTenants.forEach(tenant => {
      console.log(`\n   ${tenant.name} (${tenant.slug})`);
      console.log(`   • Admin: admin@${tenant.slug}.com`);
      console.log(`   • Partner: partner@${tenant.slug}.com`);
      console.log(`   • Password: ${DEMO_PASSWORD}`);
    });
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
main();

export { main as seedDatabase };
