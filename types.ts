
export interface BillingRecord {
  month: string;
  year: number;
  services: number;
  total: number;
}

export interface PayrollRecord {
  type: string;
  competence: string; // MM/YYYY
  value: number;
}

export interface ExtractionResult {
  companyName: string;
  cnpj: string;
  billing: BillingRecord[];
  payroll: PayrollRecord[];
}

export interface MonthlyStats {
  month: string;
  billing: number;
  payroll: number;
  factorR: number;
}
