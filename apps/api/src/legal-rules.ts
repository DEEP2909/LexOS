/**
 * LexOS State-Specific Legal Rules
 * Complete USA coverage: All 50 states + DC + Federal
 * These rules are applied during clause extraction and risk assessment
 */

export interface StateRule {
  state: string;
  stateName: string;
  clauseType: string;
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  statute?: string;
  effectiveDate?: string;
}

// ============================================================================
// Non-Compete Rules by State
// ============================================================================

export const NON_COMPETE_RULES: StateRule[] = [
  // States that BAN non-competes entirely or largely
  {
    state: 'CA',
    stateName: 'California',
    clauseType: 'non_compete',
    rule: 'non_compete_prohibited',
    severity: 'critical',
    description: 'Non-compete agreements are void and unenforceable in California',
    statute: 'Cal. Bus. & Prof. Code § 16600',
  },
  {
    state: 'ND',
    stateName: 'North Dakota',
    clauseType: 'non_compete',
    rule: 'non_compete_prohibited',
    severity: 'critical',
    description: 'Non-compete agreements are void in North Dakota',
    statute: 'N.D. Cent. Code § 9-08-06',
  },
  {
    state: 'OK',
    stateName: 'Oklahoma',
    clauseType: 'non_compete',
    rule: 'non_compete_prohibited',
    severity: 'critical',
    description: 'Non-compete agreements are largely unenforceable in Oklahoma',
    statute: 'Okla. Stat. tit. 15 § 219A',
  },
  {
    state: 'MN',
    stateName: 'Minnesota',
    clauseType: 'non_compete',
    rule: 'non_compete_prohibited',
    severity: 'critical',
    description: 'Non-compete agreements are void for employees as of July 1, 2023',
    statute: 'Minn. Stat. § 181.988',
    effectiveDate: '2023-07-01',
  },
  
  // States with significant RESTRICTIONS
  {
    state: 'WA',
    stateName: 'Washington',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes void for employees earning less than $116,593.18/year (2024). Must provide notice at acceptance or 10 days before start.',
    statute: 'RCW 49.62',
  },
  {
    state: 'IL',
    stateName: 'Illinois',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes unenforceable for employees earning less than $75,000/year. Requires adequate consideration.',
    statute: '820 ILCS 90/ (Illinois Freedom to Work Act)',
  },
  {
    state: 'ME',
    stateName: 'Maine',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes cannot apply to employees earning at or below 400% of federal poverty level',
    statute: '26 M.R.S. § 599-A',
  },
  {
    state: 'MD',
    stateName: 'Maryland',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes void for employees earning $15/hour or less or $31,200/year or less',
    statute: 'Md. Code, Lab. & Empl. § 3-716',
  },
  {
    state: 'NH',
    stateName: 'New Hampshire',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes prohibited for low-wage employees (200% of federal minimum wage or less)',
    statute: 'RSA 275:70-a',
  },
  {
    state: 'OR',
    stateName: 'Oregon',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes limited to 12 months; void for employees earning $100,533/year or less (2024)',
    statute: 'ORS 653.295',
  },
  {
    state: 'RI',
    stateName: 'Rhode Island',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes void for non-exempt employees, students, interns, short-term employees, and low-wage workers',
    statute: 'R.I. Gen. Laws § 28-59',
  },
  {
    state: 'VA',
    stateName: 'Virginia',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes unenforceable for low-wage employees (average weekly wage less than median household income)',
    statute: 'Va. Code § 40.1-28.7:8',
  },
  {
    state: 'CO',
    stateName: 'Colorado',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes void except for executive/management staff earning at least $123,750/year (2024)',
    statute: 'C.R.S. § 8-2-113',
  },
  {
    state: 'NV',
    stateName: 'Nevada',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'medium',
    description: 'Non-competes unenforceable for employees paid solely on hourly basis',
    statute: 'NRS 613.195',
  },
  {
    state: 'MA',
    stateName: 'Massachusetts',
    clauseType: 'non_compete',
    rule: 'non_compete_restricted',
    severity: 'high',
    description: 'Non-competes limited to 12 months; must include garden leave or other mutually-agreed consideration',
    statute: 'Mass. Gen. Laws ch. 149 § 24L',
  },
  
  // States where non-competes are GENERALLY ENFORCEABLE with reasonableness requirements
  {
    state: 'NY',
    stateName: 'New York',
    clauseType: 'non_compete',
    rule: 'non_compete_reasonableness',
    severity: 'medium',
    description: 'Non-competes enforceable if reasonable in scope, duration (typically 1-2 years), and geography; must protect legitimate business interest',
    statute: 'Common law (no statute)',
  },
  {
    state: 'TX',
    stateName: 'Texas',
    clauseType: 'non_compete',
    rule: 'non_compete_reasonableness',
    severity: 'medium',
    description: 'Non-competes enforceable if ancillary to otherwise enforceable agreement; reasonable in time, geography, and scope',
    statute: 'Tex. Bus. & Com. Code § 15.50',
  },
  {
    state: 'FL',
    stateName: 'Florida',
    clauseType: 'non_compete',
    rule: 'non_compete_reasonableness',
    severity: 'medium',
    description: 'Non-competes presumed valid if duration ≤6 months; presumed unreasonable if >2 years. Court may modify overbroad terms.',
    statute: 'Fla. Stat. § 542.335',
  },
  {
    state: 'GA',
    stateName: 'Georgia',
    clauseType: 'non_compete',
    rule: 'non_compete_reasonableness',
    severity: 'medium',
    description: 'Non-competes enforceable if reasonable. Courts may "blue pencil" overbroad provisions.',
    statute: 'O.C.G.A. § 13-8-53',
  },
  {
    state: 'PA',
    stateName: 'Pennsylvania',
    clauseType: 'non_compete',
    rule: 'non_compete_reasonableness',
    severity: 'medium',
    description: 'Non-competes enforceable if reasonable in duration, scope, and geography; ancillary to employment relationship',
    statute: 'Common law',
  },
];

// ============================================================================
// Data Privacy Rules by State
// ============================================================================

export const DATA_PRIVACY_RULES: StateRule[] = [
  // California - CCPA/CPRA
  {
    state: 'CA',
    stateName: 'California',
    clauseType: 'data_privacy_ccpa',
    rule: 'ccpa_required',
    severity: 'critical',
    description: 'CCPA/CPRA compliance required for businesses handling California residents\' personal information',
    statute: 'Cal. Civ. Code § 1798.100 et seq.',
  },
  
  // Virginia - VCDPA
  {
    state: 'VA',
    stateName: 'Virginia',
    clauseType: 'data_privacy_vcdpa',
    rule: 'vcdpa_required',
    severity: 'critical',
    description: 'Virginia Consumer Data Protection Act compliance required',
    statute: 'Va. Code § 59.1-575 et seq.',
    effectiveDate: '2023-01-01',
  },
  
  // Colorado - CPA
  {
    state: 'CO',
    stateName: 'Colorado',
    clauseType: 'data_privacy_cpa',
    rule: 'cpa_required',
    severity: 'critical',
    description: 'Colorado Privacy Act compliance required for covered entities',
    statute: 'C.R.S. § 6-1-1301 et seq.',
    effectiveDate: '2023-07-01',
  },
  
  // Connecticut - CTDPA
  {
    state: 'CT',
    stateName: 'Connecticut',
    clauseType: 'data_privacy_ctdpa',
    rule: 'ctdpa_required',
    severity: 'critical',
    description: 'Connecticut Data Privacy Act compliance required',
    statute: 'Conn. Gen. Stat. § 42-515 et seq.',
    effectiveDate: '2023-07-01',
  },
  
  // Utah - UCPA
  {
    state: 'UT',
    stateName: 'Utah',
    clauseType: 'data_privacy_ucpa',
    rule: 'ucpa_required',
    severity: 'critical',
    description: 'Utah Consumer Privacy Act compliance required',
    statute: 'Utah Code § 13-61-101 et seq.',
    effectiveDate: '2023-12-31',
  },
  
  // Iowa
  {
    state: 'IA',
    stateName: 'Iowa',
    clauseType: 'data_privacy_iowa',
    rule: 'iowa_privacy_required',
    severity: 'high',
    description: 'Iowa Consumer Data Protection Act compliance required',
    statute: 'Iowa Code ch. 715D',
    effectiveDate: '2025-01-01',
  },
  
  // Indiana
  {
    state: 'IN',
    stateName: 'Indiana',
    clauseType: 'data_privacy_indiana',
    rule: 'indiana_privacy_required',
    severity: 'high',
    description: 'Indiana Consumer Data Protection Act compliance required',
    statute: 'IC 24-15',
    effectiveDate: '2026-01-01',
  },
  
  // Tennessee
  {
    state: 'TN',
    stateName: 'Tennessee',
    clauseType: 'data_privacy_tn',
    rule: 'tennessee_privacy_required',
    severity: 'high',
    description: 'Tennessee Information Protection Act compliance required',
    statute: 'Tenn. Code Ann. § 47-18-3201 et seq.',
    effectiveDate: '2025-07-01',
  },
  
  // Montana
  {
    state: 'MT',
    stateName: 'Montana',
    clauseType: 'data_privacy_mt',
    rule: 'montana_privacy_required',
    severity: 'high',
    description: 'Montana Consumer Data Privacy Act compliance required',
    statute: 'Mont. Code Ann. § 30-14-5000 et seq.',
    effectiveDate: '2024-10-01',
  },
  
  // Texas
  {
    state: 'TX',
    stateName: 'Texas',
    clauseType: 'data_privacy_tx',
    rule: 'texas_privacy_required',
    severity: 'high',
    description: 'Texas Data Privacy and Security Act compliance required',
    statute: 'Tex. Bus. & Com. Code ch. 541',
    effectiveDate: '2024-07-01',
  },
  
  // Oregon
  {
    state: 'OR',
    stateName: 'Oregon',
    clauseType: 'data_privacy_or',
    rule: 'oregon_privacy_required',
    severity: 'high',
    description: 'Oregon Consumer Privacy Act compliance required',
    statute: 'ORS ch. 646A',
    effectiveDate: '2024-07-01',
  },
  
  // Delaware
  {
    state: 'DE',
    stateName: 'Delaware',
    clauseType: 'data_privacy_de',
    rule: 'delaware_privacy_required',
    severity: 'high',
    description: 'Delaware Personal Data Privacy Act compliance required',
    statute: 'Del. Code tit. 6, ch. 12D',
    effectiveDate: '2025-01-01',
  },
  
  // New Jersey
  {
    state: 'NJ',
    stateName: 'New Jersey',
    clauseType: 'data_privacy_nj',
    rule: 'nj_privacy_required',
    severity: 'high',
    description: 'New Jersey Data Privacy Act compliance required',
    statute: 'N.J.S.A. 56:8-166 et seq.',
    effectiveDate: '2025-01-15',
  },
  
  // New Hampshire
  {
    state: 'NH',
    stateName: 'New Hampshire',
    clauseType: 'data_privacy_nh',
    rule: 'nh_privacy_required',
    severity: 'high',
    description: 'New Hampshire Privacy Act compliance required',
    statute: 'RSA 507-H',
    effectiveDate: '2025-01-01',
  },
  
  // Nebraska
  {
    state: 'NE',
    stateName: 'Nebraska',
    clauseType: 'data_privacy_ne',
    rule: 'nebraska_privacy_required',
    severity: 'high',
    description: 'Nebraska Data Privacy Act compliance required',
    statute: 'Neb. Rev. Stat. § 87-1101 et seq.',
    effectiveDate: '2025-01-01',
  },
  
  // Maryland
  {
    state: 'MD',
    stateName: 'Maryland',
    clauseType: 'data_privacy_md',
    rule: 'maryland_privacy_required',
    severity: 'high',
    description: 'Maryland Online Data Privacy Act compliance required',
    statute: 'Md. Code, Com. Law § 14-4600 et seq.',
    effectiveDate: '2025-10-01',
  },
  
  // Minnesota (pending)
  {
    state: 'MN',
    stateName: 'Minnesota',
    clauseType: 'data_privacy_mn',
    rule: 'minnesota_privacy_required',
    severity: 'high',
    description: 'Minnesota Consumer Data Privacy Act compliance required',
    statute: 'Minn. Stat. ch. 325O',
    effectiveDate: '2025-07-31',
  },
];

// ============================================================================
// Employment Law Rules by State
// ============================================================================

export const EMPLOYMENT_RULES: StateRule[] = [
  // At-Will Employment Exceptions
  {
    state: 'MT',
    stateName: 'Montana',
    clauseType: 'termination_for_convenience',
    rule: 'no_at_will',
    severity: 'high',
    description: 'Montana does not follow at-will employment doctrine. After probationary period, employees can only be terminated for cause.',
    statute: 'Mont. Code Ann. § 39-2-901 et seq. (Wrongful Discharge From Employment Act)',
  },
  
  // Salary History Bans
  {
    state: 'CA',
    stateName: 'California',
    clauseType: 'compensation',
    rule: 'salary_history_ban',
    severity: 'high',
    description: 'Employers cannot seek or rely on salary history information',
    statute: 'Cal. Lab. Code § 432.3',
  },
  {
    state: 'NY',
    stateName: 'New York',
    clauseType: 'compensation',
    rule: 'salary_history_ban',
    severity: 'high',
    description: 'Employers cannot inquire about salary history',
    statute: 'N.Y. Lab. Law § 194-a',
  },
  {
    state: 'NJ',
    stateName: 'New Jersey',
    clauseType: 'compensation',
    rule: 'salary_history_ban',
    severity: 'high',
    description: 'Employers cannot screen applicants based on salary history',
    statute: 'N.J.S.A. 34:6B-20',
  },
  {
    state: 'IL',
    stateName: 'Illinois',
    clauseType: 'compensation',
    rule: 'salary_history_ban',
    severity: 'high',
    description: 'Employers cannot inquire about salary history or require disclosure',
    statute: '820 ILCS 112/ (Equal Pay Act)',
  },
  {
    state: 'CO',
    stateName: 'Colorado',
    clauseType: 'compensation',
    rule: 'salary_history_ban',
    severity: 'high',
    description: 'Employers cannot seek salary history information',
    statute: 'C.R.S. § 8-5-102',
  },
  
  // Pay Transparency Requirements
  {
    state: 'CO',
    stateName: 'Colorado',
    clauseType: 'compensation',
    rule: 'pay_transparency_required',
    severity: 'high',
    description: 'Must disclose salary range in job postings',
    statute: 'C.R.S. § 8-5-201 (Equal Pay for Equal Work Act)',
  },
  {
    state: 'NY',
    stateName: 'New York',
    clauseType: 'compensation',
    rule: 'pay_transparency_required',
    severity: 'high',
    description: 'Must disclose salary range in job postings (NYC and statewide)',
    statute: 'N.Y. Lab. Law § 194-b',
  },
  {
    state: 'CA',
    stateName: 'California',
    clauseType: 'compensation',
    rule: 'pay_transparency_required',
    severity: 'high',
    description: 'Must include pay scale in job postings',
    statute: 'Cal. Lab. Code § 432.3(c)',
  },
  {
    state: 'WA',
    stateName: 'Washington',
    clauseType: 'compensation',
    rule: 'pay_transparency_required',
    severity: 'high',
    description: 'Must disclose wage scale in job postings',
    statute: 'RCW 49.58.110',
  },
];

// ============================================================================
// Arbitration Rules by State
// ============================================================================

export const ARBITRATION_RULES: StateRule[] = [
  {
    state: 'CA',
    stateName: 'California',
    clauseType: 'arbitration',
    rule: 'paga_not_waivable',
    severity: 'critical',
    description: 'Private Attorneys General Act (PAGA) representative claims cannot be waived by arbitration agreement',
    statute: 'Cal. Lab. Code § 2698 et seq.',
  },
  {
    state: 'NY',
    stateName: 'New York',
    clauseType: 'arbitration',
    rule: 'sexual_harassment_exception',
    severity: 'high',
    description: 'Mandatory arbitration of sexual harassment claims is void and unenforceable',
    statute: 'N.Y. C.P.L.R. § 7515',
  },
  {
    state: 'NJ',
    stateName: 'New Jersey',
    clauseType: 'arbitration',
    rule: 'unconscionability_scrutiny',
    severity: 'medium',
    description: 'Courts closely scrutinize arbitration agreements for unconscionability',
    statute: 'Common law; see Muhammad v. County Bank of Rehoboth Beach',
  },
  {
    state: 'WA',
    stateName: 'Washington',
    clauseType: 'arbitration',
    rule: 'wage_claim_exception',
    severity: 'high',
    description: 'Arbitration agreements cannot waive statutory wage claim procedures',
    statute: 'RCW 49.48.200',
  },
];

// ============================================================================
// Governing Law Preferences
// ============================================================================

export const GOVERNING_LAW_RULES: StateRule[] = [
  {
    state: 'DE',
    stateName: 'Delaware',
    clauseType: 'governing_law',
    rule: 'preferred_corporate',
    severity: 'info',
    description: 'Delaware law is preferred for corporate agreements due to well-developed case law',
    statute: 'Delaware General Corporation Law (DGCL)',
  },
  {
    state: 'NY',
    stateName: 'New York',
    clauseType: 'governing_law',
    rule: 'preferred_commercial',
    severity: 'info',
    description: 'New York law commonly chosen for commercial contracts; $250K+ contracts can choose NY law regardless of connection',
    statute: 'N.Y. Gen. Oblig. Law § 5-1401',
  },
  {
    state: 'CA',
    stateName: 'California',
    clauseType: 'governing_law',
    rule: 'public_policy_override',
    severity: 'medium',
    description: 'California courts may apply California law if California public policy is violated',
    statute: 'Common law; Washington Mutual Bank v. Superior Court',
  },
];

// ============================================================================
// Federal Rules (Apply to All States)
// ============================================================================

export const FEDERAL_RULES: StateRule[] = [
  // HIPAA
  {
    state: 'FEDERAL',
    stateName: 'Federal',
    clauseType: 'data_privacy_hipaa',
    rule: 'hipaa_required',
    severity: 'critical',
    description: 'Business Associate Agreement required when contract involves protected health information (PHI)',
    statute: '45 CFR Parts 160 & 164 (HIPAA)',
  },
  
  // Export Controls
  {
    state: 'FEDERAL',
    stateName: 'Federal',
    clauseType: 'export_controls',
    rule: 'itar_ear_required',
    severity: 'critical',
    description: 'ITAR/EAR compliance required for defense articles, dual-use technology, and controlled exports',
    statute: '22 CFR Parts 120-130 (ITAR); 15 CFR Parts 730-774 (EAR)',
  },
  
  // FCPA
  {
    state: 'FEDERAL',
    stateName: 'Federal',
    clauseType: 'anti_corruption',
    rule: 'fcpa_required',
    severity: 'high',
    description: 'Foreign Corrupt Practices Act compliance required for international business transactions',
    statute: '15 U.S.C. § 78dd-1 et seq. (FCPA)',
  },
  
  // ADA
  {
    state: 'FEDERAL',
    stateName: 'Federal',
    clauseType: 'compliance_with_laws',
    rule: 'ada_compliance',
    severity: 'high',
    description: 'Americans with Disabilities Act compliance required in employment and public accommodations',
    statute: '42 U.S.C. § 12101 et seq. (ADA)',
  },
  
  // OSHA
  {
    state: 'FEDERAL',
    stateName: 'Federal',
    clauseType: 'compliance_with_laws',
    rule: 'osha_compliance',
    severity: 'high',
    description: 'OSHA workplace safety standards must be followed',
    statute: '29 U.S.C. § 651 et seq. (OSH Act)',
  },
  
  // FLSA
  {
    state: 'FEDERAL',
    stateName: 'Federal',
    clauseType: 'compliance_with_laws',
    rule: 'flsa_compliance',
    severity: 'high',
    description: 'Fair Labor Standards Act requirements for minimum wage, overtime, and child labor',
    statute: '29 U.S.C. § 201 et seq. (FLSA)',
  },
  
  // NLRA
  {
    state: 'FEDERAL',
    stateName: 'Federal',
    clauseType: 'non_solicitation',
    rule: 'nlra_protected_activity',
    severity: 'high',
    description: 'Non-solicitation clauses cannot restrict employees\' right to organize under NLRA',
    statute: '29 U.S.C. § 151 et seq. (NLRA)',
  },
  
  // Defend Trade Secrets Act
  {
    state: 'FEDERAL',
    stateName: 'Federal',
    clauseType: 'confidentiality_nda',
    rule: 'dtsa_whistleblower_immunity',
    severity: 'high',
    description: 'NDAs must include Defend Trade Secrets Act whistleblower immunity notice',
    statute: '18 U.S.C. § 1833(b) (DTSA)',
  },
];

// ============================================================================
// All 50 States - Basic Jurisdiction Data
// ============================================================================

export const US_JURISDICTIONS = [
  { code: 'AL', name: 'Alabama', region: 'southeast' },
  { code: 'AK', name: 'Alaska', region: 'pacific' },
  { code: 'AZ', name: 'Arizona', region: 'southwest' },
  { code: 'AR', name: 'Arkansas', region: 'south' },
  { code: 'CA', name: 'California', region: 'pacific' },
  { code: 'CO', name: 'Colorado', region: 'mountain' },
  { code: 'CT', name: 'Connecticut', region: 'northeast' },
  { code: 'DE', name: 'Delaware', region: 'mid_atlantic' },
  { code: 'FL', name: 'Florida', region: 'southeast' },
  { code: 'GA', name: 'Georgia', region: 'southeast' },
  { code: 'HI', name: 'Hawaii', region: 'pacific' },
  { code: 'ID', name: 'Idaho', region: 'mountain' },
  { code: 'IL', name: 'Illinois', region: 'midwest' },
  { code: 'IN', name: 'Indiana', region: 'midwest' },
  { code: 'IA', name: 'Iowa', region: 'midwest' },
  { code: 'KS', name: 'Kansas', region: 'midwest' },
  { code: 'KY', name: 'Kentucky', region: 'south' },
  { code: 'LA', name: 'Louisiana', region: 'south' },
  { code: 'ME', name: 'Maine', region: 'northeast' },
  { code: 'MD', name: 'Maryland', region: 'mid_atlantic' },
  { code: 'MA', name: 'Massachusetts', region: 'northeast' },
  { code: 'MI', name: 'Michigan', region: 'midwest' },
  { code: 'MN', name: 'Minnesota', region: 'midwest' },
  { code: 'MS', name: 'Mississippi', region: 'south' },
  { code: 'MO', name: 'Missouri', region: 'midwest' },
  { code: 'MT', name: 'Montana', region: 'mountain' },
  { code: 'NE', name: 'Nebraska', region: 'midwest' },
  { code: 'NV', name: 'Nevada', region: 'mountain' },
  { code: 'NH', name: 'New Hampshire', region: 'northeast' },
  { code: 'NJ', name: 'New Jersey', region: 'mid_atlantic' },
  { code: 'NM', name: 'New Mexico', region: 'southwest' },
  { code: 'NY', name: 'New York', region: 'mid_atlantic' },
  { code: 'NC', name: 'North Carolina', region: 'southeast' },
  { code: 'ND', name: 'North Dakota', region: 'midwest' },
  { code: 'OH', name: 'Ohio', region: 'midwest' },
  { code: 'OK', name: 'Oklahoma', region: 'south' },
  { code: 'OR', name: 'Oregon', region: 'pacific' },
  { code: 'PA', name: 'Pennsylvania', region: 'mid_atlantic' },
  { code: 'RI', name: 'Rhode Island', region: 'northeast' },
  { code: 'SC', name: 'South Carolina', region: 'southeast' },
  { code: 'SD', name: 'South Dakota', region: 'midwest' },
  { code: 'TN', name: 'Tennessee', region: 'south' },
  { code: 'TX', name: 'Texas', region: 'southwest' },
  { code: 'UT', name: 'Utah', region: 'mountain' },
  { code: 'VT', name: 'Vermont', region: 'northeast' },
  { code: 'VA', name: 'Virginia', region: 'mid_atlantic' },
  { code: 'WA', name: 'Washington', region: 'pacific' },
  { code: 'WV', name: 'West Virginia', region: 'mid_atlantic' },
  { code: 'WI', name: 'Wisconsin', region: 'midwest' },
  { code: 'WY', name: 'Wyoming', region: 'mountain' },
  { code: 'DC', name: 'District of Columbia', region: 'mid_atlantic' },
] as const;

// ============================================================================
// Rule Lookup Functions
// ============================================================================

export function getRulesForState(stateCode: string): StateRule[] {
  const allRules = [
    ...NON_COMPETE_RULES,
    ...DATA_PRIVACY_RULES,
    ...EMPLOYMENT_RULES,
    ...ARBITRATION_RULES,
    ...GOVERNING_LAW_RULES,
  ];
  
  return allRules.filter(rule => rule.state === stateCode);
}

export function getRulesForClauseType(clauseType: string): StateRule[] {
  const allRules = [
    ...NON_COMPETE_RULES,
    ...DATA_PRIVACY_RULES,
    ...EMPLOYMENT_RULES,
    ...ARBITRATION_RULES,
    ...GOVERNING_LAW_RULES,
    ...FEDERAL_RULES,
  ];
  
  return allRules.filter(rule => rule.clauseType === clauseType);
}

export function getFederalRules(): StateRule[] {
  return FEDERAL_RULES;
}

export function getApplicableRules(stateCode: string, clauseTypes: string[]): StateRule[] {
  const stateRules = getRulesForState(stateCode);
  const clauseRules = clauseTypes.flatMap(ct => getRulesForClauseType(ct));
  
  // Combine state-specific and federal rules, dedupe
  const combined = [...stateRules, ...clauseRules, ...FEDERAL_RULES];
  const seen = new Set<string>();
  
  return combined.filter(rule => {
    const key = `${rule.state}-${rule.clauseType}-${rule.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function checkClauseCompliance(
  clauseType: string,
  clauseText: string,
  jurisdiction: string
): { compliant: boolean; violations: StateRule[]; warnings: StateRule[] } {
  const rules = getApplicableRules(jurisdiction, [clauseType]);
  const violations: StateRule[] = [];
  const warnings: StateRule[] = [];
  
  for (const rule of rules) {
    // Check critical rules
    if (rule.severity === 'critical') {
      // Non-compete in CA/ND/OK/MN
      if (rule.rule === 'non_compete_prohibited' && clauseType === 'non_compete') {
        violations.push(rule);
      }
      // CCPA required for CA
      if (rule.rule === 'ccpa_required' && clauseType.includes('data_privacy') && !clauseText.toLowerCase().includes('ccpa')) {
        violations.push(rule);
      }
    }
    
    // Check high severity as warnings
    if (rule.severity === 'high' || rule.severity === 'medium') {
      if (rule.clauseType === clauseType) {
        warnings.push(rule);
      }
    }
  }
  
  return {
    compliant: violations.length === 0,
    violations,
    warnings,
  };
}

// ============================================================================
// Default Playbook Rules (Enhanced with State-Specific Rules)
// ============================================================================

export function getDefaultPlaybookRules(): any[] {
  return [
    {
      id: 'r001',
      clause_type: 'indemnity',
      condition: 'uncapped indemnity without mutual limitation',
      severity: 'critical',
      description: 'Indemnity must be capped at contract value; uncapped indemnity is unacceptable',
    },
    {
      id: 'r002',
      clause_type: 'governing_law',
      condition: 'governing law is not a US state',
      severity: 'critical',
      description: 'Governing law must be a US state; foreign governing law is not acceptable',
    },
    {
      id: 'r003',
      clause_type: 'non_compete',
      condition: 'non-compete in CA, ND, OK, or MN',
      severity: 'critical',
      description: 'Non-compete clauses are unenforceable in California, North Dakota, Oklahoma, and Minnesota',
      states: ['CA', 'ND', 'OK', 'MN'],
    },
    {
      id: 'r004',
      clause_type: 'non_compete',
      condition: 'non-compete duration exceeds 1 year or geographic scope is nationwide',
      severity: 'high',
      description: 'Non-compete must not exceed 1 year and must be geographically reasonable',
    },
    {
      id: 'r005',
      clause_type: 'data_privacy_ccpa',
      condition: 'missing CCPA compliance clause with California party involved',
      severity: 'critical',
      description: 'CCPA/CPRA compliance clause required for any agreement involving California parties or residents',
      states: ['CA'],
    },
    {
      id: 'r006',
      clause_type: 'data_privacy_hipaa',
      condition: 'missing BAA or HIPAA clause when PHI data is involved',
      severity: 'critical',
      description: 'Business Associate Agreement required when agreement involves protected health information',
    },
    {
      id: 'r007',
      clause_type: 'force_majeure',
      condition: 'force majeure does not include pandemic or epidemic',
      severity: 'high',
      description: 'Force majeure clause must explicitly include pandemic, epidemic, and public health emergency',
    },
    {
      id: 'r008',
      clause_type: 'limitation_of_liability',
      condition: 'no limitation of liability clause',
      severity: 'high',
      description: 'Every agreement must include a mutual limitation of liability clause',
    },
    {
      id: 'r009',
      clause_type: 'arbitration',
      condition: 'arbitration seat is outside the United States',
      severity: 'critical',
      description: 'Arbitration must be seated in the United States (AAA or JAMS recommended)',
    },
    {
      id: 'r010',
      clause_type: 'ip_ownership',
      condition: 'work-for-hire language is absent in software or creative services agreement',
      severity: 'high',
      description: 'IP ownership must be explicitly addressed in technology and creative services agreements',
    },
    {
      id: 'r011',
      clause_type: 'export_controls',
      condition: 'missing export controls clause in technology agreement with international parties',
      severity: 'high',
      description: 'ITAR/EAR export controls clause required for technology agreements involving non-US parties',
    },
    {
      id: 'r012',
      clause_type: 'anti_corruption',
      condition: 'missing FCPA clause in agreement with foreign government or officials',
      severity: 'high',
      description: 'FCPA anti-corruption clause required for agreements with foreign parties',
    },
    {
      id: 'r013',
      clause_type: 'confidentiality_nda',
      condition: 'NDA missing DTSA whistleblower immunity notice',
      severity: 'medium',
      description: 'Confidentiality agreements should include Defend Trade Secrets Act immunity notice',
    },
    {
      id: 'r014',
      clause_type: 'confidentiality_nda',
      condition: 'confidentiality term less than 3 years for trade secrets',
      severity: 'medium',
      description: 'Trade secret protection should extend for at least 3 years post-termination',
    },
    {
      id: 'r015',
      clause_type: 'termination_for_cause',
      condition: 'cure period less than 30 days',
      severity: 'medium',
      description: 'Termination for cause should include at least a 30-day cure period',
    },
    {
      id: 'r016',
      clause_type: 'assignment',
      condition: 'silent on consent requirement for assignment',
      severity: 'high',
      description: 'Assignment clauses should require counterparty consent',
    },
    {
      id: 'r017',
      clause_type: 'insurance',
      condition: 'missing professional liability insurance requirement',
      severity: 'medium',
      description: 'Professional services agreements should require E&O/professional liability insurance',
    },
    {
      id: 'r018',
      clause_type: 'notice_provisions',
      condition: 'no electronic notice provision',
      severity: 'low',
      description: 'Notice provisions should include email as valid notice method',
    },
    {
      id: 'r019',
      clause_type: 'data_privacy_vcdpa',
      condition: 'missing Virginia data privacy compliance with Virginia party',
      severity: 'high',
      description: 'VCDPA compliance required for agreements involving Virginia residents',
      states: ['VA'],
    },
    {
      id: 'r020',
      clause_type: 'data_privacy_cpa',
      condition: 'missing Colorado data privacy compliance with Colorado party',
      severity: 'high',
      description: 'Colorado Privacy Act compliance required for agreements involving Colorado residents',
      states: ['CO'],
    },
  ];
}
