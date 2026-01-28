
export interface BillingRecord {
  month: string;
  year: number;
  services: number;
  total: number;
}

export interface PayrollRecord {
  type: string; // 'Empregador Mensal', 'Folha Mensal', etc.
  category: 'pro-labore' | 'salario';
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
  payroll: number; // Total (Salarios + Pro-Labore)
  salaries: number;
  proLabore: number;
  fgts: number;
  factorR: number;
}
