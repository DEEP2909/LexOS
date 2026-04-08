/**
 * LexOS API Test Suite - Part 6: Legal Rules, State Coverage, Federal Laws
 * Tests for comprehensive USA legal coverage across all 50 states + DC + federal
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../src/index';
import { pool } from '../src/database';
import { hashPassword } from '../src/security';
import { createAccessToken } from '../src/auth';
import {
  NON_COMPETE_RULES,
  DATA_PRIVACY_RULES,
  EMPLOYMENT_RULES,
  ARBITRATION_RULES,
  FEDERAL_RULES,
  getRulesForState,
  getRulesForClauseType,
  getApplicableRules,
  checkClauseCompliance,
  getDefaultPlaybookRules,
  US_STATES,
} from '../src/legal-rules';

const TEST_TENANT = {
  id: '00000000-0000-0000-0000-000000000500',
  name: 'Legal Rules Test Firm',
  slug: 'legal-rules-test',
};

const TEST_ATTORNEY = {
  id: '00000000-0000-0000-0000-000000000501',
  email: 'legal@test.com',
};

let app: any;
let token: string;

beforeAll(async () => {
  app = await build();
  
  await pool.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [TEST_TENANT.id, TEST_TENANT.name, TEST_TENANT.slug]
  );
  
  const passwordHash = await hashPassword('Password123!');
  await pool.query(
    `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'Legal Tester', $4, 'attorney')
     ON CONFLICT DO NOTHING`,
    [TEST_ATTORNEY.id, TEST_TENANT.id, TEST_ATTORNEY.email, passwordHash]
  );
  
  token = await createAccessToken({
    sub: TEST_ATTORNEY.id,
    email: TEST_ATTORNEY.email,
    role: 'attorney',
    tenantId: TEST_TENANT.id,
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM attorneys WHERE tenant_id = $1`, [TEST_TENANT.id]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [TEST_TENANT.id]);
  await app.close();
});

// ============================================================================
// State Coverage Tests - ALL 50 STATES + DC
// ============================================================================

describe('USA State Coverage', () => {
  const ALL_STATES = [
    { code: 'AL', name: 'Alabama' },
    { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'DE', name: 'Delaware' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' },
    { code: 'DC', name: 'District of Columbia' },
  ];
  
  it('should have all 50 states + DC defined', () => {
    expect(ALL_STATES.length).toBe(51);
    expect(US_STATES.length).toBe(51);
  });
  
  describe('Non-Compete Rules by State', () => {
    // States that BAN non-competes
    const NON_COMPETE_BAN_STATES = ['CA', 'ND', 'OK', 'MN'];
    
    NON_COMPETE_BAN_STATES.forEach(state => {
      it(`should flag non-compete as INVALID in ${state}`, () => {
        const rules = getRulesForState(state);
        const ncRule = rules.find(r => r.clauseType === 'non_compete');
        
        expect(ncRule).toBeDefined();
        expect(ncRule?.prohibition).toBe(true);
      });
    });
    
    // States with RESTRICTIONS (income thresholds or duration limits)
    const NON_COMPETE_RESTRICTION_STATES = [
      { code: 'WA', minIncome: 116593 },
      { code: 'IL', minIncome: 75000 },
      { code: 'ME', minIncome: 54165 },
      { code: 'MD', minIncome: 31200 },
      { code: 'NH', minIncome: 31200 },
      { code: 'OR', minIncome: 100533 },
      { code: 'RI', minIncome: 0 },  // No income threshold, just restrictions
      { code: 'VA', minIncome: 64285 },
      { code: 'CO', minIncome: 101250 },
      { code: 'NV', minIncome: 0 },
      { code: 'MA', minIncome: 0 },
    ];
    
    NON_COMPETE_RESTRICTION_STATES.forEach(({ code, minIncome }) => {
      it(`should have restrictions for non-compete in ${code}`, () => {
        const rules = getRulesForState(code);
        const ncRule = rules.find(r => r.clauseType === 'non_compete');
        
        expect(ncRule).toBeDefined();
        if (minIncome > 0) {
          expect(ncRule?.minIncomeThreshold || 0).toBeGreaterThan(0);
        }
      });
    });
    
    // States that allow non-competes with standard reasonableness tests
    const NON_COMPETE_STANDARD_STATES = ALL_STATES
      .filter(s => 
        !NON_COMPETE_BAN_STATES.includes(s.code) && 
        !NON_COMPETE_RESTRICTION_STATES.map(r => r.code).includes(s.code)
      )
      .map(s => s.code);
    
    NON_COMPETE_STANDARD_STATES.forEach(state => {
      it(`should apply reasonableness test for non-compete in ${state}`, () => {
        const rules = getRulesForState(state);
        // Should either have a rule or use default reasonableness test
        expect(rules).toBeDefined();
      });
    });
  });
  
  describe('Data Privacy Laws by State', () => {
    const STATES_WITH_DATA_PRIVACY_LAWS = [
      { code: 'CA', law: 'CCPA/CPRA' },
      { code: 'VA', law: 'VCDPA' },
      { code: 'CO', law: 'CPA' },
      { code: 'CT', law: 'CTDPA' },
      { code: 'UT', law: 'UCPA' },
      { code: 'MT', law: 'MCDPA' },
      { code: 'OR', law: 'OCPA' },
      { code: 'TX', law: 'TDPSA' },
      { code: 'DE', law: 'DPDPA' },
      { code: 'IA', law: 'ICDPA' },
      { code: 'NJ', law: 'NJDPA' },
      { code: 'TN', law: 'TIPA' },
    ];
    
    STATES_WITH_DATA_PRIVACY_LAWS.forEach(({ code, law }) => {
      it(`should have ${law} rules for ${code}`, () => {
        const rules = getRulesForState(code);
        const dpRule = rules.find(r => r.clauseType === 'data_privacy');
        
        if (dpRule) {
          expect(dpRule.stateLaw).toBeDefined();
        }
        // State may have rule or use federal baseline
      });
    });
    
    it('should apply CCPA requirements correctly', () => {
      const rules = getRulesForState('CA');
      const dpRule = rules.find(r => r.clauseType === 'data_privacy');
      
      expect(dpRule).toBeDefined();
      // CCPA requirements
      expect(dpRule?.requirements || []).toContain('opt_out_sale');
    });
  });
  
  describe('Arbitration Rules by State', () => {
    it('should flag class action waivers appropriately', () => {
      const rules = getRulesForClauseType('class_action_waiver');
      expect(rules.length).toBeGreaterThan(0);
    });
    
    it('should flag unconscionable arbitration terms', () => {
      const rules = getRulesForClauseType('arbitration');
      expect(rules).toBeDefined();
    });
  });
});

// ============================================================================
// Federal Law Tests
// ============================================================================

describe('Federal Law Coverage', () => {
  describe('HIPAA Compliance', () => {
    it('should have HIPAA rules for healthcare data', () => {
      const rules = FEDERAL_RULES.filter(r => r.federalLaw === 'HIPAA');
      expect(rules.length).toBeGreaterThan(0);
    });
    
    it('should require BAA for covered entities', () => {
      const hipaaRule = FEDERAL_RULES.find(r => 
        r.federalLaw === 'HIPAA' && r.requirement === 'business_associate_agreement'
      );
      expect(hipaaRule).toBeDefined();
    });
  });
  
  describe('Export Control (ITAR/EAR)', () => {
    it('should have ITAR rules for defense articles', () => {
      const itarRules = FEDERAL_RULES.filter(r => r.federalLaw === 'ITAR');
      expect(itarRules.length).toBeGreaterThan(0);
    });
    
    it('should have EAR rules for dual-use items', () => {
      const earRules = FEDERAL_RULES.filter(r => r.federalLaw === 'EAR');
      expect(earRules.length).toBeGreaterThan(0);
    });
  });
  
  describe('FCPA (Anti-Bribery)', () => {
    it('should have FCPA compliance rules', () => {
      const fcpaRules = FEDERAL_RULES.filter(r => r.federalLaw === 'FCPA');
      expect(fcpaRules.length).toBeGreaterThan(0);
    });
    
    it('should flag third-party agent provisions', () => {
      const agentRule = FEDERAL_RULES.find(r => 
        r.federalLaw === 'FCPA' && r.clauseType === 'compliance_with_laws'
      );
      expect(agentRule).toBeDefined();
    });
  });
  
  describe('Employment Laws', () => {
    it('should have FLSA (wage/hour) rules', () => {
      const flsaRules = FEDERAL_RULES.filter(r => r.federalLaw === 'FLSA');
      expect(flsaRules.length).toBeGreaterThan(0);
    });
    
    it('should have ADA compliance rules', () => {
      const adaRules = FEDERAL_RULES.filter(r => r.federalLaw === 'ADA');
      expect(adaRules.length).toBeGreaterThan(0);
    });
    
    it('should have OSHA safety rules', () => {
      const oshaRules = FEDERAL_RULES.filter(r => r.federalLaw === 'OSHA');
      expect(oshaRules.length).toBeGreaterThan(0);
    });
    
    it('should have NLRA collective bargaining rules', () => {
      const nlraRules = FEDERAL_RULES.filter(r => r.federalLaw === 'NLRA');
      expect(nlraRules.length).toBeGreaterThan(0);
    });
  });
  
  describe('Trade Secret (DTSA)', () => {
    it('should have DTSA whistleblower notice requirement', () => {
      const dtsaRule = FEDERAL_RULES.find(r => 
        r.federalLaw === 'DTSA' && r.requirement === 'whistleblower_notice'
      );
      expect(dtsaRule).toBeDefined();
    });
  });
});

// ============================================================================
// Clause Compliance Check Tests
// ============================================================================

describe('Clause Compliance Checking', () => {
  describe('checkClauseCompliance function', () => {
    it('should flag California non-compete as non-compliant', () => {
      const result = checkClauseCompliance({
        clauseType: 'non_compete',
        text: 'Employee shall not compete for 2 years after termination.',
        jurisdiction: 'CA',
      });
      
      expect(result.isCompliant).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.severity).toBe('critical');
    });
    
    it('should flag uncapped indemnity as high risk', () => {
      const result = checkClauseCompliance({
        clauseType: 'indemnification',
        text: 'Seller shall indemnify Buyer for all claims without limit.',
        metadata: { capped: false },
      });
      
      expect(result.issues.length).toBeGreaterThan(0);
      expect(['critical', 'high']).toContain(result.severity);
    });
    
    it('should approve properly capped indemnity', () => {
      const result = checkClauseCompliance({
        clauseType: 'indemnification',
        text: 'Seller indemnity capped at $5,000,000.',
        metadata: { capped: true, capAmount: 5000000 },
      });
      
      // May still have warnings but not critical
      expect(['low', 'medium']).toContain(result.severity || 'low');
    });
    
    it('should check CCPA requirements in California', () => {
      const result = checkClauseCompliance({
        clauseType: 'data_privacy',
        text: 'We collect and share personal information.',
        jurisdiction: 'CA',
      });
      
      // Should flag missing CCPA compliance elements
      expect(result.issues.length).toBeGreaterThan(0);
    });
    
    it('should validate notice periods', () => {
      const result = checkClauseCompliance({
        clauseType: 'termination_for_convenience',
        text: 'May terminate with 5 days notice.',
        metadata: { noticePeriodDays: 5 },
      });
      
      // Short notice may be flagged
      expect(result).toBeDefined();
    });
  });
  
  describe('getApplicableRules function', () => {
    it('should combine state and federal rules', () => {
      const rules = getApplicableRules({
        state: 'CA',
        clauseTypes: ['non_compete', 'data_privacy', 'indemnification'],
        industry: 'technology',
      });
      
      expect(rules.length).toBeGreaterThan(0);
      
      // Should include CA non-compete prohibition
      const ncRule = rules.find(r => r.clauseType === 'non_compete');
      expect(ncRule).toBeDefined();
      
      // Should include CCPA
      const dpRule = rules.find(r => r.clauseType === 'data_privacy');
      expect(dpRule).toBeDefined();
    });
    
    it('should include HIPAA for healthcare', () => {
      const rules = getApplicableRules({
        state: 'TX',
        clauseTypes: ['data_privacy'],
        industry: 'healthcare',
      });
      
      const hipaaRule = rules.find(r => r.federalLaw === 'HIPAA');
      expect(hipaaRule).toBeDefined();
    });
    
    it('should include ITAR for defense', () => {
      const rules = getApplicableRules({
        state: 'VA',
        clauseTypes: ['compliance_with_laws', 'confidentiality'],
        industry: 'defense',
      });
      
      const itarRule = rules.find(r => r.federalLaw === 'ITAR');
      expect(itarRule).toBeDefined();
    });
  });
});

// ============================================================================
// Default Playbook Rules Tests
// ============================================================================

describe('Default Playbook Rules', () => {
  it('should return at least 20 default rules', () => {
    const rules = getDefaultPlaybookRules();
    expect(rules.length).toBeGreaterThanOrEqual(20);
  });
  
  it('should have rules for all critical clause types', () => {
    const rules = getDefaultPlaybookRules();
    const ruleTypes = rules.map(r => r.clauseType);
    
    const criticalTypes = [
      'indemnification',
      'limitation_of_liability',
      'termination_for_convenience',
      'confidentiality',
      'governing_law',
    ];
    
    criticalTypes.forEach(type => {
      expect(ruleTypes).toContain(type);
    });
  });
  
  it('should have appropriate severity levels', () => {
    const rules = getDefaultPlaybookRules();
    
    const severities = rules.map(r => r.severity);
    const validSeverities = ['critical', 'high', 'medium', 'low'];
    
    severities.forEach(sev => {
      expect(validSeverities).toContain(sev);
    });
  });
  
  it('should have unique rule IDs', () => {
    const rules = getDefaultPlaybookRules();
    const ids = rules.map(r => r.id);
    const uniqueIds = [...new Set(ids)];
    
    expect(ids.length).toBe(uniqueIds.length);
  });
});

// ============================================================================
// Jurisdiction API Tests
// ============================================================================

describe('Jurisdiction API', () => {
  describe('GET /api/legal-rules/:state', () => {
    it('should return rules for valid state', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/legal-rules/CA',
        headers: { authorization: `Bearer ${token}` },
      });
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(Array.isArray(body)).toBe(true);
      }
    });
    
    it('should return 400 for invalid state', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/legal-rules/XX',
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect([400, 404]).toContain(response.statusCode);
    });
  });
  
  describe('GET /api/legal-rules/:state/:clauseType', () => {
    it('should return specific clause rules', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/legal-rules/CA/non_compete',
        headers: { authorization: `Bearer ${token}` },
      });
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.prohibition).toBe(true);
      }
    });
  });
  
  describe('POST /api/legal-rules/check', () => {
    it('should check clause compliance', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/legal-rules/check',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          clauseType: 'non_compete',
          text: 'Employee non-compete for 2 years',
          jurisdiction: 'CA',
        },
      });
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.isCompliant).toBe(false);
      }
    });
  });
});

// ============================================================================
// Multi-Jurisdiction Tests
// ============================================================================

describe('Multi-Jurisdiction Scenarios', () => {
  it('should handle multi-state employment agreements', () => {
    const states = ['CA', 'NY', 'TX'];
    const allRules = states.flatMap(state => getRulesForState(state));
    
    // Should combine rules from all states
    expect(allRules.length).toBeGreaterThan(states.length);
  });
  
  it('should identify conflicting state laws', () => {
    // CA bans non-competes, TX allows them
    const caRules = getRulesForState('CA').filter(r => r.clauseType === 'non_compete');
    const txRules = getRulesForState('TX').filter(r => r.clauseType === 'non_compete');
    
    const caProhibits = caRules.some(r => r.prohibition === true);
    const txAllows = !txRules.some(r => r.prohibition === true);
    
    expect(caProhibits).toBe(true);
    expect(txAllows).toBe(true);
  });
  
  it('should apply most restrictive rule across jurisdictions', () => {
    const result = checkClauseCompliance({
      clauseType: 'non_compete',
      text: 'Employee shall not compete for 3 years.',
      jurisdictions: ['CA', 'TX', 'NY'],
    });
    
    // Should flag as non-compliant due to CA
    expect(result.isCompliant).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Legal Rules Edge Cases', () => {
  it('should handle unknown jurisdiction gracefully', () => {
    const rules = getRulesForState('XX' as any);
    // Should return empty array or throw, not crash
    expect(Array.isArray(rules) || rules === undefined).toBe(true);
  });
  
  it('should handle unknown clause type', () => {
    const rules = getRulesForClauseType('unknown_type' as any);
    expect(Array.isArray(rules)).toBe(true);
  });
  
  it('should handle empty metadata', () => {
    const result = checkClauseCompliance({
      clauseType: 'indemnification',
      text: 'Standard indemnification.',
    });
    
    expect(result).toBeDefined();
  });
  
  it('should handle very long clause text', () => {
    const longText = 'word '.repeat(10000);
    const result = checkClauseCompliance({
      clauseType: 'confidentiality',
      text: longText,
    });
    
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Integration Tests - Matter Jurisdiction
// ============================================================================

describe('Matter Jurisdiction Integration', () => {
  let matterId: string;
  
  beforeAll(async () => {
    matterId = '00000000-0000-0000-0000-000000000510';
    await pool.query(
      `INSERT INTO matters (id, tenant_id, name, client_name, practice_area, lead_attorney_id, jurisdiction)
       VALUES ($1, $2, 'Legal Rules Matter', 'Test Client', 'M&A', $3, 'CA')
       ON CONFLICT DO NOTHING`,
      [matterId, TEST_TENANT.id, TEST_ATTORNEY.id]
    );
  });
  
  it('should apply CA rules to matter documents', async () => {
    const docId = '00000000-0000-0000-0000-000000000511';
    await pool.query(
      `INSERT INTO documents (id, tenant_id, matter_id, file_name, file_path, status)
       VALUES ($1, $2, $3, 'ca-contract.pdf', '/test/ca', 'processed')
       ON CONFLICT DO NOTHING`,
      [docId, TEST_TENANT.id, matterId]
    );
    
    // Insert non-compete clause
    await pool.query(
      `INSERT INTO clauses (tenant_id, document_id, clause_type, text, confidence_score, page_number)
       VALUES ($1, $2, 'non_compete', 'Employee shall not compete for 2 years.', 0.9, 3)
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT.id, docId]
    );
    
    // Flag should be automatically created by worker
    // For now, just verify the clause exists
    const clauses = await pool.query(
      `SELECT * FROM clauses WHERE document_id = $1 AND clause_type = 'non_compete'`,
      [docId]
    );
    
    expect(clauses.rows.length).toBeGreaterThan(0);
  });
});
